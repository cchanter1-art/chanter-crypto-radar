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
  const quality = await server.ssrLoadModule("/src/lib/signalQualityScore.ts");
  const backupApi = await server.ssrLoadModule("/src/lib/localDataBackup.ts");
  const riskApi = await server.ssrLoadModule("/src/lib/paperRiskController.ts");
  const futuresApi = await server.ssrLoadModule("/src/lib/futuresPaperEngine.ts");

  const noBacktest = {
    status: "none",
    runId: null,
    tradesTaken: 0,
    winRate: 0,
    netPnl: 0,
    maxDrawdown: 0,
    profitFactor: null,
  };
  const positiveBacktest = {
    status: "positive",
    runId: "positive-backtest",
    tradesTaken: 8,
    winRate: 62.5,
    netPnl: 240,
    maxDrawdown: 4,
    profitFactor: 1.8,
  };
  const noForward = {
    status: "none",
    observationCount: 0,
    actionableCount: 0,
    approvedCount: 0,
    blockedCount: 0,
    waitCount: 0,
    directionConsistencyPercent: 0,
  };
  const consistentForward = {
    status: "consistent",
    observationCount: 6,
    actionableCount: 6,
    approvedCount: 5,
    blockedCount: 1,
    waitCount: 0,
    directionConsistencyPercent: 83.33,
  };
  const baseInput = {
    profile: "Trend Follow",
    scenario: "Trending Up",
    symbol: "BTCUSDT",
    leverage: 2,
    direction: "LONG",
    confidence: "High",
    stopLossPercent: 2,
    takeProfitPercent: 4,
    riskStatus: "APPROVED",
    riskReason: "Paper candidate passed the existing risk preview.",
    riskRewardRatio: 2,
    backtestEvidence: positiveBacktest,
    forwardEvidence: consistentForward,
    dataFreshness: "fresh",
    localMockOnly: true,
  };

  const first = quality.evaluateSignalQuality(baseInput);
  const second = quality.evaluateSignalQuality(structuredClone(baseInput));
  assert.deepEqual(second, first, "Identical inputs must produce identical score output");
  assert.ok(Number.isInteger(first.score) && first.score >= 0 && first.score <= 100);

  const waitEvaluation = quality.evaluateSignalQuality({
    ...baseInput,
    direction: "WAIT",
    confidence: "Low",
    riskStatus: "WAIT",
    riskReason: "Strategy returned WAIT.",
    riskRewardRatio: 0,
  });
  assert.ok(waitEvaluation.score <= 45, "WAIT cannot score above 45");

  const blockedEvaluation = quality.evaluateSignalQuality({
    ...baseInput,
    riskStatus: "BLOCKED",
    riskReason: "Risk Engine blocked the candidate.",
  });
  assert.ok(blockedEvaluation.score <= 35, "BLOCKED cannot score above 35");

  const missingStop = quality.evaluateSignalQuality({
    ...baseInput,
    stopLossPercent: 0,
  });
  const missingStopFactor = missingStop.factors.find((item) => item.id === "stop-loss");
  assert.equal(missingStopFactor.pointsImpact, -30);
  assert.ok(missingStop.score <= 50, "Missing stop-loss must apply a severe score cap");

  const fiveTimes = quality.evaluateSignalQuality({ ...baseInput, leverage: 5 });
  const leverageFactor = fiveTimes.factors.find((item) => item.id === "leverage");
  assert.ok(leverageFactor.pointsImpact < 0, "5x must always apply a leverage penalty");

  const moderateInput = {
    ...baseInput,
    scenario: "Neutral / Current Mock",
    confidence: "Medium",
    leverage: 3,
    riskRewardRatio: 1.5,
    dataFreshness: "unknown",
    backtestEvidence: noBacktest,
    forwardEvidence: noForward,
  };
  const noEvidenceEvaluation = quality.evaluateSignalQuality(moderateInput);
  const backtestSupported = quality.evaluateSignalQuality({
    ...moderateInput,
    backtestEvidence: positiveBacktest,
  });
  assert.ok(
    backtestSupported.score > noEvidenceEvaluation.score,
    "Positive backtest evidence should improve an unblocked score",
  );
  const forwardSupported = quality.evaluateSignalQuality({
    ...moderateInput,
    forwardEvidence: consistentForward,
  });
  assert.ok(
    forwardSupported.score > noEvidenceEvaluation.score,
    "Consistent forward evidence should improve an unblocked score",
  );
  const blockedWithEvidence = quality.evaluateSignalQuality({
    ...moderateInput,
    riskStatus: "BLOCKED",
    riskReason: "Risk Engine remains final.",
    backtestEvidence: positiveBacktest,
    forwardEvidence: consistentForward,
  });
  assert.ok(blockedWithEvidence.score <= 35, "Evidence cannot override a risk block");

  const createdAt = "2026-06-30T14:00:00.000Z";
  const baseRecord = quality.createSignalQualityRecord(baseInput, createdAt);
  assert.ok(baseRecord, "A valid score record should be created");
  const records = Array.from({ length: 105 }, (_, index) =>
    quality.createSignalQualityRecord(
      baseInput,
      new Date(Date.parse(createdAt) + index * 1_000).toISOString(),
    ));
  assert.ok(records.every(Boolean));
  assert.equal(quality.saveSignalQualityHistory(records), true);
  assert.equal(
    quality.loadSignalQualityHistory().length,
    quality.MAX_SIGNAL_QUALITY_HISTORY,
    "Stored history must cap at 100",
  );
  assert.equal(
    quality.loadLatestSignalQualityScore().id,
    records[0].id,
    "Command Center latest-score reader must return the first saved record",
  );

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
    signalQualityHistory: records,
    settings: { displayName: "", email: "", priceAlerts: true, autoRefresh: false },
  };
  const parsed = backupApi.parseLocalDataBackup(JSON.stringify(backup));
  assert.equal(parsed.ok, true, "Valid score history must import");
  assert.equal(
    parsed.value.signalQualityHistory.length,
    quality.MAX_SIGNAL_QUALITY_HISTORY,
    "Imported score history must cap at 100",
  );

  const invalidLowScore = structuredClone(backup);
  invalidLowScore.signalQualityHistory = [structuredClone(baseRecord)];
  invalidLowScore.signalQualityHistory[0].score = -1;
  assert.equal(backupApi.parseLocalDataBackup(JSON.stringify(invalidLowScore)).ok, false);

  const invalidHighScore = structuredClone(backup);
  invalidHighScore.signalQualityHistory = [structuredClone(baseRecord)];
  invalidHighScore.signalQualityHistory[0].score = 101;
  assert.equal(backupApi.parseLocalDataBackup(JSON.stringify(invalidHighScore)).ok, false);

  const invalidLeverage = structuredClone(backup);
  invalidLeverage.signalQualityHistory = [structuredClone(baseRecord)];
  invalidLeverage.signalQualityHistory[0].input.leverage = 10;
  assert.equal(backupApi.parseLocalDataBackup(JSON.stringify(invalidLeverage)).ok, false);

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
    { activeSession: null, completedSessions: [] },
    [baseRecord],
  );
  assert.equal(exported.signalQualityHistory.length, 1);

  const legacyBackup = { ...backup };
  delete legacyBackup.signalQualityHistory;
  const parsedLegacy = backupApi.parseLocalDataBackup(JSON.stringify(legacyBackup));
  assert.equal(parsedLegacy.ok, true, "Older schema-v1 backups must remain compatible");
  assert.deepEqual(parsedLegacy.value.signalQualityHistory, []);

  console.log(
    "Signal Quality Score verification passed: deterministic scoring, safety caps, evidence effects, history, backup validation, and latest-score reader.",
  );
} finally {
  await server.close();
}
