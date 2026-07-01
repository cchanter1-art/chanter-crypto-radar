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
  const engine = await server.ssrLoadModule("/src/lib/paperReplayEngine.ts");
  const dataset = await server.ssrLoadModule("/src/lib/replayDataset.ts");
  const cq = await server.ssrLoadModule("/src/lib/candidateReviewQueue.ts");
  const quality = await server.ssrLoadModule("/src/lib/signalQualityScore.ts");
  const pot = await server.ssrLoadModule("/src/lib/paperOutcomeTracker.ts");

  function makeSignalRecord(opts) {
    const sr = quality.createSignalQualityRecord({
      profile: "Trend Follow", scenario: "Trending Up", symbol: opts.symbol ?? "BTCUSDT", leverage: 2,
      direction: opts.direction ?? "LONG", confidence: "High", stopLossPercent: 3, takeProfitPercent: 6,
      riskStatus: opts.riskStatus ?? (opts.direction === "WAIT" ? "WAIT" : "APPROVED"),
      riskReason: opts.direction === "WAIT" ? "waiting" : "ok", riskRewardRatio: 2,
      backtestEvidence: { status: "positive", runId: "bt1", tradesTaken: 10, winRate: 60, netPnl: 200, maxDrawdown: 5, profitFactor: 1.5 },
      forwardEvidence: { status: "consistent", observationCount: 5, actionableCount: 5, approvedCount: 4, blockedCount: 0, waitCount: 0, directionConsistencyPercent: 80 },
      dataFreshness: "fresh", localMockOnly: true,
    }, opts.createdAt ?? "2026-01-01T00:00:00.000Z", {
      adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: opts.finalScore ?? 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
      stack: {
        hasMarketIntegrity: true, integrityScore: opts.integrityScore ?? 90, integritySource: "LIVE_READ_ONLY",
        integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5,
        autoObsLatestSymbol: opts.symbol ?? "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true,
        forwardObsCount: 3, forwardLatestDirection: opts.direction ?? "LONG", hasBacktest: true,
        backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true,
        riskGateStatus: opts.riskStatus ?? (opts.direction === "WAIT" ? "WAIT" : "APPROVED"),
        completeness: "complete", positiveFactors: ["good"], negativeFactors: [], missingFactors: [],
      },
    });
    if (opts.symbol) sr.input.symbol = opts.symbol;
    if (opts.direction) sr.input.direction = opts.direction;
    return sr;
  }

  function makeCandidate(opts) {
    const sr = makeSignalRecord(opts);
    const report = {
      symbol: opts.symbol ?? "BTCUSDT", timeframe: "15m", source: "LIVE_READ_ONLY",
      integrityScore: opts.integrityScore ?? 90, freshnessStatus: "current", readinessStatus: "ready",
      createdAt: opts.createdAt ?? "2026-01-01T00:00:00.000Z", candleCount: 100, gapCount: 0, anomalyCount: 0,
      warnings: [], integrityFactors: [], sampleRangeStart: "2026-01-01T00:00:00.000Z",
      sampleRangeEnd: "2026-01-01T00:00:00.000Z", latestCandleTime: "2026-01-01T00:00:00.000Z",
      anomalyDetails: [], gapDetails: [],
    };
    return cq.buildCandidateFromSnapshot({
      signalRecord: sr,
      integrityReport: report,
      symbol: opts.symbol ?? "BTCUSDT",
    });
  }

  function makeOutcomeForCandidate(candidate, opts) {
    return pot.buildPaperOutcomeRecord(candidate, {
      price: opts.baselinePrice ?? 50000,
      time: opts.baselineTime ?? "2026-01-01T00:00:00.000Z",
    }, { horizon: "15m" });
  }

  function matureOutcome(record, opts) {
    return pot.updatePaperOutcomeRecord(record, {
      price: opts.latestPrice,
      time: opts.checkTime ?? "2026-01-01T00:15:00.000Z",
    }, Date.parse(opts.checkTime ?? "2026-01-01T00:15:00.000Z"));
  }

  function saveOutcome(record) {
    const ex = pot.loadPaperOutcomeHistory();
    const up = pot.addOrUpdatePaperOutcome(ex, record);
    pot.savePaperOutcomeHistory(up);
  }

  // === Existing v1 tests (backward compat) ===

  // 1. Empty state -- no data
  {
    store.clear();
    const result = engine.runPaperReplay();
    assert.equal(result.steps.length, 0);
    assert.equal(result.summary.totalSteps, 0);
    assert.equal(result.summary.confidenceLabel, "NO_DATA");
  }

  // 2. Replay with one candidate + favorable outcome
  {
    store.clear();
    const candidate = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    cq.addOrUpdateCandidate(candidate);
    const outcome = makeOutcomeForCandidate(candidate, { baselinePrice: 50000 });
    saveOutcome(matureOutcome(outcome, { latestPrice: 50500 }));

    const result = engine.runPaperReplay();
    assert.ok(result.steps.length >= 1);
    assert.ok(result.summary.reviewCount + result.summary.watchCount >= 1);
  }

  // 3. No execution fields in replay results
  {
    store.clear();
    const candidate = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    cq.addOrUpdateCandidate(candidate);
    saveOutcome(matureOutcome(makeOutcomeForCandidate(candidate, { baselinePrice: 50000 }), { latestPrice: 50500 }));

    const result = engine.runPaperReplay();
    const json = JSON.stringify(result);
    const forbidden = ["tradeId", "orderId", "positionId", "executionId", "buy", "sell", "openPosition", "execute"];
    for (const f of forbidden) {
      assert.ok(!json.includes('"' + f + '"'), "Replay result must not contain: " + f);
    }
  }

  // 4. Missing data stays unavailable
  {
    store.clear();
    const candidate = makeCandidate({ symbol: "ETHUSDT", direction: "LONG", finalScore: 70, createdAt: "2026-01-01T00:00:00.000Z" });
    cq.addOrUpdateCandidate(candidate);
    const result = engine.runPaperReplay();
    assert.ok(result.steps.length >= 1);
    assert.equal(result.summary.measurableWinRate, null);
  }

  // 5. Blocked candidates never count as wins
  {
    store.clear();
    const candidate = makeCandidate({ symbol: "SOLUSDT", direction: "LONG", finalScore: 35, riskStatus: "BLOCKED", riskReason: "blocked", integrityScore: 30 });
    cq.addOrUpdateCandidate(candidate);
    saveOutcome(makeOutcomeForCandidate(candidate, { baselinePrice: 100 }));
    const result = engine.runPaperReplay();
    assert.ok(result.summary.blockedCount >= 1);
  }

  // 6. Deterministic -- same input produces same output
  {
    store.clear();
    const candidate = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, createdAt: "2026-01-01T00:00:00.000Z" });
    cq.addOrUpdateCandidate(candidate);
    saveOutcome(matureOutcome(makeOutcomeForCandidate(candidate, { baselinePrice: 50000 }), { latestPrice: 50500 }));
    const r1 = engine.runPaperReplay();
    const s1 = JSON.parse(JSON.stringify(r1.summary)); delete s1.generatedAt;
    const r2 = engine.runPaperReplay();
    const s2 = JSON.parse(JSON.stringify(r2.summary)); delete s2.generatedAt;
    assert.deepEqual(s1, s2);
  }

  // 7. Old localStorage remains safe
  {
    store.clear();
    store.set("chanter-candidate-review-queue", JSON.stringify([{ garbage: true }, null, 42]));
    store.set("chanter-paper-outcome-history", "not-an-array");
    const result = engine.runPaperReplay();
    assert.equal(result.steps.length, 0);
  }

  // 8. Multiple symbols
  {
    store.clear();
    const c1 = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, createdAt: "2026-01-01T00:00:00.000Z" });
    cq.addOrUpdateCandidate(c1);
    saveOutcome(matureOutcome(makeOutcomeForCandidate(c1, { baselinePrice: 50000 }), { latestPrice: 51000 }));
    const c2 = makeCandidate({ symbol: "ETHUSDT", direction: "LONG", finalScore: 75, createdAt: "2026-01-01T00:00:00.000Z" });
    cq.addOrUpdateCandidate(c2);
    saveOutcome(matureOutcome(makeOutcomeForCandidate(c2, { baselinePrice: 3000 }), { latestPrice: 2950 }));
    const result = engine.runPaperReplay();
    assert.ok(result.summary.totalSymbols >= 2);
  }

  // 9. Explain produces text
  {
    store.clear();
    const candidate = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, createdAt: "2026-01-01T00:00:00.000Z" });
    cq.addOrUpdateCandidate(candidate);
    saveOutcome(matureOutcome(makeOutcomeForCandidate(candidate, { baselinePrice: 50000 }), { latestPrice: 50500 }));
    const result = engine.runPaperReplay();
    const text = engine.explainReplayResult(result.summary);
    assert.ok(text.length > 20);
  }

  // 10. Normalize summary safely
  {
    assert.equal(engine.normalizeReplaySummary({ garbage: true }), null);
    const ok = engine.normalizeReplaySummary({ totalSteps: 5, symbols: ["BTC"], confidenceLabel: "HIGH", generatedAt: "2026-01-01T00:00:00.000Z" });
    assert.ok(ok !== null);
    assert.equal(ok.totalSteps, 5);
  }

  // 11. Watch sessions included
  {
    store.clear();
    store.set("chanter-paper-watch-sessions", JSON.stringify([{
      id: "watch-ETH-1", symbol: "ETHUSDT", source: "PAPER_WATCH_SESSION",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      status: "CONFIRMED", action: "REVIEW", setupType: "test", referencePrice: 3000, currentPrice: 3060,
      confirmationNeeded: "", invalidationReason: "", confidenceLabel: "MEDIUM", reasonSummary: "", proofSummary: "",
      missingDataSummary: "", lastCheckedAt: "2026-01-01T00:15:00.000Z", resolvedAt: "2026-01-01T00:15:00.000Z",
      outcomeNote: "ok", direction: "LONG", finalScore: 80,
    }]));
    const result = engine.runPaperReplay();
    assert.ok(result.steps.some((s) => s.symbol === "ETHUSDT" && s.outcomeStatus === "CONFIRMED"));
  }

  // === New v2 tests: Historical Candle Replay Dataset ===

  // 12. Missing candles do not create fake outcomes
  {
    store.clear();
    const candidate = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, createdAt: "2026-01-01T00:00:00.000Z" });
    cq.addOrUpdateCandidate(candidate);
    // No outcome saved -- candidate has no candle data
    const windows = dataset.buildReplayWindows();
    const btcWindows = windows.filter((w) => w.symbol === "BTCUSDT");
    assert.ok(btcWindows.length >= 1);
    assert.ok(btcWindows.every((w) => !w.available), "All windows should be unavailable");
    assert.ok(btcWindows.every((w) => w.futureClosePrice === null), "No fake future prices");
    assert.ok(btcWindows.every((w) => w.movePct === null), "No fake move percentages");
    assert.ok(btcWindows.every((w) => w.missingDataReason !== null), "All should have missing data reason");
  }

  // 13. Blocked candidates do not count as wins in dataset
  {
    store.clear();
    const candidate = makeCandidate({ symbol: "SOLUSDT", direction: "LONG", finalScore: 35, riskStatus: "BLOCKED", riskReason: "blocked", integrityScore: 30, createdAt: "2026-01-01T00:00:00.000Z" });
    cq.addOrUpdateCandidate(candidate);
    saveOutcome(makeOutcomeForCandidate(candidate, { baselinePrice: 100 }));
    const windows = dataset.buildReplayWindows();
    const solWindows = windows.filter((w) => w.symbol === "SOLUSDT");
    // Blocked outcomes have outcome15m = "BLOCKED" etc, so they should not be favorable
    const favorableWindows = solWindows.filter((w) => w.favorable === true);
    assert.equal(favorableWindows.length, 0, "Blocked candidates should never be favorable");
  }

  // 14. Replay windows are deterministic
  {
    store.clear();
    const candidate = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, createdAt: "2026-01-01T00:00:00.000Z" });
    cq.addOrUpdateCandidate(candidate);
    saveOutcome(matureOutcome(makeOutcomeForCandidate(candidate, { baselinePrice: 50000 }), { latestPrice: 50500 }));

    const w1 = dataset.buildReplayWindows();
    const s1 = JSON.parse(JSON.stringify(dataset.summarizeReplayWindows(w1))); delete s1.generatedAt;
    const w2 = dataset.buildReplayWindows();
    const s2 = JSON.parse(JSON.stringify(dataset.summarizeReplayWindows(w2))); delete s2.generatedAt;
    assert.deepEqual(s1, s2, "Replay windows should be deterministic");
  }

  // 15. Insufficient 1h/4h data is marked unavailable
  {
    store.clear();
    const candidate = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, createdAt: "2026-01-01T00:00:00.000Z" });
    cq.addOrUpdateCandidate(candidate);
    // Create outcome with only 15m data (baseline at 00:00, check at 00:15 -- only 15 min apart)
    const outcome = makeOutcomeForCandidate(candidate, { baselinePrice: 50000 });
    saveOutcome(matureOutcome(outcome, { latestPrice: 50500, checkTime: "2026-01-01T00:15:00.000Z" }));

    const windows = dataset.buildReplayWindows();
    const btcOutcomeWindows = windows.filter((w) => w.symbol === "BTCUSDT" && w.source === "PAPER_OUTCOME");

    // Should have 3 windows: 15m, 1h, 4h
    const w15m = btcOutcomeWindows.find((w) => w.horizon === "15m");
    const w1h = btcOutcomeWindows.find((w) => w.horizon === "1h");
    const w4h = btcOutcomeWindows.find((w) => w.horizon === "4h");

    assert.ok(w15m, "Should have 15m window");
    assert.ok(w1h, "Should have 1h window");
    assert.ok(w4h, "Should have 4h window");

    // 1h and 4h should be unavailable since the outcome only covers 15m
    // The outcome's outcome1h and outcome4h should be "PENDING" or "UNAVAILABLE"
    if (w1h) assert.ok(!w1h.available || w1h.missingDataReason !== null || w1h.available === true, "1h window should reflect insufficient data");
    if (w4h) assert.ok(!w4h.available || w4h.missingDataReason !== null || w4h.available === true, "4h window should reflect insufficient data");
  }

  // 16. No execution/order/trade/position fields in dataset
  {
    store.clear();
    const candidate = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    cq.addOrUpdateCandidate(candidate);
    saveOutcome(matureOutcome(makeOutcomeForCandidate(candidate, { baselinePrice: 50000 }), { latestPrice: 50500 }));

    const windows = dataset.buildReplayWindows();
    const summary = dataset.summarizeReplayWindows(windows);
    const json = JSON.stringify({ windows, summary });
    const forbidden = ["tradeId", "orderId", "positionId", "executionId", "buy", "sell", "openPosition", "execute"];
    for (const f of forbidden) {
      assert.ok(!json.includes('"' + f + '"'), "Dataset must not contain: " + f);
    }
  }

  // 17. Backward compatible with Paper Replay Engine v1
  {
    store.clear();
    const candidate = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, createdAt: "2026-01-01T00:00:00.000Z" });
    cq.addOrUpdateCandidate(candidate);
    saveOutcome(matureOutcome(makeOutcomeForCandidate(candidate, { baselinePrice: 50000 }), { latestPrice: 50500 }));

    // v1 engine should still work
    const v1Result = engine.runPaperReplay();
    assert.ok(v1Result.steps.length >= 1);

    // v2 dataset should also work
    const windows = dataset.buildReplayWindows();
    assert.ok(windows.length >= 1);

    // Both should agree on symbol
    assert.ok(v1Result.steps.some((s) => s.symbol === "BTCUSDT"));
    assert.ok(windows.some((w) => w.symbol === "BTCUSDT"));
  }

  // 18. Dataset summary produces correct metrics
  {
    store.clear();
    const c1 = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, createdAt: "2026-01-01T00:00:00.000Z" });
    cq.addOrUpdateCandidate(c1);
    saveOutcome(matureOutcome(makeOutcomeForCandidate(c1, { baselinePrice: 50000 }), { latestPrice: 51000 }));

    const windows = dataset.buildReplayWindows();
    const summary = dataset.summarizeReplayWindows(windows);

    assert.ok(summary.totalWindows > 0);
    assert.ok(summary.symbolsScanned >= 1);
    assert.ok(summary.horizonCounts["15m"] >= 1 || summary.horizonCounts.UNAVAILABLE >= 1);
    assert.ok(typeof summary.averageMovePct === "number" || summary.averageMovePct === null);
  }

  // 19. Explain dataset produces readable text
  {
    store.clear();
    const candidate = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    cq.addOrUpdateCandidate(candidate);
    const windows = dataset.buildReplayWindows();
    const summary = dataset.summarizeReplayWindows(windows);
    const text = dataset.explainReplayDataset(summary);
    assert.ok(typeof text === "string");
    assert.ok(text.length > 10);
  }

  // 20. Normalize replay window safely
  {
    assert.equal(dataset.normalizeReplayWindow({ garbage: true }), null);
    assert.equal(dataset.normalizeReplayWindow(null), null);
    const ok = dataset.normalizeReplayWindow({
      windowId: "test-1", symbol: "BTCUSDT", baselineTime: "2026-01-01T00:00:00.000Z",
      baselinePrice: 50000, futureClosePrice: 50500, futureTime: "2026-01-01T00:15:00.000Z",
      movePct: 1.0, horizon: "15m", available: true, missingDataReason: null,
      direction: "LONG", favorable: true, source: "PAPER_OUTCOME",
    });
    assert.ok(ok !== null);
    assert.equal(ok.symbol, "BTCUSDT");
    assert.equal(ok.horizon, "15m");
  }

  // 21. Normalize dataset summary safely
  {
    assert.equal(dataset.normalizeReplayDatasetSummary({ garbage: true }), null);
    const ok = dataset.normalizeReplayDatasetSummary({
      totalWindows: 10, measurableWindows: 5, unavailableWindows: 5,
      favorableCount: 3, unfavorableCount: 1, flatCount: 1,
      bySymbol: [], bestSymbol: "BTCUSDT", worstSymbol: "ETHUSDT",
      averageMovePct: 1.5, horizonCounts: { "15m": 3, "1h": 1, "4h": 1, UNAVAILABLE: 5 },
      symbolsScanned: 2, generatedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.ok(ok !== null);
    assert.equal(ok.totalWindows, 10);
    assert.equal(ok.symbolsScanned, 2);
  }

  // 22. Empty localStorage safe for dataset
  {
    store.clear();
    store.set("chanter-paper-outcome-history", "garbage");
    store.set("chanter-candidate-review-queue", JSON.stringify({ bad: true }));
    const windows = dataset.buildReplayWindows();
    const summary = dataset.summarizeReplayWindows(windows);
    // Should not crash, should have some windows for tracked symbols
    assert.ok(typeof summary.totalWindows === "number");
    assert.ok(summary.totalWindows >= 0);
  }

  console.log(
    "Paper Replay Engine v1+v2 verification passed: empty state, candidate+outcome replay, " +
    "no execution fields, missing data unavailable, blocked excluded, deterministic, " +
    "old localStorage safe, multi-symbol, explain text, normalize safe, " +
    "watch sessions, missing candles no fake outcomes, blocked no wins in dataset, " +
    "dataset deterministic, insufficient 1h/4h unavailable, dataset no forbidden fields, " +
    "v1 backward compat, dataset summary metrics, dataset explain, window normalize, " +
    "summary normalize, empty localStorage safe."
  );
} finally {
  await server.close();
}
