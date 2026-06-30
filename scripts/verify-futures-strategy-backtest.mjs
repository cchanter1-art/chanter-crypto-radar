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
  const engine = await server.ssrLoadModule("/src/lib/futuresStrategyBacktest.ts");
  const backupApi = await server.ssrLoadModule("/src/lib/localDataBackup.ts");
  const riskApi = await server.ssrLoadModule("/src/lib/paperRiskController.ts");
  const futuresApi = await server.ssrLoadModule("/src/lib/futuresPaperEngine.ts");

  const scenarios = [
    "Neutral / Current Mock",
    "Trending Up",
    "Trending Down",
    "Breakout Up",
    "Breakout Down",
    "Mean Reversion Oversold",
    "Mean Reversion Overbought",
    "Choppy / No Trade",
  ];

  for (const profile of engine.FUTURES_BACKTEST_PROFILES) {
    for (const scenario of scenarios) {
      const config = {
        ...engine.DEFAULT_FUTURES_STRATEGY_BACKTEST_CONFIG,
        profile,
        scenario,
      };
      const first = engine.runFuturesStrategyBacktest(config);
      const second = engine.runFuturesStrategyBacktest(config);
      assert.equal(first.ok, true, `${profile} / ${scenario} should produce a result`);
      assert.equal(second.ok, true, `${profile} / ${scenario} should produce a repeat result`);
      assert.deepEqual(
        second.value,
        first.value,
        `${profile} / ${scenario} must be deterministic`,
      );
    }
  }

  const waitResult = engine.runFuturesStrategyBacktest({
    ...engine.DEFAULT_FUTURES_STRATEGY_BACKTEST_CONFIG,
    profile: "Trend Follow",
    scenario: "Choppy / No Trade",
  });
  assert.equal(waitResult.ok, true);
  assert.equal(waitResult.value.metrics.tradesTaken, 0, "WAIT must create no trade");
  assert.ok(waitResult.value.metrics.waitCount > 0, "WAIT candidates should be recorded");
  assert.ok(
    waitResult.value.events.every(
      (event) => event.exitReason !== "WAIT" || event.candidateStatus === "IGNORED",
    ),
    "WAIT candidates must be ignored",
  );

  const riskBlockedResult = engine.runFuturesStrategyBacktest({
    ...engine.DEFAULT_FUTURES_STRATEGY_BACKTEST_CONFIG,
    profile: "Trend Follow",
    scenario: "Trending Up",
    riskSettings: {
      ...engine.DEFAULT_FUTURES_STRATEGY_BACKTEST_CONFIG.riskSettings,
      maxTradeSizePercent: 1,
    },
  });
  assert.equal(riskBlockedResult.ok, true);
  assert.equal(riskBlockedResult.value.metrics.tradesTaken, 0);
  assert.ok(riskBlockedResult.value.metrics.riskBlockedCount > 0);
  assert.equal(riskBlockedResult.value.interpretation, "Risk blocked");
  assert.ok(
    riskBlockedResult.value.events.every(
      (event) => event.exitReason === "WAIT" || event.candidateStatus === "BLOCKED",
    ),
    "Actionable candidates rejected by the Risk Controller must be recorded as blocked",
  );

  const invalidLeverage = engine.runFuturesStrategyBacktest({
    ...engine.DEFAULT_FUTURES_STRATEGY_BACKTEST_CONFIG,
    leverage: 10,
  });
  assert.equal(invalidLeverage.ok, false, "Leverage above 5x must be rejected");

  const noCosts = engine.runFuturesStrategyBacktest({
    ...engine.DEFAULT_FUTURES_STRATEGY_BACKTEST_CONFIG,
    profile: "Trend Follow",
    scenario: "Trending Up",
    feePercent: 0,
    slippagePercent: 0,
  });
  const withCosts = engine.runFuturesStrategyBacktest({
    ...engine.DEFAULT_FUTURES_STRATEGY_BACKTEST_CONFIG,
    profile: "Trend Follow",
    scenario: "Trending Up",
    feePercent: 0.05,
    slippagePercent: 0.05,
  });
  assert.equal(noCosts.ok, true);
  assert.equal(withCosts.ok, true);
  assert.ok(
    withCosts.value.metrics.netPnl < noCosts.value.metrics.netPnl,
    "Fees and slippage must reduce net P/L when trades are taken",
  );

  const baseRun = withCosts.value;
  const twentyFiveRuns = Array.from({ length: 25 }, (_, index) => ({
    ...baseRun,
    id: `${baseRun.id}-${index}`,
  }));
  assert.equal(engine.saveFuturesStrategyBacktestHistory(twentyFiveRuns), true);
  assert.equal(
    engine.loadFuturesStrategyBacktestHistory().length,
    engine.MAX_FUTURES_STRATEGY_BACKTEST_HISTORY,
    "Stored history must cap at 20",
  );
  assert.equal(
    engine.loadLatestFuturesStrategyBacktest()?.id,
    twentyFiveRuns[0].id,
    "Latest result must mirror the first saved history record",
  );

  const backup = {
    version: backupApi.BACKUP_SCHEMA_VERSION,
    app: backupApi.BACKUP_APP_NAME,
    exportedAt: "2026-06-30T00:00:00.000Z",
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
    futuresStrategyBacktests: twentyFiveRuns,
    settings: { displayName: "", email: "", priceAlerts: true, autoRefresh: false },
  };

  const parsed = backupApi.parseLocalDataBackup(JSON.stringify(backup));
  assert.equal(parsed.ok, true, "Valid futures strategy backtests should import");
  assert.equal(
    parsed.value.futuresStrategyBacktests.length,
    engine.MAX_FUTURES_STRATEGY_BACKTEST_HISTORY,
    "Imported history must cap at 20",
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
    [baseRun],
  );
  assert.equal(exported.futuresStrategyBacktests.length, 1);
  assert.equal(exported.futuresStrategyBacktests[0].id, baseRun.id);

  const legacyBackup = { ...backup };
  delete legacyBackup.futuresStrategyBacktests;
  const parsedLegacy = backupApi.parseLocalDataBackup(JSON.stringify(legacyBackup));
  assert.equal(parsedLegacy.ok, true, "Older schema-v1 backups must remain compatible");
  assert.deepEqual(parsedLegacy.value.futuresStrategyBacktests, []);

  const invalidBackupLeverage = structuredClone(backup);
  invalidBackupLeverage.futuresStrategyBacktests = [structuredClone(baseRun)];
  invalidBackupLeverage.futuresStrategyBacktests[0].config.leverage = 10;
  assert.equal(
    backupApi.parseLocalDataBackup(JSON.stringify(invalidBackupLeverage)).ok,
    false,
    "Imported leverage above 5x must be rejected",
  );

  const invalidBackupBalance = structuredClone(backup);
  invalidBackupBalance.futuresStrategyBacktests = [structuredClone(baseRun)];
  invalidBackupBalance.futuresStrategyBacktests[0].metrics.endingBalance = -1;
  assert.equal(
    backupApi.parseLocalDataBackup(JSON.stringify(invalidBackupBalance)).ok,
    false,
    "Imported negative ending balances must be rejected",
  );

  console.log(
    "Futures strategy backtest verification passed: 24 deterministic pairs, WAIT, leverage, costs, history, and backup validation.",
  );
} finally {
  await server.close();
}
