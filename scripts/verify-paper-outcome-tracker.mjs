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
  const tracker = await server.ssrLoadModule("/src/lib/paperOutcomeTracker.ts");
  const cq = await server.ssrLoadModule("/src/lib/candidateReviewQueue.ts");
  const quality = await server.ssrLoadModule("/src/lib/signalQualityScore.ts");

  function makeCandidate(opts) {
    const sr = quality.createSignalQualityRecord({
      profile: "Trend Follow", scenario: "Trending Up", symbol: opts.symbol ?? "BTCUSDT", leverage: 2,
      direction: opts.direction ?? "LONG", confidence: "High", stopLossPercent: 3, takeProfitPercent: 6,
      riskStatus: opts.riskStatus ?? (opts.direction === "WAIT" ? "WAIT" : "APPROVED"), riskReason: opts.direction === "WAIT" ? "waiting" : "ok", riskRewardRatio: 2,
      backtestEvidence: { status: "positive", runId: "bt1", tradesTaken: 10, winRate: 60, netPnl: 200, maxDrawdown: 5, profitFactor: 1.5 },
      forwardEvidence: { status: "consistent", observationCount: 5, actionableCount: 5, approvedCount: 4, blockedCount: 0, waitCount: 0, directionConsistencyPercent: 80 },
      dataFreshness: "fresh", localMockOnly: true,
    }, opts.createdAt ?? "2026-01-01T00:00:00.000Z", {
      adjusted: { baseScore: opts.baseScore ?? 75, evidenceModifier: opts.modifier ?? 8, finalScore: opts.finalScore ?? 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
      stack: {
        hasMarketIntegrity: true, integrityScore: opts.integrityScore ?? 90, integritySource: "LIVE_READ_ONLY",
        integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5,
        autoObsLatestSymbol: opts.symbol ?? "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true,
        forwardObsCount: 3, forwardLatestDirection: opts.direction ?? "LONG", hasBacktest: true,
        backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: opts.riskStatus ?? (opts.direction === "WAIT" ? "WAIT" : "APPROVED"),
        completeness: opts.completeness ?? "complete", positiveFactors: ["good"], negativeFactors: [], missingFactors: [],
      },
    });
    if (opts.symbol) sr.input.symbol = opts.symbol;
    if (opts.direction) sr.input.direction = opts.direction;
    if (opts.riskStatus) sr.input.riskStatus = opts.riskStatus;
    return cq.buildCandidateFromSnapshot({
      signalRecord: sr,
      integrityReport: {
        symbol: opts.symbol ?? "BTCUSDT", timeframe: "15m", source: "LIVE_READ_ONLY",
        integrityScore: opts.integrityScore ?? 90, freshnessStatus: "current", readinessStatus: "ready",
        createdAt: opts.createdAt ?? "2026-01-01T00:00:00.000Z", candleCount: 100, gapCount: 0, anomalyCount: 0,
        warnings: [], integrityFactors: [], sampleRangeStart: "2026-01-01T00:00:00.000Z",
        sampleRangeEnd: "2026-01-01T00:00:00.000Z", latestCandleTime: "2026-01-01T00:00:00.000Z",
        anomalyDetails: [], gapDetails: [],
      },
      symbol: opts.symbol ?? "BTCUSDT",
    });
  }

  // Helper: create outcome with specific baseline and elapsed time
  function makeOutcomeWithBaseline(opts) {
    const cand = makeCandidate(opts);
    const baselineTime = opts.baselineTime ?? "2026-01-01T00:00:00.000Z";
    const md = opts.hasBaseline ? { price: opts.baselinePrice ?? 50000, time: baselineTime } : null;
    const record = tracker.buildPaperOutcomeRecord(cand, md, opts.options);
    return { cand, record };
  }

  // Helper: update outcome with latest price after elapsed time
  function updateWithElapsed(record, latestPrice, elapsedMs) {
    const baselineMs = Date.parse(record.baselineTime);
    const latestTime = new Date(baselineMs + elapsedMs).toISOString();
    return tracker.updatePaperOutcomeRecord(record, { price: latestPrice, time: latestTime }, baselineMs + elapsedMs);
  }

  // 1. LONG win when price rises after horizon
  {
    store.clear();
    const { record } = makeOutcomeWithBaseline({
      symbol: "BTCUSDT", direction: "LONG", finalScore: 83,
      hasBaseline: true, baselinePrice: 50000, baselineTime: "2026-01-01T00:00:00.000Z",
    });
    const updated = updateWithElapsed(record, 51000, 20 * 60 * 1000); // 20 min later, +2%
    assert.equal(updated.outcome15m, "WIN", "LONG with +2% after 15m should be WIN");
    assert.equal(updated.outcomeStatus, "WIN");
    assert.ok(updated.changePct !== null && updated.changePct > 0, "Change should be positive");
  }

  // 2. LONG loss when price falls after horizon
  {
    store.clear();
    const { record } = makeOutcomeWithBaseline({
      symbol: "BTCUSDT", direction: "LONG", finalScore: 83,
      hasBaseline: true, baselinePrice: 50000, baselineTime: "2026-01-01T00:00:00.000Z",
    });
    const updated = updateWithElapsed(record, 49000, 20 * 60 * 1000); // 20 min later, -2%
    assert.equal(updated.outcome15m, "LOSS", "LONG with -2% after 15m should be LOSS");
    assert.equal(updated.outcomeStatus, "LOSS");
  }

  // 3. SHORT win when price falls after horizon
  {
    store.clear();
    const { record } = makeOutcomeWithBaseline({
      symbol: "ETHUSDT", direction: "SHORT", finalScore: 83,
      hasBaseline: true, baselinePrice: 3000, baselineTime: "2026-01-01T00:00:00.000Z",
    });
    const updated = updateWithElapsed(record, 2940, 20 * 60 * 1000); // -2%
    assert.equal(updated.outcome15m, "WIN", "SHORT with -2% after 15m should be WIN");
    assert.equal(updated.outcomeStatus, "WIN");
  }

  // 4. SHORT loss when price rises after horizon
  {
    store.clear();
    const { record } = makeOutcomeWithBaseline({
      symbol: "ETHUSDT", direction: "SHORT", finalScore: 83,
      hasBaseline: true, baselinePrice: 3000, baselineTime: "2026-01-01T00:00:00.000Z",
    });
    const updated = updateWithElapsed(record, 3060, 20 * 60 * 1000); // +2%
    assert.equal(updated.outcome15m, "LOSS", "SHORT with +2% after 15m should be LOSS");
    assert.equal(updated.outcomeStatus, "LOSS");
  }

  // 5. WAIT becomes NO_ACTION
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "WAIT", finalScore: 68, completeness: "partial", hasAutoObs: false, hasForward: false, hasBacktest: false, missingFactors: ["auto obs"], positiveFactors: [] });
    const record = tracker.buildPaperOutcomeRecord(cand, { price: 50000, time: "2026-01-01T00:00:00.000Z" });
    assert.equal(record.outcome15m, "NO_ACTION", "WAIT direction should be NO_ACTION");
    assert.equal(record.outcome1h, "NO_ACTION");
    assert.equal(record.outcome4h, "NO_ACTION");
    assert.equal(record.outcomeStatus, "NO_ACTION");
  }

  // 6. BLOCKED stays BLOCKED
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 35, riskStatus: "BLOCKED", riskReason: "blocked", integrityScore: 30, freshness: "stale", readiness: "ready_with_warnings", completeness: "partial", hasAutoObs: false, hasForward: false, hasBacktest: false, negativeFactors: ["low integrity"], positiveFactors: [] });
    const record = tracker.buildPaperOutcomeRecord(cand, { price: 50000, time: "2026-01-01T00:00:00.000Z" });
    assert.equal(record.outcome15m, "BLOCKED", "BLOCKED candidate should stay BLOCKED");
    assert.equal(record.outcome1h, "BLOCKED");
    assert.equal(record.outcome4h, "BLOCKED");
    assert.equal(record.outcomeStatus, "BLOCKED");
  }

  // 7. Missing baseline price becomes UNAVAILABLE
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const record = tracker.buildPaperOutcomeRecord(cand, null);
    assert.equal(record.baselinePrice, null, "Baseline should be null");
    assert.equal(record.outcome15m, "UNAVAILABLE", "Missing baseline should be UNAVAILABLE");
    assert.equal(record.outcomeStatus, "UNAVAILABLE");
  }

  // 8. Not enough time becomes PENDING
  {
    store.clear();
    const { record } = makeOutcomeWithBaseline({
      symbol: "BTCUSDT", direction: "LONG", finalScore: 83,
      hasBaseline: true, baselinePrice: 50000, baselineTime: "2026-01-01T00:00:00.000Z",
    });
    // Update 5 min later (less than 15m horizon)
    const updated = updateWithElapsed(record, 51000, 5 * 60 * 1000);
    assert.equal(updated.outcome15m, "PENDING", "5 min after should be PENDING for 15m horizon");
    assert.equal(updated.outcomeStatus, "PENDING");
  }

  // 9. Flat move becomes FLAT
  {
    store.clear();
    const { record } = makeOutcomeWithBaseline({
      symbol: "BTCUSDT", direction: "LONG", finalScore: 83,
      hasBaseline: true, baselinePrice: 50000, baselineTime: "2026-01-01T00:00:00.000Z",
    });
    // Move only 0.05% (below 0.15% threshold)
    const updated = updateWithElapsed(record, 50025, 20 * 60 * 1000);
    assert.equal(updated.outcome15m, "FLAT", "0.05% move should be FLAT");
    assert.equal(updated.outcomeStatus, "FLAT");
  }

  // 10. Duplicate candidate does not duplicate outcome
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const r1 = tracker.buildPaperOutcomeRecord(cand, { price: 50000, time: "2026-01-01T00:00:00.000Z" });
    const r2 = tracker.buildPaperOutcomeRecord(cand, { price: 50000, time: "2026-01-01T00:00:00.000Z" });
    let history = [];
    history = tracker.addOrUpdatePaperOutcome(history, r1);
    history = tracker.addOrUpdatePaperOutcome(history, r2);
    assert.equal(history.length, 1, "Duplicate candidate should not duplicate outcome");
  }

  // 11. Malformed localStorage records rejected safely
  {
    store.clear();
    store.set("chanter-paper-outcome-history", JSON.stringify([
      { notARecord: true },
      null,
      "string",
      { id: "x", sourceCandidateId: "y", symbol: "BTCUSDT" }, // missing some fields but has required ones
    ]));
    const records = tracker.loadPaperOutcomeHistory();
    assert.ok(records.length <= 1, "Malformed records should be rejected");
    assert.ok(records.every((r) => r.symbol !== undefined), "All loaded records must have symbol");
  }

  // 12. Export/import stays backward compatible (no persistence in backup = live computed)
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const r = tracker.buildPaperOutcomeRecord(cand, { price: 50000, time: "2026-01-01T00:00:00.000Z" });
    let history = [];
    history = tracker.addOrUpdatePaperOutcome(history, r);
    tracker.savePaperOutcomeHistory(history);
    const loaded = tracker.loadPaperOutcomeHistory();
    assert.equal(loaded.length, 1, "Should load 1 record");
    assert.equal(loaded[0].symbol, "BTCUSDT", "Symbol should match");
    assert.equal(loaded[0].baselinePrice, 50000, "Baseline price should match");
    // Old record without new fields should normalize safely
    const oldRecord = {
      id: "outcome-old-1",
      sourceCandidateId: "cand-old-1",
      symbol: "ETHUSDT",
      timeframe: "15m",
      direction: "LONG",
      action: "REVIEW",
      candidateStatus: "REVIEW",
      reasonCode: "REVIEW_READY",
      reasonSummary: "test",
      rankScore: 83,
      finalScore: 83,
      evidenceCompleteness: "complete",
      integrityScore: 90,
      integrityReadiness: "ready",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      outcome15m: "WIN",
      outcome1h: "PENDING",
      outcome4h: "PENDING",
      outcomeStatus: "WIN",
      outcomeSummary: "ETHUSDT: WIN",
    };
    const normalized = tracker.normalizePaperOutcomeRecord(oldRecord);
    assert.ok(normalized !== null, "Old record should normalize");
    assert.equal(normalized.baselinePrice, null, "Missing baselinePrice defaults to null");
    assert.equal(normalized.changePct, null, "Missing changePct defaults to null");
  }

  // 13. No trade/order/position/execution fields in output
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const r = tracker.buildPaperOutcomeRecord(cand, { price: 50000, time: "2026-01-01T00:00:00.000Z" });
    const json = JSON.stringify(r);
    const forbidden = ["tradeId", "orderId", "positionId", "execution", "buy", "sell", "openPosition", "submitOrder"];
    for (const field of forbidden) {
      assert.ok(!json.includes('"' + field + '"'), "Outcome must not contain: " + field);
    }
  }

  // 14. Summary computes correctly
  {
    store.clear();
    const cand1 = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const cand2 = makeCandidate({ symbol: "ETHUSDT", direction: "SHORT", finalScore: 83 });
    const cand3 = makeCandidate({ symbol: "SOLUSDT", direction: "WAIT", finalScore: 68, completeness: "partial", hasAutoObs: false, hasForward: false, hasBacktest: false, missingFactors: ["auto obs"], positiveFactors: [] });
    const r1 = tracker.buildPaperOutcomeRecord(cand1, { price: 50000, time: "2026-01-01T00:00:00.000Z" });
    const r2 = tracker.buildPaperOutcomeRecord(cand2, { price: 3000, time: "2026-01-01T00:00:00.000Z" });
    const r3 = tracker.buildPaperOutcomeRecord(cand3, { price: 100, time: "2026-01-01T00:00:00.000Z" });
    const u1 = updateWithElapsed(r1, 51000, 20 * 60 * 1000); // WIN
    const u2 = updateWithElapsed(r2, 3060, 20 * 60 * 1000); // LOSS (SHORT, price up)
    const summary = tracker.buildPaperOutcomeSummary([u1, u2, r3]);
    assert.equal(summary.total, 3);
    assert.equal(summary.wins, 1);
    assert.equal(summary.losses, 1);
    assert.equal(summary.noAction, 1);
    assert.equal(summary.measurable, 2);
    assert.ok(summary.winRate === 50, "Win rate should be 50%");
  }

  // 15. Filter and sort work correctly
  {
    store.clear();
    const cand1 = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const cand2 = makeCandidate({ symbol: "ETHUSDT", direction: "WAIT", finalScore: 68, completeness: "partial", hasAutoObs: false, hasForward: false, hasBacktest: false, missingFactors: ["auto obs"], positiveFactors: [] });
    const r1 = tracker.buildPaperOutcomeRecord(cand1, { price: 50000, time: "2026-01-01T00:00:00.000Z" });
    const r2 = tracker.buildPaperOutcomeRecord(cand2, { price: 3000, time: "2026-01-01T00:00:00.000Z" });
    const u1 = updateWithElapsed(r1, 51000, 20 * 60 * 1000); // WIN
    const records = [u1, r2];
    const wins = tracker.filterPaperOutcomes(records, "WIN");
    assert.equal(wins.length, 1);
    assert.equal(wins[0].outcomeStatus, "WIN");
    const sorted = tracker.sortPaperOutcomes(records);
    assert.equal(sorted[0].outcomeStatus, "WIN", "WIN should sort first");
    assert.equal(sorted[1].outcomeStatus, "NO_ACTION");
  }

  // 16. 1h and 4h horizons work
  {
    store.clear();
    const { record } = makeOutcomeWithBaseline({
      symbol: "BTCUSDT", direction: "LONG", finalScore: 83,
      hasBaseline: true, baselinePrice: 50000, baselineTime: "2026-01-01T00:00:00.000Z",
    });
    // 70 min later = 1h horizon resolved, 15m resolved
    const u1 = updateWithElapsed(record, 50500, 70 * 60 * 1000); // +1%
    assert.equal(u1.outcome15m, "WIN", "15m should be WIN");
    assert.equal(u1.outcome1h, "WIN", "1h should be WIN");
    assert.equal(u1.outcome4h, "PENDING", "4h should be PENDING");
    // 250 min later = all resolved
    const u2 = updateWithElapsed(record, 50500, 250 * 60 * 1000);
    assert.equal(u2.outcome4h, "WIN", "4h should be WIN after 250 min");
  }

  // 17. getTopOutcomeStats returns summary
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const r = tracker.buildPaperOutcomeRecord(cand, { price: 50000, time: "2026-01-01T00:00:00.000Z" });
    const u = updateWithElapsed(r, 51000, 20 * 60 * 1000);
    const stats = tracker.getTopOutcomeStats([u]);
    assert.equal(stats.total, 1);
    assert.equal(stats.wins, 1);
    assert.equal(stats.winRate, 100);
  }

  // 18. Empty records handled safely
  {
    store.clear();
    const summary = tracker.buildPaperOutcomeSummary([]);
    assert.equal(summary.total, 0);
    assert.equal(summary.winRate, 0);
    assert.equal(summary.avgChangePct, null);
    const stats = tracker.getTopOutcomeStats([]);
    assert.equal(stats.total, 0);
    const top = tracker.sortPaperOutcomes([]);
    assert.equal(top.length, 0);
  }

  console.log(
    "Paper Outcome Tracker v1 verification passed: LONG win/loss, SHORT win/loss, " +
    "WAIT=NO_ACTION, BLOCKED stays BLOCKED, missing baseline=UNAVAILABLE, " +
    "not enough time=PENDING, flat move=FLAT, no duplicates, malformed safe, " +
    "backward compatible, no execution fields, summary correct, filter/sort work, " +
    "1h/4h horizons work, top stats correct, empty safe."
  );
} finally {
  await server.close();
}
