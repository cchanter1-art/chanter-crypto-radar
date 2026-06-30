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
  const forward = await server.ssrLoadModule("/src/lib/forwardTestSession.ts");
  const backupApi = await server.ssrLoadModule("/src/lib/localDataBackup.ts");
  const riskApi = await server.ssrLoadModule("/src/lib/paperRiskController.ts");
  const futuresApi = await server.ssrLoadModule("/src/lib/futuresPaperEngine.ts");

  const emptyData = { activeSession: null, completedSessions: [] };
  const startedAt = "2026-06-30T10:00:00.000Z";
  const observedAt = "2026-06-30T10:05:00.000Z";
  const baseContext = {
    timestamp: observedAt,
    userNote: "Manual validation tick",
    paperPortfolioValue: 10_000,
    openPositions: [],
    futuresHistory: [],
    futuresSettings: futuresApi.DEFAULT_FUTURES_PAPER_SETTINGS,
    riskSettings: riskApi.DEFAULT_PAPER_RISK_SETTINGS,
  };

  const started = forward.startForwardTestSession(
    emptyData,
    {
      profile: "Trend Follow",
      scenario: "Trending Up",
      symbol: "BTCUSDT",
      leverage: 2,
      notes: "Deterministic session",
    },
    startedAt,
  );
  assert.equal(started.ok, true, "A valid session must start");
  assert.equal(started.data.activeSession.status, "ACTIVE");
  assert.equal(started.data.completedSessions.length, 0);

  const duplicateStart = forward.startForwardTestSession(
    started.data,
    forward.DEFAULT_FORWARD_TEST_CONFIG,
    startedAt,
  );
  assert.equal(duplicateStart.ok, false, "A second active session must be rejected");

  const firstObservation = forward.addForwardTestObservation(started.data, baseContext);
  const repeatedObservation = forward.addForwardTestObservation(started.data, baseContext);
  assert.equal(firstObservation.ok, true);
  assert.equal(repeatedObservation.ok, true);
  assert.deepEqual(
    repeatedObservation.observation,
    firstObservation.observation,
    "The same session and tick inputs must create the same observation",
  );
  assert.equal(firstObservation.data.activeSession.observations.length, 1);
  assert.equal(firstObservation.observation.riskStatus, "APPROVED");
  assert.equal(forward.saveForwardTestData(firstObservation.data), true);
  const persistedObservationData = forward.loadForwardTestData();
  assert.equal(persistedObservationData.activeSession.observations.length, 1);
  assert.equal(
    forward.getLatestForwardTestObservation(persistedObservationData)?.id,
    firstObservation.observation.id,
    "The Command Center storage reader must return the persisted latest observation",
  );

  const stopped = forward.stopForwardTestSession(
    firstObservation.data,
    "2026-06-30T10:10:00.000Z",
  );
  assert.equal(stopped.ok, true, "An active session must stop");
  assert.equal(stopped.data.activeSession, null);
  assert.equal(stopped.data.completedSessions.length, 1);
  assert.equal(stopped.session.status, "COMPLETED");

  const invalidLeverage = forward.startForwardTestSession(
    emptyData,
    { ...forward.DEFAULT_FORWARD_TEST_CONFIG, leverage: 10 },
    startedAt,
  );
  assert.equal(invalidLeverage.ok, false, "Leverage above 5x must be rejected");

  const waitSession = forward.startForwardTestSession(
    emptyData,
    {
      profile: "Trend Follow",
      scenario: "Choppy / No Trade",
      symbol: "BTCUSDT",
      leverage: 2,
      notes: "WAIT verification",
    },
    startedAt,
  );
  assert.equal(waitSession.ok, true);
  const positionsSentinel = JSON.stringify([{ id: "existing-position-sentinel" }]);
  localStorage.setItem(futuresApi.FUTURES_PAPER_POSITIONS_STORAGE_KEY, positionsSentinel);
  const waitObservation = forward.addForwardTestObservation(waitSession.data, baseContext);
  assert.equal(waitObservation.ok, true);
  assert.equal(waitObservation.observation.direction, "WAIT");
  assert.equal(waitObservation.observation.riskStatus, "WAIT");
  assert.equal(
    localStorage.getItem(futuresApi.FUTURES_PAPER_POSITIONS_STORAGE_KEY),
    positionsSentinel,
    "WAIT must not modify paper positions",
  );

  const existingPosition = {
    id: "existing-btc-position",
    symbol: "BTCUSDT",
    scenario: "Trending Up",
    direction: "LONG",
    entryPrice: 100,
    marginAmount: 100,
    leverage: 1,
    stopLossPercent: 2,
    takeProfitPercent: 4,
    strategyReason: "Existing paper position used only to exercise the risk gate.",
    timeframe: "15m",
    marginMode: "isolated",
    openedAt: "2026-06-30T09:00:00.000Z",
  };
  const blockedObservation = forward.addForwardTestObservation(started.data, {
    ...baseContext,
    openPositions: [existingPosition],
  });
  assert.equal(blockedObservation.ok, true);
  assert.equal(blockedObservation.observation.riskStatus, "BLOCKED");
  assert.equal(blockedObservation.data.activeSession.observations.length, 1);
  assert.equal(
    localStorage.getItem(futuresApi.FUTURES_PAPER_POSITIONS_STORAGE_KEY),
    positionsSentinel,
    "A blocked observation must be stored without executing a position",
  );

  const observationTemplate = firstObservation.observation;
  const oversizedActiveSession = {
    ...started.session,
    observations: Array.from(
      { length: forward.MAX_FORWARD_TEST_OBSERVATIONS + 5 },
      (_, index) => ({
        ...observationTemplate,
        id: `${observationTemplate.id}-${index}`,
        timestamp: new Date(Date.parse(observedAt) + index * 1_000).toISOString(),
      }),
    ),
  };
  assert.equal(
    forward.saveForwardTestData({ activeSession: oversizedActiveSession, completedSessions: [] }),
    true,
  );
  assert.equal(
    forward.loadForwardTestData().activeSession.observations.length,
    forward.MAX_FORWARD_TEST_OBSERVATIONS,
    "Observation history must cap at 200",
  );

  const completedTemplate = stopped.session;
  const oversizedCompletedHistory = Array.from(
    { length: forward.MAX_FORWARD_TEST_COMPLETED_SESSIONS + 5 },
    (_, index) => ({
      ...completedTemplate,
      id: `${completedTemplate.id}-${index}`,
      startedAt: new Date(Date.parse(startedAt) + index * 60_000).toISOString(),
      stoppedAt: new Date(Date.parse(startedAt) + index * 60_000 + 30_000).toISOString(),
      observations: [],
    }),
  );
  assert.equal(
    forward.saveForwardTestData({ activeSession: null, completedSessions: oversizedCompletedHistory }),
    true,
  );
  assert.equal(
    forward.loadForwardTestData().completedSessions.length,
    forward.MAX_FORWARD_TEST_COMPLETED_SESSIONS,
    "Completed session history must cap at 20",
  );

  const summary = forward.getForwardTestSummary(firstObservation.data.activeSession);
  assert.equal(summary.totalObservations, 1);
  assert.equal(summary.actionableSignals, 1);
  assert.equal(summary.approvedCount, 1);
  assert.equal(summary.latestObservationTime, observedAt);
  assert.equal(
    forward.getLatestForwardTestObservation(firstObservation.data)?.id,
    firstObservation.observation.id,
    "Command Center helper must return the latest observation",
  );

  const backup = {
    version: backupApi.BACKUP_SCHEMA_VERSION,
    app: backupApi.BACKUP_APP_NAME,
    exportedAt: "2026-06-30T12:00:00.000Z",
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
    forwardTestData: firstObservation.data,
    settings: { displayName: "", email: "", priceAlerts: true, autoRefresh: false },
  };
  const parsed = backupApi.parseLocalDataBackup(JSON.stringify(backup));
  assert.equal(parsed.ok, true, "Valid forward test data must import");
  assert.equal(parsed.value.forwardTestData.activeSession.observations.length, 1);

  const oversizedObservationBackup = structuredClone(backup);
  oversizedObservationBackup.forwardTestData = {
    activeSession: oversizedActiveSession,
    completedSessions: [],
  };
  const parsedOversizedObservations = backupApi.parseLocalDataBackup(
    JSON.stringify(oversizedObservationBackup),
  );
  assert.equal(parsedOversizedObservations.ok, true);
  assert.equal(
    parsedOversizedObservations.value.forwardTestData.activeSession.observations.length,
    forward.MAX_FORWARD_TEST_OBSERVATIONS,
    "Imported observations must cap at 200",
  );

  const oversizedSessionBackup = structuredClone(backup);
  oversizedSessionBackup.forwardTestData = {
    activeSession: null,
    completedSessions: oversizedCompletedHistory,
  };
  const parsedOversizedSessions = backupApi.parseLocalDataBackup(
    JSON.stringify(oversizedSessionBackup),
  );
  assert.equal(parsedOversizedSessions.ok, true);
  assert.equal(
    parsedOversizedSessions.value.forwardTestData.completedSessions.length,
    forward.MAX_FORWARD_TEST_COMPLETED_SESSIONS,
    "Imported completed sessions must cap at 20",
  );

  const exported = backupApi.createLocalDataBackup(
    { watchlist: [], trades: [], alerts: [], settings: backup.settings },
    [],
    [],
    riskApi.DEFAULT_PAPER_RISK_SETTINGS,
    [],
    "Balanced",
    futuresApi.DEFAULT_FUTURES_PAPER_SETTINGS,
    [],
    [],
    "Manual",
    "Neutral / Current Mock",
    [],
    firstObservation.data,
  );
  assert.equal(exported.forwardTestData.activeSession.observations.length, 1);

  const invalidBackupLeverage = structuredClone(backup);
  invalidBackupLeverage.forwardTestData.activeSession.config.leverage = 10;
  invalidBackupLeverage.forwardTestData.activeSession.observations[0].leverage = 10;
  assert.equal(
    backupApi.parseLocalDataBackup(JSON.stringify(invalidBackupLeverage)).ok,
    false,
    "Imported forward test leverage above 5x must be rejected",
  );

  const malformedObservation = structuredClone(backup);
  delete malformedObservation.forwardTestData.activeSession.observations[0].riskReason;
  assert.equal(
    backupApi.parseLocalDataBackup(JSON.stringify(malformedObservation)).ok,
    false,
    "Malformed forward test observations must be rejected",
  );

  const legacyBackup = { ...backup };
  delete legacyBackup.forwardTestData;
  const parsedLegacy = backupApi.parseLocalDataBackup(JSON.stringify(legacyBackup));
  assert.equal(parsedLegacy.ok, true, "Older schema-v1 backups must remain compatible");
  assert.deepEqual(parsedLegacy.value.forwardTestData, emptyData);

  console.log(
    "Forward test session verification passed: start/stop, deterministic manual tick, WAIT, blocked storage, caps, backup validation, and summary helpers.",
  );
} finally {
  await server.close();
}
