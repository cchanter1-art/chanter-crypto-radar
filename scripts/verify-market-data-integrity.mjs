import assert from "node:assert/strict";
import { createServer } from "vite";

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
  key: (index) => [...store.keys()][index] ?? null,
  get length() {
    return store.size;
  },
};

const server = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

try {
  const integrity = await server.ssrLoadModule("/src/lib/marketDataIntegrity.ts");
  const backupApi = await server.ssrLoadModule("/src/lib/localDataBackup.ts");
  const riskApi = await server.ssrLoadModule("/src/lib/paperRiskController.ts");
  const futuresApi = await server.ssrLoadModule("/src/lib/futuresPaperEngine.ts");

  // 1. Valid mock candles produce a clean or good report
  const goodReport = integrity.runIntegrityCheckForMock(
    "BTCUSDT",
    "Trending Up",
    "2026-06-30T00:00:00.000Z",
  );
  assert.ok(goodReport, "Mock candle integrity check must produce a report");
  assert.equal(goodReport.symbol, "BTCUSDT");
  assert.equal(goodReport.timeframe, "15m");
  assert.equal(goodReport.source, "MOCK_LOCAL");
  assert.ok(goodReport.candleCount > 0, "Mock candles must have a positive count");
  assert.ok(goodReport.integrityScore >= 0 && goodReport.integrityScore <= 100);
  assert.equal(goodReport.checks.shapeValid, true, "Mock candles must pass shape validation");
  assert.equal(goodReport.checks.ohlcConsistent, true, "Mock candles must pass OHLC consistency");
  assert.equal(goodReport.checks.timestampOrdered, true, "Mock candles must be timestamp-ordered");
  assert.ok(
    goodReport.warnings.some((w) => w.includes("local mock")),
    "Mock/local data must include a warning",
  );

  // Deterministic
  const secondReport = integrity.runIntegrityCheckForMock(
    "BTCUSDT",
    "Trending Up",
    "2026-06-30T00:00:00.000Z",
  );
  assert.deepEqual(secondReport, goodReport, "Same inputs must produce identical reports");

  // 2. Missing candles produce gap warnings
  const candlesWithGap = integrity.wrapMockCandles(
    futuresApi.getMock15mCandles("ETHUSDT", "Neutral / Current Mock"),
    "ETHUSDT",
  );
  // Remove 5 candles to create gaps
  const gappedCandles = [...candlesWithGap.slice(0, 40), ...candlesWithGap.slice(45)];
  const gapReport = integrity.evaluateMarketDataIntegrity({
    candles: gappedCandles,
    symbol: "ETHUSDT",
    timeframe: "15m",
    source: "MOCK_LOCAL",
    now: "2026-06-30T00:00:00.000Z",
  });
  assert.ok(gapReport.gapCount > 0, "Removed candles must produce gaps");
  assert.ok(gapReport.checks.intervalValid === false, "Gaps must fail interval check");
  assert.ok(
    gapReport.warnings.some((w) => w.includes("gap")),
    "Gap warnings must be present",
  );

  // 3. Bad OHLC candles are blocked
  const badCandles = integrity.wrapMockCandles(
    futuresApi.getMock15mCandles("BTCUSDT", "Neutral / Current Mock"),
    "BTCUSDT",
  );
  badCandles[10] = {
    ...badCandles[10],
    open: 100,
    high: 50,
    low: 200,
    close: 120,
  };
  const badReport = integrity.evaluateMarketDataIntegrity({
    candles: badCandles,
    symbol: "BTCUSDT",
    timeframe: "15m",
    source: "MOCK_LOCAL",
    now: "2026-06-30T00:00:00.000Z",
  });
  assert.equal(badReport.checks.ohlcConsistent, false, "Bad OHLC must fail consistency check");
  assert.equal(badReport.readinessStatus, "blocked", "Bad OHLC must block readiness");
  assert.ok(badReport.anomalyCount > 0, "Bad OHLC must produce anomalies");

  // 4. Stale candles are flagged
  const staleCandles = integrity.wrapMockCandles(
    futuresApi.getMock15mCandles("SOLUSDT", "Trending Up"),
    "SOLUSDT",
  );
  const staleReport = integrity.evaluateMarketDataIntegrity({
    candles: staleCandles,
    symbol: "SOLUSDT",
    timeframe: "15m",
    source: "MOCK_LOCAL",
    now: "2026-07-15T00:00:00.000Z",
  });
  assert.equal(staleReport.freshnessStatus, "stale", "Old candles must be classified as stale");
  assert.equal(staleReport.checks.freshnessOk, false, "Stale candles must fail freshness check");
  assert.ok(
    staleReport.warnings.some((w) => w.includes("stale")),
    "Stale warning must be present",
  );

  // 5. Insufficient samples block backtest readiness
  const fewCandles = integrity.wrapMockCandles(
    futuresApi.getMock15mCandles("ADAUSDT", "Neutral / Current Mock").slice(0, 20),
    "ADAUSDT",
  );
  const fewReport = integrity.evaluateMarketDataIntegrity({
    candles: fewCandles,
    symbol: "ADAUSDT",
    timeframe: "15m",
    source: "MOCK_LOCAL",
    now: "2026-06-30T00:00:00.000Z",
  });
  assert.equal(fewReport.readinessFlags.backtest, false, "20 candles must not be enough for backtest");
  assert.equal(fewReport.readinessFlags.multiTimeframe, false, "20 candles must not be enough for multi-timeframe");
  assert.ok(
    fewReport.warnings.some((w) => w.includes("Insufficient")),
    "Insufficient sample warning must be present",
  );

  // 6. Mock/local data remains clearly labeled
  assert.equal(goodReport.source, "MOCK_LOCAL");
  assert.ok(
    goodReport.warnings.some((w) => w.includes("local mock")),
    "Mock data must have local mock warning",
  );
  assert.notEqual(goodReport.readinessStatus, "ready", "Mock data must not be 'ready' (must be ready_with_warnings)");

  // 7. History persistence
  const reports = Array.from({ length: 105 }, (_, index) =>
    integrity.runIntegrityCheckForMock(
      "BTCUSDT",
      "Trending Up",
      new Date(Date.parse("2026-06-30T00:00:00.000Z") + index * 1_000).toISOString(),
    ),
  );
  assert.ok(reports.every(Boolean));
  assert.equal(integrity.saveMarketDataIntegrityHistory(reports), true);
  assert.equal(
    integrity.loadMarketDataIntegrityHistory().length,
    integrity.MAX_MARKET_DATA_INTEGRITY_HISTORY,
    "Stored history must cap at 100",
  );
  assert.equal(
    integrity.loadLatestMarketDataIntegrity().id,
    reports[0].id,
    "Latest reader must return the first saved report",
  );

  // 8. Backup validation
  const backup = {
    version: backupApi.BACKUP_SCHEMA_VERSION,
    app: backupApi.BACKUP_APP_NAME,
    exportedAt: "2026-06-30T15:00:00.000Z",
    watchlist: [],
    paperTrades: [],
    priceAlerts: [],
    paperSignals: [],
    signalSensitivity: "Balanced",
    backtestRuns: [],
    riskControllerSettings: riskApi.DEFAULT_PAPER_RISK_SETTINGS,
    riskJournal: [],
    futuresPaperSettings: futuresApi.DEFAULT_FUTURES_PAPER_SETTINGS,
    futuresPaperPositions: [],
    futuresPaperHistory: [],
    futuresStrategyProfile: "Manual",
    futuresTestScenario: "Neutral / Current Mock",
    futuresStrategyBacktests: [],
    forwardTestData: { activeSession: null, completedSessions: [] },
    signalQualityHistory: [],
    marketDataIntegrityHistory: reports.slice(0, 5),
    settings: { displayName: "", email: "", priceAlerts: true, autoRefresh: false },
  };
  const parsed = backupApi.parseLocalDataBackup(JSON.stringify(backup));
  assert.equal(parsed.ok, true, "Valid integrity history must import");
  assert.equal(
    parsed.value.marketDataIntegrityHistory.length,
    5,
    "Imported integrity history must have 5 records",
  );

  // Invalid score
  const invalidScore = structuredClone(backup);
  invalidScore.marketDataIntegrityHistory = [structuredClone(reports[0])];
  invalidScore.marketDataIntegrityHistory[0].integrityScore = -1;
  assert.equal(
    backupApi.parseLocalDataBackup(JSON.stringify(invalidScore)).ok,
    false,
    "Invalid integrity score must be rejected",
  );

  // Invalid source
  const invalidSource = structuredClone(backup);
  invalidSource.marketDataIntegrityHistory = [structuredClone(reports[0])];
  invalidSource.marketDataIntegrityHistory[0].source = "HACKED";
  assert.equal(
    backupApi.parseLocalDataBackup(JSON.stringify(invalidSource)).ok,
    false,
    "Invalid source must be rejected",
  );

  // Legacy backup (no integrity field)
  const legacyBackup = { ...backup };
  delete legacyBackup.marketDataIntegrityHistory;
  const parsedLegacy = backupApi.parseLocalDataBackup(JSON.stringify(legacyBackup));
  assert.equal(parsedLegacy.ok, true, "Older backups without integrity field must import");
  assert.deepEqual(parsedLegacy.value.marketDataIntegrityHistory, []);

  // 9. Integrity factors
  const factors = integrity.getMarketDataIntegrityFactors(goodReport);
  assert.ok(factors.length > 0, "Must produce integrity factors");
  assert.ok(factors.some((f) => f.id === "data-integrity-score"), "Must include score factor");
  assert.ok(factors.some((f) => f.id === "data-freshness"), "Must include freshness factor");
  assert.ok(factors.some((f) => f.id === "mock-local-warning"), "Must include mock warning factor");

  // Null report produces empty factors
  assert.deepEqual(integrity.getMarketDataIntegrityFactors(null), []);

  // 10. Clear history
  assert.equal(integrity.clearMarketDataIntegrityHistory(), true);
  assert.equal(integrity.loadMarketDataIntegrityHistory().length, 0);
  assert.equal(integrity.loadLatestMarketDataIntegrity(), null);

  console.log(
    "Market Data Integrity verification passed: shape/OHLC/timestamp/gap/freshness/sample checks, anomaly detection, scoring, readiness, history, backup validation, and integrity factors.",
  );
} finally {
  await server.close();
}
