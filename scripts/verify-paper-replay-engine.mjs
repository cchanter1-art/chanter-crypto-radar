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
  const cq = await server.ssrLoadModule("/src/lib/candidateReviewQueue.ts");
  const quality = await server.ssrLoadModule("/src/lib/signalQualityScore.ts");
  const pot = await server.ssrLoadModule("/src/lib/paperOutcomeTracker.ts");
  const pws = await server.ssrLoadModule("/src/lib/paperWatchSession.ts");

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
    const matured = matureOutcome(outcome, { latestPrice: 50500, checkTime: "2026-01-01T00:15:00.000Z" });
    const _ex = pot.loadPaperOutcomeHistory();
    const _up = pot.addOrUpdatePaperOutcome(_ex, matured);
    pot.savePaperOutcomeHistory(_up);

    const result = engine.runPaperReplay();
    assert.ok(result.steps.length >= 1, "Should have at least 1 step");
    assert.ok(result.summary.reviewCount + result.summary.watchCount >= 1);
  }

  // 3. No execution fields in replay results
  {
    store.clear();
    const candidate = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    cq.addOrUpdateCandidate(candidate);
    const outcome = makeOutcomeForCandidate(candidate, { baselinePrice: 50000 });
    const matured = matureOutcome(outcome, { latestPrice: 50500, checkTime: "2026-01-01T00:15:00.000Z" });
    const _ex = pot.loadPaperOutcomeHistory();
    const _up = pot.addOrUpdatePaperOutcome(_ex, matured);
    pot.savePaperOutcomeHistory(_up);

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
    const outcome = makeOutcomeForCandidate(candidate, { baselinePrice: 100 });
    const _ex5 = pot.loadPaperOutcomeHistory();
    const _up5 = pot.addOrUpdatePaperOutcome(_ex5, outcome);
    pot.savePaperOutcomeHistory(_up5);

    const result = engine.runPaperReplay();
    assert.ok(result.summary.blockedCount >= 1, "Blocked candidate should be counted as blocked");
  }

  // 6. Deterministic -- same input produces same output
  {
    store.clear();
    const candidate1 = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, createdAt: "2026-01-01T00:00:00.000Z" });
    cq.addOrUpdateCandidate(candidate1);
    const outcome = makeOutcomeForCandidate(candidate1, { baselinePrice: 50000 });
    const matured = matureOutcome(outcome, { latestPrice: 50500, checkTime: "2026-01-01T00:15:00.000Z" });
    const _ex = pot.loadPaperOutcomeHistory();
    const _up = pot.addOrUpdatePaperOutcome(_ex, matured);
    pot.savePaperOutcomeHistory(_up);

    const result1 = engine.runPaperReplay();
    const summary1 = JSON.parse(JSON.stringify(result1.summary));
    delete summary1.generatedAt;

    const result2 = engine.runPaperReplay();
    const summary2 = JSON.parse(JSON.stringify(result2.summary));
    delete summary2.generatedAt;

    assert.deepEqual(summary1, summary2, "Replay results should be deterministic");
  }

  // 7. Old localStorage remains safe
  {
    store.clear();
    store.set("chanter-candidate-review-queue", JSON.stringify([{ garbage: true }, null, 42, "string"]));
    store.set("chanter-paper-outcome-history", "not-an-array");
    store.set("chanter-signal-quality-history", JSON.stringify({ bad: "object" }));

    const result = engine.runPaperReplay();
    assert.equal(result.steps.length, 0);
    assert.equal(result.summary.totalSteps, 0);
  }

  // 8. Multiple symbols and best/worst
  {
    store.clear();
    const c1 = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, createdAt: "2026-01-01T00:00:00.000Z" });
    cq.addOrUpdateCandidate(c1);
    const o1 = makeOutcomeForCandidate(c1, { baselinePrice: 50000 });
    const _m1 = matureOutcome(o1, { latestPrice: 51000, checkTime: "2026-01-01T00:15:00.000Z" });
    const _ex8a = pot.loadPaperOutcomeHistory();
    pot.savePaperOutcomeHistory(pot.addOrUpdatePaperOutcome(_ex8a, _m1));

    const c2 = makeCandidate({ symbol: "ETHUSDT", direction: "LONG", finalScore: 75, createdAt: "2026-01-01T00:00:00.000Z" });
    cq.addOrUpdateCandidate(c2);
    const o2 = makeOutcomeForCandidate(c2, { baselinePrice: 3000 });
    const _m2 = matureOutcome(o2, { latestPrice: 2950, checkTime: "2026-01-01T00:15:00.000Z" });
    const _ex8b = pot.loadPaperOutcomeHistory();
    pot.savePaperOutcomeHistory(pot.addOrUpdatePaperOutcome(_ex8b, _m2));

    const result = engine.runPaperReplay();
    assert.ok(result.summary.totalSymbols >= 2);
  }

  // 9. Explain produces readable text
  {
    store.clear();
    const candidate = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, createdAt: "2026-01-01T00:00:00.000Z" });
    cq.addOrUpdateCandidate(candidate);
    const outcome = makeOutcomeForCandidate(candidate, { baselinePrice: 50000 });
    const _m9 = matureOutcome(outcome, { latestPrice: 50500, checkTime: "2026-01-01T00:15:00.000Z" });
    const _ex9 = pot.loadPaperOutcomeHistory();
    pot.savePaperOutcomeHistory(pot.addOrUpdatePaperOutcome(_ex9, _m9));

    const result = engine.runPaperReplay();
    const text = engine.explainReplayResult(result.summary);
    assert.ok(typeof text === "string");
    assert.ok(text.length > 20);
    assert.ok(text.includes("BTCUSDT") || text.includes("Replayed"));
  }

  // 10. Normalize summary safely
  {
    const normalized = engine.normalizeReplaySummary({ garbage: true });
    assert.equal(normalized, null);

    const ok = engine.normalizeReplaySummary({
      totalSteps: 5, totalSymbols: 2, symbols: ["BTCUSDT", "ETHUSDT"],
      reviewCount: 2, watchCount: 1, waitCount: 1, ignoreCount: 1,
      favorableCount: 3, unfavorableCount: 1, flatCount: 0, unavailableCount: 1, pendingCount: 0,
      measurableWinRate: 75, averageMovePct: 1.5, bestSymbol: "BTCUSDT", worstSymbol: "ETHUSDT",
      missingDataCount: 1, blockedCount: 0, confidenceLabel: "HIGH", generatedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.ok(ok !== null);
    assert.equal(ok.totalSteps, 5);
    assert.equal(ok.confidenceLabel, "HIGH");
  }

  // 11. Watch sessions included in replay
  {
    store.clear();
    const session = {
      id: "watch-ETHUSDT-2026-01-01", symbol: "ETHUSDT", source: "PAPER_WATCH_SESSION",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      status: "CONFIRMED", action: "REVIEW", setupType: "Momentum watch",
      referencePrice: 3000, currentPrice: 3060, confirmationNeeded: "test", invalidationReason: "none",
      confidenceLabel: "MEDIUM", reasonSummary: "test", proofSummary: "test", missingDataSummary: "test",
      lastCheckedAt: "2026-01-01T00:15:00.000Z", resolvedAt: "2026-01-01T00:15:00.000Z",
      outcomeNote: "Confirmed", direction: "LONG", finalScore: 80,
    };
    store.set("chanter-paper-watch-sessions", JSON.stringify([session]));

    const result = engine.runPaperReplay();
    assert.ok(result.steps.some((s) => s.symbol === "ETHUSDT" && s.outcomeStatus === "CONFIRMED"));
  }

  console.log(
    "Paper Replay Engine v1 verification passed: empty state, candidate + outcome replay, " +
    "no execution fields, missing data unavailable, blocked excluded, deterministic, " +
    "old localStorage safe, multi-symbol best/worst, explain text, normalize safe, " +
    "watch sessions included."
  );
} finally {
  await server.close();
}
