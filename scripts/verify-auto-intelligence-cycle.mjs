import assert from "node:assert/strict";
import { createServer } from "vite";

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
  key: (index) => [...store.keys()][index] ?? null,
  get length() { return store.size; },
};

const server = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

try {
  const cycle = await server.ssrLoadModule("/src/lib/autoIntelligenceCycle.ts");
  const integrity = await server.ssrLoadModule("/src/lib/marketDataIntegrity.ts");
  const backupApi = await server.ssrLoadModule("/src/lib/localDataBackup.ts");
  const riskApi = await server.ssrLoadModule("/src/lib/paperRiskController.ts");
  const futuresApi = await server.ssrLoadModule("/src/lib/futuresPaperEngine.ts");

  store.clear();

  // 1. Initial state
  const initialState = cycle.getAutoIntelligenceCycleState();
  assert.equal(initialState.enabled, false);
  assert.equal(initialState.lastRunAt, null);
  assert.equal(initialState.lastStatus, null);
  assert.equal(initialState.history.length, 0);
  assert.equal(cycle.isAutoIntelligenceCycleActive(), false);

  // 2. Start cycle
  assert.equal(cycle.startAutoIntelligenceCycle(), true);
  assert.equal(cycle.isAutoIntelligenceCycleActive(), true);
  assert.equal(cycle.getAutoIntelligenceCycleState().enabled, true);

  // 3. Duplicate start
  assert.equal(cycle.startAutoIntelligenceCycle(), false);
  assert.equal(cycle.isAutoIntelligenceCycleActive(), true);

  // 4. Stop cycle
  assert.equal(cycle.stopAutoIntelligenceCycle(), true);
  assert.equal(cycle.isAutoIntelligenceCycleActive(), false);
  assert.equal(cycle.getAutoIntelligenceCycleState().enabled, false);

  // 5. Start again after stop
  assert.equal(cycle.startAutoIntelligenceCycle(), true);
  cycle.stopAutoIntelligenceCycle();

  // 6. Run tick with mocked fetch success
  const validRaw = Array.from({ length: 100 }, (_, i) => {
    const openTime = 1719504000000 + i * 900000;
    const price = 60000 + i * 10;
    return [openTime, String(price), String(price + 200), String(price - 100), String(price + 50), String(100 + i), openTime + 900000];
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true, status: 200, statusText: "OK",
    json: async () => validRaw,
  });

  try {
    const tickResult = await cycle.runAutoIntelligenceTick();
    assert.equal(tickResult.ok, true);
    const ts = cycle.getAutoIntelligenceCycleState();
    assert.equal(ts.lastStatus, "passed");
    assert.ok(ts.lastRunAt);
    assert.ok(ts.lastSymbol);
    assert.ok(ts.lastScore !== null);
    assert.ok(ts.lastReadiness !== null);
    assert.ok(ts.lastSource !== null);
    assert.equal(ts.history.length, 1);
    assert.equal(ts.history[0].status, "passed");
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 7. No positions opened by tick
  assert.equal(futuresApi.loadFuturesPaperPositions().length, 0);
  // 8. No trades created by tick
  assert.equal(futuresApi.loadFuturesPaperHistory().length, 0);

  // 9. Failed fetch records error
  globalThis.fetch = async () => ({
    ok: false, status: 451, statusText: "Unavailable",
    json: async () => ({}),
  });

  try {
    const failResult = await cycle.runAutoIntelligenceTick();
    assert.equal(failResult.ok, false);
    assert.ok(failResult.error);
    const fs2 = cycle.getAutoIntelligenceCycleState();
    assert.equal(fs2.lastStatus, "failed");
    assert.ok(fs2.lastError);
    assert.ok(fs2.lastRunAt);
    assert.equal(fs2.history.length, 2);
    assert.equal(fs2.history[0].status, "failed");
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 10. Tick lock prevents concurrent runs
  globalThis.fetch = async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { ok: true, status: 200, statusText: "OK", json: async () => validRaw };
  };

  try {
    const [r1, r2] = await Promise.all([
      cycle.runAutoIntelligenceTick(),
      cycle.runAutoIntelligenceTick(),
    ]);
    assert.ok(
      (r1.ok === false && r1.error && r1.error.includes("already in progress")) ||
      (r2.ok === false && r2.error && r2.error.includes("already in progress")),
      "One tick must be blocked by lock",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 11. Clear history
  cycle.clearAutoIntelligenceCycleHistory();
  const cs = cycle.getAutoIntelligenceCycleState();
  assert.equal(cs.lastRunAt, null);
  assert.equal(cs.lastStatus, null);
  assert.equal(cs.history.length, 0);

  // 12. Normalize validation
  const valid = cycle.getAutoIntelligenceCycleState();
  assert.ok(cycle.normalizeAutoIntelligenceCycleState(valid));
  assert.equal(cycle.normalizeAutoIntelligenceCycleState({ enabled: "yes" }), null);
  assert.equal(cycle.normalizeAutoIntelligenceCycleState(null), null);
  assert.equal(cycle.normalizeAutoIntelligenceCycleState({ enabled: true, intervalMs: -1 }), null);

  // 13. Backup backward compat (no auto cycle field)
  const backup = {
    version: backupApi.BACKUP_SCHEMA_VERSION,
    app: backupApi.BACKUP_APP_NAME,
    exportedAt: "2026-07-01T00:00:00.000Z",
    watchlist: [], paperTrades: [], priceAlerts: [], paperSignals: [],
    signalSensitivity: "Balanced", backtestRuns: [],
    riskControllerSettings: riskApi.DEFAULT_PAPER_RISK_SETTINGS,
    riskJournal: [],
    futuresPaperSettings: futuresApi.DEFAULT_FUTURES_PAPER_SETTINGS,
    futuresPaperPositions: [], futuresPaperHistory: [],
    futuresStrategyProfile: "Manual",
    futuresTestScenario: "Neutral / Current Mock",
    futuresStrategyBacktests: [],
    forwardTestData: { activeSession: null, completedSessions: [] },
    signalQualityHistory: [], marketDataIntegrityHistory: [],
    settings: { displayName: "", email: "", priceAlerts: true, autoRefresh: false },
  };

  const parsedLegacy = backupApi.parseLocalDataBackup(JSON.stringify(backup));
  assert.equal(parsedLegacy.ok, true, "Legacy backup must import");

  // 14. Backup with auto cycle state
  const autoState = cycle.getAutoIntelligenceCycleState();
  const backupWith = { ...backup, autoIntelligenceCycleState: autoState };
  const parsedWith = backupApi.parseLocalDataBackup(JSON.stringify(backupWith));
  assert.equal(parsedWith.ok, true, "Backup with auto cycle must import");
  assert.equal(parsedWith.value.autoIntelligenceCycleState.enabled, false, "Imported cycle must be disabled");

  // 15. Invalid auto cycle rejects backup
  const backupBad = { ...backup, autoIntelligenceCycleState: { enabled: "yes" } };
  assert.equal(backupApi.parseLocalDataBackup(JSON.stringify(backupBad)).ok, false, "Invalid auto cycle must reject");

  // 16. No execution functions in module
  assert.equal(typeof cycle.startAutoIntelligenceCycle, "function");
  assert.equal(typeof cycle.stopAutoIntelligenceCycle, "function");
  assert.equal(typeof cycle.runAutoIntelligenceTick, "function");
  assert.equal(cycle.createPosition, undefined);
  assert.equal(cycle.placeOrder, undefined);
  assert.equal(cycle.openPosition, undefined);

  console.log(
    "Auto Intelligence Cycle verification passed: start/stop, duplicate prevention, tick lock, " +
    "mocked fetch success/failure, no positions opened, no trades created, backup validation, " +
    "backward compatibility, and safety verification.",
  );
} finally {
  await server.close();
}
