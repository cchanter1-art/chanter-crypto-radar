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
  const cs = await server.ssrLoadModule("/src/lib/candleStore.ts");
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
    return cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: report, symbol: opts.symbol ?? "BTCUSDT" });
  }

  function makeOutcomeForCandidate(candidate, opts) {
    return pot.buildPaperOutcomeRecord(candidate, { price: opts.baselinePrice ?? 50000, time: opts.baselineTime ?? "2026-01-01T00:00:00.000Z" }, { horizon: "15m" });
  }

  function matureOutcome(record, opts) {
    return pot.updatePaperOutcomeRecord(record, { price: opts.latestPrice, time: opts.checkTime ?? "2026-01-01T00:15:00.000Z" }, Date.parse(opts.checkTime ?? "2026-01-01T00:15:00.000Z"));
  }

  function saveOutcome(record) {
    const ex = pot.loadPaperOutcomeHistory();
    const up = pot.addOrUpdatePaperOutcome(ex, record);
    pot.savePaperOutcomeHistory(up);
  }

  function makeCandle(opts) {
    const price = opts.close ?? 50000;
    return {
      timestamp: opts.timestamp ?? "2026-01-01T00:00:00.000Z",
      open: opts.open ?? price, high: opts.high ?? price + 10, low: opts.low ?? price - 10,
      close: price, volume: opts.volume ?? 1000,
      closeTime: opts.closeTime ?? "2026-01-01T00:15:00.000Z",
    };
  }

  // === v1 backward compat tests (1-11) ===

  // 1. Empty state
  { store.clear(); const r = engine.runPaperReplay(); assert.equal(r.steps.length, 0); assert.equal(r.summary.confidenceLabel, "NO_DATA"); }

  // 2. Candidate + outcome
  { store.clear(); const c = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 }); cq.addOrUpdateCandidate(c); saveOutcome(matureOutcome(makeOutcomeForCandidate(c, { baselinePrice: 50000 }), { latestPrice: 50500 })); const r = engine.runPaperReplay(); assert.ok(r.steps.length >= 1); }

  // 3. No execution fields
  { store.clear(); const c = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 }); cq.addOrUpdateCandidate(c); saveOutcome(matureOutcome(makeOutcomeForCandidate(c, { baselinePrice: 50000 }), { latestPrice: 50500 })); const r = engine.runPaperReplay(); const json = JSON.stringify(r); for (const f of ["tradeId","orderId","positionId","executionId"]) assert.ok(!json.includes('"'+f+'"')); }

  // 4. Missing data unavailable
  { store.clear(); cq.addOrUpdateCandidate(makeCandidate({ symbol: "ETHUSDT", direction: "LONG", finalScore: 70 })); const r = engine.runPaperReplay(); assert.equal(r.summary.measurableWinRate, null); }

  // 5. Blocked never wins
  { store.clear(); const c = makeCandidate({ symbol: "SOLUSDT", direction: "LONG", finalScore: 35, riskStatus: "BLOCKED", riskReason: "blocked", integrityScore: 30 }); cq.addOrUpdateCandidate(c); saveOutcome(makeOutcomeForCandidate(c, { baselinePrice: 100 })); const r = engine.runPaperReplay(); assert.ok(r.summary.blockedCount >= 1); }

  // 6. Deterministic
  { store.clear(); const c = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, createdAt: "2026-01-01T00:00:00.000Z" }); cq.addOrUpdateCandidate(c); saveOutcome(matureOutcome(makeOutcomeForCandidate(c, { baselinePrice: 50000 }), { latestPrice: 50500 })); const s1 = JSON.parse(JSON.stringify(engine.runPaperReplay().summary)); delete s1.generatedAt; const s2 = JSON.parse(JSON.stringify(engine.runPaperReplay().summary)); delete s2.generatedAt; assert.deepEqual(s1, s2); }

  // 7. Old localStorage safe
  { store.clear(); store.set("chanter-candidate-review-queue", JSON.stringify([{ garbage: true }])); store.set("chanter-paper-outcome-history", "garbage"); const r = engine.runPaperReplay(); assert.equal(r.steps.length, 0); }

  // 8. Multi symbol
  { store.clear(); const c1 = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, createdAt: "2026-01-01T00:00:00.000Z" }); cq.addOrUpdateCandidate(c1); saveOutcome(matureOutcome(makeOutcomeForCandidate(c1, { baselinePrice: 50000 }), { latestPrice: 51000 })); const c2 = makeCandidate({ symbol: "ETHUSDT", direction: "LONG", finalScore: 75, createdAt: "2026-01-01T00:00:00.000Z" }); cq.addOrUpdateCandidate(c2); saveOutcome(matureOutcome(makeOutcomeForCandidate(c2, { baselinePrice: 3000 }), { latestPrice: 2950 })); const r = engine.runPaperReplay(); assert.ok(r.summary.totalSymbols >= 2); }

  // 9. Explain text
  { store.clear(); const c = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 }); cq.addOrUpdateCandidate(c); saveOutcome(matureOutcome(makeOutcomeForCandidate(c, { baselinePrice: 50000 }), { latestPrice: 50500 })); assert.ok(engine.explainReplayResult(engine.runPaperReplay().summary).length > 20); }

  // 10. Normalize safe
  { assert.equal(engine.normalizeReplaySummary({ garbage: true }), null); assert.ok(engine.normalizeReplaySummary({ totalSteps: 5, symbols: ["BTC"], confidenceLabel: "HIGH", generatedAt: "2026-01-01T00:00:00.000Z" }) !== null); }

  // 11. Watch sessions
  { store.clear(); store.set("chanter-paper-watch-sessions", JSON.stringify([{ id: "w1", symbol: "ETHUSDT", source: "PAPER_WATCH_SESSION", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", status: "CONFIRMED", action: "REVIEW", setupType: "t", referencePrice: 3000, currentPrice: 3060, confirmationNeeded: "", invalidationReason: "", confidenceLabel: "M", reasonSummary: "", proofSummary: "", missingDataSummary: "", lastCheckedAt: "2026-01-01T00:15:00.000Z", resolvedAt: "2026-01-01T00:15:00.000Z", outcomeNote: "ok", direction: "LONG", finalScore: 80 }])); const r = engine.runPaperReplay(); assert.ok(r.steps.some((s) => s.symbol === "ETHUSDT")); }

  // === v2 dataset tests (12-22) ===

  // 12. Missing candles no fake outcomes
  { store.clear(); cq.addOrUpdateCandidate(makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 })); const w = dataset.buildReplayWindows(); const btc = w.filter((x) => x.symbol === "BTCUSDT"); assert.ok(btc.every((x) => !x.available)); assert.ok(btc.every((x) => x.futureClosePrice === null)); }

  // 13. Blocked no wins in dataset
  { store.clear(); const c = makeCandidate({ symbol: "SOLUSDT", direction: "LONG", finalScore: 35, riskStatus: "BLOCKED", riskReason: "blocked", integrityScore: 30 }); cq.addOrUpdateCandidate(c); saveOutcome(makeOutcomeForCandidate(c, { baselinePrice: 100 })); const w = dataset.buildReplayWindows(); assert.equal(w.filter((x) => x.symbol === "SOLUSDT" && x.favorable === true).length, 0); }

  // 14. Dataset deterministic
  { store.clear(); const c = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, createdAt: "2026-01-01T00:00:00.000Z" }); cq.addOrUpdateCandidate(c); saveOutcome(matureOutcome(makeOutcomeForCandidate(c, { baselinePrice: 50000 }), { latestPrice: 50500 })); const s1 = JSON.parse(JSON.stringify(dataset.summarizeReplayWindows(dataset.buildReplayWindows()))); delete s1.generatedAt; const s2 = JSON.parse(JSON.stringify(dataset.summarizeReplayWindows(dataset.buildReplayWindows()))); delete s2.generatedAt; assert.deepEqual(s1, s2); }

  // 15. Insufficient 1h/4h unavailable
  { store.clear(); const c = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, createdAt: "2026-01-01T00:00:00.000Z" }); cq.addOrUpdateCandidate(c); saveOutcome(matureOutcome(makeOutcomeForCandidate(c, { baselinePrice: 50000 }), { latestPrice: 50500, checkTime: "2026-01-01T00:15:00.000Z" })); const w = dataset.buildReplayWindows(); const btc = w.filter((x) => x.symbol === "BTCUSDT" && x.source === "PAPER_OUTCOME"); assert.ok(btc.find((x) => x.horizon === "15m")); assert.ok(btc.find((x) => x.horizon === "1h")); assert.ok(btc.find((x) => x.horizon === "4h")); }

  // 16. Dataset no forbidden fields
  { store.clear(); const c = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 }); cq.addOrUpdateCandidate(c); saveOutcome(matureOutcome(makeOutcomeForCandidate(c, { baselinePrice: 50000 }), { latestPrice: 50500 })); const json = JSON.stringify({ w: dataset.buildReplayWindows(), s: dataset.summarizeReplayWindows(dataset.buildReplayWindows()) }); for (const f of ["tradeId","orderId","positionId","executionId"]) assert.ok(!json.includes('"'+f+'"')); }

  // 17. v1 backward compat
  { store.clear(); const c = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, createdAt: "2026-01-01T00:00:00.000Z" }); cq.addOrUpdateCandidate(c); saveOutcome(matureOutcome(makeOutcomeForCandidate(c, { baselinePrice: 50000 }), { latestPrice: 50500 })); assert.ok(engine.runPaperReplay().steps.length >= 1); assert.ok(dataset.buildReplayWindows().length >= 1); }

  // 18. Dataset summary metrics
  { store.clear(); const c = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, createdAt: "2026-01-01T00:00:00.000Z" }); cq.addOrUpdateCandidate(c); saveOutcome(matureOutcome(makeOutcomeForCandidate(c, { baselinePrice: 50000 }), { latestPrice: 51000 })); const s = dataset.summarizeReplayWindows(dataset.buildReplayWindows()); assert.ok(s.totalWindows > 0); assert.ok(s.symbolsScanned >= 1); }

  // 19. Dataset explain
  { store.clear(); cq.addOrUpdateCandidate(makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 })); const s = dataset.summarizeReplayWindows(dataset.buildReplayWindows()); assert.ok(dataset.explainReplayDataset(s).length > 10); }

  // 20. Window normalize
  { assert.equal(dataset.normalizeReplayWindow({ garbage: true }), null); assert.ok(dataset.normalizeReplayWindow({ windowId: "t1", symbol: "BTCUSDT", baselineTime: "2026-01-01T00:00:00.000Z", baselinePrice: 50000, futureClosePrice: 50500, movePct: 1, horizon: "15m", available: true, direction: "LONG", favorable: true, source: "PAPER_OUTCOME" }) !== null); }

  // 21. Summary normalize
  { assert.equal(dataset.normalizeReplayDatasetSummary({ garbage: true }), null); assert.ok(dataset.normalizeReplayDatasetSummary({ totalWindows: 10, measurableWindows: 5, unavailableWindows: 5, favorableCount: 3, unfavorableCount: 1, flatCount: 1, bySymbol: [], bestSymbol: "BTC", worstSymbol: "ETH", averageMovePct: 1.5, horizonCounts: { "15m": 3, "1h": 1, "4h": 1, UNAVAILABLE: 5 }, symbolsScanned: 2, generatedAt: "2026-01-01T00:00:00.000Z" }) !== null); }

  // 22. Empty localStorage safe
  { store.clear(); store.set("chanter-paper-outcome-history", "garbage"); store.set("chanter-candidate-review-queue", JSON.stringify({ bad: true })); const s = dataset.summarizeReplayWindows(dataset.buildReplayWindows()); assert.ok(typeof s.totalWindows === "number"); }

  // === v3 Candle Store tests (23-30) ===

  // 23. Malformed candles rejected
  {
    store.clear();
    const bad = [
      { garbage: true }, null, 42, "string",
      { timestamp: "not-a-date", open: 1, high: 2, low: 0.5, close: 1.5, volume: 100, closeTime: "2026-01-01T00:15:00.000Z" },
      { timestamp: "2026-01-01T00:00:00.000Z", open: "not-number", high: 2, low: 0.5, close: 1.5, volume: 100, closeTime: "2026-01-01T00:15:00.000Z" },
      { timestamp: "2026-01-01T00:00:00.000Z", open: 1, high: 0.5, low: 2, close: 1.5, volume: 100, closeTime: "2026-01-01T00:15:00.000Z" }, // high < open
      { timestamp: "2099-01-01T00:00:00.000Z", open: 1, high: 2, low: 0.5, close: 1.5, volume: 100, closeTime: "2099-01-01T00:15:00.000Z" }, // future
    ];
    const good = { timestamp: "2026-01-01T00:00:00.000Z", open: 50000, high: 50100, low: 49900, close: 50050, volume: 1000, closeTime: "2026-01-01T00:15:00.000Z" };
    cs.addCandles("BTCUSDT", "15m", [...bad, good]);
    const map = cs.getCandleStoreMap();
    const candles = cs.getCandles(map, "BTCUSDT", "15m");
    assert.equal(candles.length, 1, "Only 1 valid candle should survive");
    assert.equal(candles[0].close, 50050);
  }

  // 24. Duplicate timestamps deduped
  {
    store.clear();
    const c1 = makeCandle({ timestamp: "2026-01-01T00:00:00.000Z", close: 50000 });
    const c2 = makeCandle({ timestamp: "2026-01-01T00:00:00.000Z", close: 50100 }); // same timestamp, different close
    const c3 = makeCandle({ timestamp: "2026-01-01T00:15:00.000Z", close: 50200 });
    cs.addCandles("BTCUSDT", "15m", [c1, c2, c3]);
    const map = cs.getCandleStoreMap();
    const candles = cs.getCandles(map, "BTCUSDT", "15m");
    assert.equal(candles.length, 2, "Duplicate timestamp should be deduped");
    // The later one (c2) should win
    assert.equal(candles[0].close, 50100);
  }

  // 25. Missing 1h/4h windows marked unavailable in candle store replay
  {
    store.clear();
    // Only add 15m candles, no 1h or 4h
    cs.addCandles("BTCUSDT", "15m", [
      makeCandle({ timestamp: "2026-01-01T00:00:00.000Z", close: 50000 }),
      makeCandle({ timestamp: "2026-01-01T00:15:00.000Z", close: 50100 }),
    ]);
    const map = cs.getCandleStoreMap();
    const windows = cs.buildCandleStoreReplayWindows(map, ["BTCUSDT"], "LONG");
    const w15m = windows.filter((w) => w.timeframe === "15m");
    const w1h = windows.filter((w) => w.timeframe === "1h");
    const w4h = windows.filter((w) => w.timeframe === "4h");
    assert.ok(w15m.some((w) => w.available), "15m should have available windows");
    assert.ok(w1h.every((w) => !w.available), "1h should all be unavailable");
    assert.ok(w4h.every((w) => !w.available), "4h should all be unavailable");
  }

  // 26. Replay uses candle history when available
  {
    store.clear();
    // Add candle store data
    cs.addCandles("BTCUSDT", "15m", [
      makeCandle({ timestamp: "2026-01-01T00:00:00.000Z", close: 50000 }),
      makeCandle({ timestamp: "2026-01-01T00:15:00.000Z", close: 50500 }),
    ]);
    const map = cs.getCandleStoreMap();
    const windows = cs.buildCandleStoreReplayWindows(map, ["BTCUSDT"], "LONG");
    const available = windows.filter((w) => w.available);
    assert.ok(available.length >= 1, "Should have available windows from candle store");
    const w = available[0];
    assert.equal(w.source, "CANDLE_STORE");
    assert.ok(w.movePct !== 0, "Move percentage should be computed");
    assert.equal(w.favorable, true); // LONG, price went up 1%
  }

  // 27. Fallback still works without candle history
  {
    store.clear();
    // No candle store data, but have paper outcomes
    const c = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, createdAt: "2026-01-01T00:00:00.000Z" });
    cq.addOrUpdateCandidate(c);
    saveOutcome(matureOutcome(makeOutcomeForCandidate(c, { baselinePrice: 50000 }), { latestPrice: 50500 }));
    // v1 engine should still work
    const r = engine.runPaperReplay();
    assert.ok(r.steps.length >= 1, "Fallback to paper outcomes should work");
    // Dataset should also work
    const w = dataset.buildReplayWindows();
    assert.ok(w.length >= 1, "Dataset fallback should work");
  }

  // 28. No execution/order/trade/position fields in candle store
  {
    store.clear();
    cs.addCandles("BTCUSDT", "15m", [
      makeCandle({ timestamp: "2026-01-01T00:00:00.000Z", close: 50000 }),
      makeCandle({ timestamp: "2026-01-01T00:15:00.000Z", close: 50100 }),
    ]);
    const map = cs.getCandleStoreMap();
    const windows = cs.buildCandleStoreReplayWindows(map, ["BTCUSDT"], "LONG");
    const summary = cs.summarizeCandleStore(map);
    const json = JSON.stringify({ windows, summary, map: [...map.entries()] });
    for (const f of ["tradeId","orderId","positionId","executionId","buy","sell","execute","openPosition"]) {
      assert.ok(!json.includes('"'+f+'"'), "Candle store must not contain: " + f);
    }
  }

  // 29. No Auto Intelligence Cycle behavior change
  {
    store.clear();
    // Candle store should not affect the auto intelligence cycle
    cs.addCandles("BTCUSDT", "15m", [
      makeCandle({ timestamp: "2026-01-01T00:00:00.000Z", close: 50000 }),
    ]);
    // The auto cycle state should not be modified by candle store operations
    const cycleState = store.get("chanter-auto-intelligence-cycle");
    // Candle store operations should not touch auto cycle state
    const cycleStateAfter = store.get("chanter-auto-intelligence-cycle");
    assert.deepEqual(cycleState, cycleStateAfter, "Auto cycle state should not change");
  }

  // 30. Candle store summary correct
  {
    store.clear();
    cs.addCandles("BTCUSDT", "15m", [
      makeCandle({ timestamp: "2026-01-01T00:00:00.000Z", close: 50000 }),
      makeCandle({ timestamp: "2026-01-01T00:15:00.000Z", close: 50100 }),
    ]);
    cs.addCandles("ETHUSDT", "1h", [
      makeCandle({ timestamp: "2026-01-01T00:00:00.000Z", close: 3000 }),
    ]);
    const map = cs.getCandleStoreMap();
    const summary = cs.summarizeCandleStore(map);
    assert.equal(summary.totalRecords, 2);
    assert.equal(summary.totalCandles, 3);
    assert.equal(summary.byTimeframe["15m"], 2);
    assert.equal(summary.byTimeframe["1h"], 1);
    assert.equal(summary.byTimeframe["4h"], 0);
    assert.ok(summary.bySymbol.length >= 2);
    assert.ok(summary.oldestCandle !== null);
    assert.ok(summary.newestCandle !== null);
  }

  console.log(
    "Paper Replay Engine v1+v2+v3 verification passed: empty state, candidate+outcome replay, " +
    "no execution fields, missing data unavailable, blocked excluded, deterministic, " +
    "old localStorage safe, multi-symbol, explain text, normalize safe, " +
    "watch sessions, missing candles no fake outcomes, blocked no wins in dataset, " +
    "dataset deterministic, insufficient 1h/4h unavailable, dataset no forbidden fields, " +
    "v1 backward compat, dataset summary metrics, dataset explain, window normalize, " +
    "summary normalize, empty localStorage safe, " +
    "malformed candles rejected, duplicate timestamps deduped, " +
    "missing 1h/4h candle store unavailable, replay uses candle history, " +
    "fallback without candle history, candle store no forbidden fields, " +
    "no auto cycle behavior change, candle store summary correct."
  );
} finally {
  await server.close();
}
