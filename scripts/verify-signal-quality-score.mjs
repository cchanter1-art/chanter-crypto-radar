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

  // 11. Evidence stack: no evidence available
  {
    const stack = quality.buildEvidenceStack({});
    assert.equal(stack.hasMarketIntegrity, false);
    assert.equal(stack.hasAutoObservations, false);
    assert.equal(stack.hasForwardTest, false);
    assert.equal(stack.hasBacktest, false);
    assert.equal(stack.hasRiskGate, false);
    assert.equal(stack.completeness, "missing");
    assert.ok(stack.missingFactors.length >= 5, "Should list all missing factors");
    assert.equal(stack.positiveFactors.length, 0);
    assert.equal(stack.negativeFactors.length, 0);
  }

  // 12. Evidence stack: good market integrity improves evidence status
  {
    const stack = quality.buildEvidenceStack({
      integrity: { integrityScore: 85, source: "LIVE_READ_ONLY", freshnessStatus: "current", readinessStatus: "ready" },
    });
    assert.equal(stack.hasMarketIntegrity, true);
    assert.equal(stack.integrityScore, 85);
    assert.ok(stack.positiveFactors.some((f) => f.includes("85/100")), "Should have positive integrity factor");
    assert.equal(stack.negativeFactors.length, 0, "Good integrity should have no negative factors");
    assert.equal(stack.completeness, "partial");
  }

  // 13. Evidence stack: stale/blocked/low integrity penalizes
  {
    const stack = quality.buildEvidenceStack({
      integrity: { integrityScore: 30, source: "LOCAL_MOCK", freshnessStatus: "stale", readinessStatus: "blocked" },
    });
    assert.ok(stack.negativeFactors.some((f) => f.includes("30/100")), "Low score should be negative");
    assert.ok(stack.negativeFactors.some((f) => f.includes("stale")), "Stale should be negative");
    assert.ok(stack.negativeFactors.some((f) => f.includes("blocked")), "Blocked should be negative");
    assert.ok(stack.negativeFactors.some((f) => f.includes("not live")), "Non-live source should be negative");
  }

  // 14. Evidence stack: auto observations appear but do not generate trades
  {
    const stack = quality.buildEvidenceStack({
      autoObs: { autoObservations: [{ id: "test" }], observationsCreated: 1, lastSymbol: "BTCUSDT", lastScore: 75 },
    });
    assert.equal(stack.hasAutoObservations, true);
    assert.equal(stack.autoObsCount, 1);
    assert.equal(stack.autoObsLatestSymbol, "BTCUSDT");
    assert.ok(stack.positiveFactors.some((f) => f.includes("1 recorded")), "Should have positive auto obs factor");
    // Verify no trade/position/order fields on stack
    assert.equal(stack.tradeId, undefined);
    assert.equal(stack.positionId, undefined);
    assert.equal(stack.orderId, undefined);
  }

  // 15. Evidence stack: forward-test context appears when available
  {
    const stack = quality.buildEvidenceStack({
      forwardTest: { observations: [{ id: "obs1" }, { id: "obs2" }], latestDirection: "LONG" },
    });
    assert.equal(stack.hasForwardTest, true);
    assert.equal(stack.forwardObsCount, 2);
    assert.equal(stack.forwardLatestDirection, "LONG");
  }

  // 16. Evidence stack: backtest context appears when available
  {
    const stack = quality.buildEvidenceStack({
      backtest: { returnPercent: 12.5, winRate: 60 },
    });
    assert.equal(stack.hasBacktest, true);
    assert.equal(stack.backtestReturn, 12.5);
    assert.ok(stack.positiveFactors.some((f) => f.includes("12.50%")), "Positive backtest should be positive factor");
  }

  // 17. Evidence stack: negative backtest return is a negative factor
  {
    const stack = quality.buildEvidenceStack({
      backtest: { returnPercent: -5.0, winRate: 30 },
    });
    assert.ok(stack.negativeFactors.some((f) => f.includes("-5.00%")), "Negative return should be negative factor");
  }

  // 18. Evidence stack: complete evidence yields "complete" completeness
  {
    const stack = quality.buildEvidenceStack({
      integrity: { integrityScore: 80, source: "LIVE_READ_ONLY", freshnessStatus: "current", readinessStatus: "ready" },
      autoObs: { autoObservations: [{ id: "a" }], observationsCreated: 1, lastSymbol: "BTCUSDT", lastScore: 80 },
      forwardTest: { observations: [{ id: "f" }], latestDirection: "LONG" },
      backtest: { returnPercent: 10, winRate: 55 },
      riskGate: { riskStatus: "WAIT" },
    });
    assert.equal(stack.completeness, "complete");
    assert.equal(stack.missingFactors.length, 0);
  }

  // 19. Evidence stack: malformed legacy localStorage does not crash
  {
    // buildEvidenceStack with null/undefined inputs should not throw
    const stack = quality.buildEvidenceStack({
      integrity: null,
      autoObs: null,
      forwardTest: null,
      backtest: null,
      riskGate: null,
    });
    assert.equal(stack.completeness, "missing");
    assert.equal(stack.positiveFactors.length, 0);
  }

  // 20. Evidence stack: no paper positions created
  {
    store.clear();
    quality.buildEvidenceStack({
      integrity: { integrityScore: 90, source: "LIVE_READ_ONLY", freshnessStatus: "current", readinessStatus: "ready" },
      autoObs: { autoObservations: [{ id: "x" }], observationsCreated: 1, lastSymbol: "ETHUSDT", lastScore: 90 },
    });
    const positions = futuresApi.loadFuturesPaperPositions();
    assert.equal(positions.length, 0, "Evidence stack must not create paper positions");
    const trades = futuresApi.loadFuturesPaperHistory();
    assert.equal(trades.length, 0, "Evidence stack must not create paper trades");
  }

  // 21. Import/export backward compatibility remains safe
  {
    // Existing records without evidence stack should still load
    const records = quality.loadSignalQualityHistory();
    for (const r of records) {
      // evidenceStack is not stored on records, so this is just verifying records load
      assert.ok(r.id, "Record must have id");
      assert.ok(r.score !== undefined, "Record must have score");
    }
  }

  console.log(
    "Signal Quality Score verification passed: deterministic scoring, safety caps, evidence effects, history, backup validation, latest-score reader, evidence stack (no evidence, good/stale integrity, auto observations, forward-test, backtest, complete/missing, backward compat, no trades, no positions).",
  );
} finally {
  await server.close();
}
