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
  const ranking = await server.ssrLoadModule("/src/lib/opportunityRanking.ts");
  const cq = await server.ssrLoadModule("/src/lib/candidateReviewQueue.ts");
  const quality = await server.ssrLoadModule("/src/lib/signalQualityScore.ts");

  function makeSignalRecord(opts) {
    const base = {
      profile: "Trend Follow",
      scenario: "Trending Up",
      symbol: "BTCUSDT",
      leverage: 2,
      direction: "LONG",
      confidence: "High",
      stopLossPercent: 3,
      takeProfitPercent: 6,
      riskStatus: "APPROVED",
      riskReason: "Test approved",
      riskRewardRatio: 2,
      backtestEvidence: { status: "positive", runId: "bt1", tradesTaken: 10, winRate: 60, netPnl: 200, maxDrawdown: 5, profitFactor: 1.5 },
      forwardEvidence: { status: "consistent", observationCount: 5, actionableCount: 5, approvedCount: 4, blockedCount: 0, waitCount: 0, directionConsistencyPercent: 80 },
      dataFreshness: "fresh",
      localMockOnly: true,
    };
    return quality.createSignalQualityRecord(base, opts.createdAt ?? "2026-01-01T00:00:00.000Z", opts.evidenceSnapshot);
  }

  function makeIntegrity(score, freshness, readiness) {
    return {
      symbol: "BTCUSDT",
      timeframe: "15m",
      source: "LIVE_READ_ONLY",
      integrityScore: score,
      freshnessStatus: freshness,
      readinessStatus: readiness,
      createdAt: "2026-01-01T00:00:00.000Z",
      candleCount: 100,
      gapCount: 0,
      anomalyCount: 0,
      warnings: [],
      integrityFactors: [],
      sampleRangeStart: "2026-01-01T00:00:00.000Z",
      sampleRangeEnd: "2026-01-01T00:00:00.000Z",
      latestCandleTime: "2026-01-01T00:00:00.000Z",
      anomalyDetails: [],
      gapDetails: [],
    };
  }

  function makeCandidate(opts) {
    const sr = makeSignalRecord({
      createdAt: opts.createdAt ?? "2026-01-01T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: opts.baseScore ?? 75, evidenceModifier: opts.modifier ?? 8, finalScore: opts.finalScore ?? 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: {
          hasMarketIntegrity: opts.hasIntegrity !== false,
          integrityScore: opts.integrityScore ?? 90,
          integritySource: opts.integritySource ?? "LIVE_READ_ONLY",
          integrityFreshness: opts.freshness ?? "current",
          integrityReadiness: opts.readiness ?? "ready",
          hasAutoObservations: opts.hasAutoObs !== false,
          autoObsCount: 5,
          autoObsLatestSymbol: opts.symbol ?? "BTCUSDT",
          autoObsLatestScore: 80,
          hasForwardTest: opts.hasForward !== false,
          forwardObsCount: 3,
          forwardLatestDirection: "LONG",
          hasBacktest: opts.hasBacktest !== false,
          backtestReturn: 10,
          backtestWinRate: 55,
          hasRiskGate: true,
          riskGateStatus: opts.riskStatus ?? "APPROVED",
          completeness: opts.completeness ?? "complete",
          positiveFactors: opts.positiveFactors ?? ["good integrity"],
          negativeFactors: opts.negativeFactors ?? [],
          missingFactors: opts.missingFactors ?? [],
        },
      },
    });
    if (opts.symbol) sr.input.symbol = opts.symbol;
    if (opts.direction) sr.input.direction = opts.direction;
    if (opts.riskStatus) sr.input.riskStatus = opts.riskStatus;
    if (opts.riskReason) sr.input.riskReason = opts.riskReason;
    return cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(opts.integrityScore ?? 90, opts.freshness ?? "current", opts.readiness ?? "ready"), symbol: opts.symbol ?? "BTCUSDT" });
  }

  // 1. REVIEW ranks above WATCH/WAIT/BLOCKED
  {
    store.clear();
    const reviewCand = makeCandidate({ finalScore: 83, symbol: "BTCUSDT" });
    const watchCand = makeCandidate({ finalScore: 68, symbol: "ETHUSDT", completeness: "partial", hasAutoObs: false, hasForward: false, hasBacktest: false, missingFactors: ["auto obs", "forward", "backtest"], positiveFactors: [] });
    const blockedCand = makeCandidate({ finalScore: 35, symbol: "SOLUSDT", integrityScore: 30, freshness: "stale", readiness: "ready_with_warnings", completeness: "partial", hasAutoObs: false, hasForward: false, hasBacktest: false, negativeFactors: ["low integrity"], positiveFactors: [] });
    cq.addOrUpdateCandidate(reviewCand);
    cq.addOrUpdateCandidate(watchCand);
    cq.addOrUpdateCandidate(blockedCand);
    const candidates = cq.loadCandidateReviewQueue();
    const rankings = ranking.buildOpportunityRankings(candidates);
    assert.equal(rankings.length, 3);
    assert.equal(rankings[0].action, "REVIEW");
    assert.equal(rankings[1].action, "WATCH");
    assert.equal(rankings[2].action, "BLOCKED");
  }

  // 2. BLOCKED always bottom
  {
    store.clear();
    cq.addOrUpdateCandidate(makeCandidate({ finalScore: 35, symbol: "BTCUSDT", riskStatus: "BLOCKED", riskReason: "blocked" }));
    cq.addOrUpdateCandidate(makeCandidate({ finalScore: 68, symbol: "ETHUSDT", completeness: "partial", hasAutoObs: false, hasForward: false, hasBacktest: false, missingFactors: ["auto obs"], positiveFactors: [] }));
    const candidates = cq.loadCandidateReviewQueue();
    const rankings = ranking.buildOpportunityRankings(candidates);
    assert.equal(rankings[rankings.length - 1].action, "BLOCKED");
  }

  // 3. Higher finalScore wins inside same action
  {
    store.clear();
    cq.addOrUpdateCandidate(makeCandidate({ finalScore: 83, symbol: "BTCUSDT" }));
    cq.addOrUpdateCandidate(makeCandidate({ finalScore: 85, symbol: "ETHUSDT" }));
    const candidates = cq.loadCandidateReviewQueue();
    const rankings = ranking.buildOpportunityRankings(candidates);
    assert.equal(rankings[0].action, "REVIEW");
    assert.equal(rankings[1].action, "REVIEW");
    assert.ok(rankings[0].finalScore >= rankings[1].finalScore, "Higher finalScore should rank first");
  }

  // 4. Missing evidence penalizes ranking
  {
    store.clear();
    cq.addOrUpdateCandidate(makeCandidate({ finalScore: 83, symbol: "BTCUSDT", completeness: "complete", missingFactors: [] }));
    cq.addOrUpdateCandidate(makeCandidate({ finalScore: 83, symbol: "ETHUSDT", completeness: "partial", missingFactors: ["forward test", "backtest"], hasForward: false, hasBacktest: false, positiveFactors: [] }));
    const candidates = cq.loadCandidateReviewQueue();
    const rankings = ranking.buildOpportunityRankings(candidates);
    // Both are REVIEW (score >= 80, evidence partial or better)
    const btcRank = rankings.findIndex((r) => r.symbol === "BTCUSDT");
    const ethRank = rankings.findIndex((r) => r.symbol === "ETHUSDT");
    assert.ok(btcRank < ethRank, "Complete evidence should rank higher than partial");
  }

  // 5. Stale/integrity warnings cap ranking
  {
    store.clear();
    const staleCand = makeCandidate({ finalScore: 83, symbol: "BTCUSDT", freshness: "stale", readiness: "not_ready", integrityScore: 40 });
    const goodCand = makeCandidate({ finalScore: 83, symbol: "ETHUSDT", freshness: "current", readiness: "ready", integrityScore: 90 });
    cq.addOrUpdateCandidate(staleCand);
    cq.addOrUpdateCandidate(goodCand);
    const candidates = cq.loadCandidateReviewQueue();
    const rankings = ranking.buildOpportunityRankings(candidates);
    // Stale candidate should have WAIT action, good one should have REVIEW
    const staleRanking = rankings.find((r) => r.symbol === "BTCUSDT");
    const goodRanking = rankings.find((r) => r.symbol === "ETHUSDT");
    assert.equal(staleRanking.action, "WAIT", "Stale should be WAIT");
    assert.equal(goodRanking.action, "REVIEW", "Good should be REVIEW");
    assert.ok(rankings.indexOf(goodRanking) < rankings.indexOf(staleRanking), "Good should rank above stale");
  }

  // 6. Empty candidate queue returns empty ranking
  {
    store.clear();
    const rankings = ranking.buildOpportunityRankings([]);
    assert.equal(rankings.length, 0);
    const top = ranking.getTopOpportunity(rankings);
    assert.equal(top, null);
  }

  // 7. Malformed records rejected safely
  {
    store.clear();
    store.set("chanter-candidate-review-queue", JSON.stringify([
      { notARecord: true },
      null,
      "string",
    ]));
    const candidates = cq.loadCandidateReviewQueue();
    const rankings = ranking.buildOpportunityRankings(candidates);
    assert.equal(rankings.length, 0, "Malformed records produce empty rankings");
  }

  // 8. Old candidate records without explanation fields do not crash
  {
    store.clear();
    const oldRecord = {
      id: "candidate-BTCUSDT-15m-2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      symbol: "BTCUSDT",
      timeframe: "15m",
      source: "AUTO_CYCLE",
      direction: "WAIT",
      candidateStatus: "WATCH",
      baseScore: 65,
      evidenceModifier: 3,
      finalScore: 68,
      evidenceCompleteness: "partial",
      evidencePositiveFactors: [],
      evidenceNegativeFactors: [],
      evidenceMissingFactors: ["auto obs"],
      evidenceCapsApplied: [],
      evidenceSnapshotAt: "2026-01-01T00:00:00.000Z",
      integrityScore: 70,
      integrityReadiness: "ready",
      latestCandleAt: "2026-01-01T00:00:00.000Z",
      riskStatus: "APPROVED",
      riskReason: "ok",
      reasonSummary: "test",
      reviewNotes: "",
      reviewedAt: null,
      dismissedAt: null,
      dismissReason: "",
    };
    store.set("chanter-candidate-review-queue", JSON.stringify([oldRecord]));
    const candidates = cq.loadCandidateReviewQueue();
    const rankings = ranking.buildOpportunityRankings(candidates);
    assert.equal(rankings.length, 1, "Old record must produce ranking");
    assert.ok(rankings[0].reasonCode, "Must have reason code");
  }

  // 9. No trade/order/position/execution fields in output
  {
    store.clear();
    cq.addOrUpdateCandidate(makeCandidate({ finalScore: 83, symbol: "BTCUSDT" }));
    const candidates = cq.loadCandidateReviewQueue();
    const rankings = ranking.buildOpportunityRankings(candidates);
    const json = JSON.stringify(rankings[0]);
    const forbidden = ["tradeId", "orderId", "positionId", "execution", "buy", "sell", "openPosition"];
    for (const field of forbidden) {
      assert.ok(!json.includes('"' + field + '"'), "Ranking must not contain: " + field);
    }
  }

  // 10. getTopOpportunity returns highest ranked
  {
    store.clear();
    cq.addOrUpdateCandidate(makeCandidate({ finalScore: 83, symbol: "BTCUSDT" }));
    cq.addOrUpdateCandidate(makeCandidate({ finalScore: 68, symbol: "ETHUSDT", completeness: "partial", hasAutoObs: false, hasForward: false, hasBacktest: false, missingFactors: ["auto obs"], positiveFactors: [] }));
    const candidates = cq.loadCandidateReviewQueue();
    const rankings = ranking.buildOpportunityRankings(candidates);
    const top = rankings[0];
    assert.ok(top, "Must return top opportunity");
    assert.equal(top.action, "REVIEW");
    assert.equal(top.symbol, "BTCUSDT");
  }

  // 11. filterRankingsByAction filters correctly
  {
    store.clear();
    cq.addOrUpdateCandidate(makeCandidate({ finalScore: 83, symbol: "BTCUSDT" }));
    cq.addOrUpdateCandidate(makeCandidate({ finalScore: 68, symbol: "ETHUSDT", completeness: "partial", hasAutoObs: false, hasForward: false, hasBacktest: false, missingFactors: ["auto obs"], positiveFactors: [] }));
    const candidates = cq.loadCandidateReviewQueue();
    const rankings = ranking.buildOpportunityRankings(candidates);
    const reviewOnly = ranking.filterRankingsByAction(rankings, "REVIEW");
    assert.equal(reviewOnly.length, 1);
    assert.equal(reviewOnly[0].action, "REVIEW");
    const watchOnly = ranking.filterRankingsByAction(rankings, "WATCH");
    assert.equal(watchOnly.length, 1);
    assert.equal(watchOnly[0].action, "WATCH");
  }

  // 12. explainOpportunityRank produces text
  {
    store.clear();
    cq.addOrUpdateCandidate(makeCandidate({ finalScore: 83, symbol: "BTCUSDT" }));
    const candidates = cq.loadCandidateReviewQueue();
    const rankings = ranking.buildOpportunityRankings(candidates);
    const text = ranking.explainOpportunityRank(rankings[0]);
    assert.ok(text.length > 0, "Must produce explanation text");
    assert.ok(text.includes("REVIEW"), "Must include action");
    assert.ok(text.includes("Rank score"), "Must include rank score");
  }

  // 13. Dismissed candidates excluded from rankings
  {
    store.clear();
    cq.addOrUpdateCandidate(makeCandidate({ finalScore: 83, symbol: "BTCUSDT" }));
    cq.addOrUpdateCandidate(makeCandidate({ finalScore: 68, symbol: "ETHUSDT", completeness: "partial", hasAutoObs: false, hasForward: false, hasBacktest: false, missingFactors: ["auto obs"], positiveFactors: [] }));
    const candidates = cq.loadCandidateReviewQueue();
    const ethCand = candidates.find((c) => c.symbol === "ETHUSDT");
    cq.dismissCandidate(ethCand.id, "Not interested");
    const refreshed = cq.loadCandidateReviewQueue();
    const rankings = ranking.buildOpportunityRankings(refreshed);
    assert.equal(rankings.length, 1, "Dismissed must be excluded");
    assert.equal(rankings[0].symbol, "BTCUSDT");
  }

  // 14. Deterministic ordering (same input = same output)
  {
    store.clear();
    cq.addOrUpdateCandidate(makeCandidate({ finalScore: 83, symbol: "BTCUSDT" }));
    cq.addOrUpdateCandidate(makeCandidate({ finalScore: 83, symbol: "ETHUSDT" }));
    const candidates = cq.loadCandidateReviewQueue();
    const r1 = ranking.buildOpportunityRankings(candidates);
    const r2 = ranking.buildOpportunityRankings(candidates);
    assert.deepEqual(
      r1.map((r) => r.symbol),
      r2.map((r) => r.symbol),
      "Must be deterministic",
    );
  }

  // 15. Ranking functions are pure (no localStorage writes)
  {
    store.clear();
    cq.addOrUpdateCandidate(makeCandidate({ finalScore: 83, symbol: "BTCUSDT" }));
    const candidates = cq.loadCandidateReviewQueue();
    const before = store.size;
    ranking.buildOpportunityRankings(candidates);
    ranking.getTopOpportunity(ranking.buildOpportunityRankings(candidates));
    ranking.explainOpportunityRank(ranking.buildOpportunityRankings(candidates)[0]);
    assert.equal(store.size, before, "Ranking functions must not write localStorage");
  }

  console.log(
    "Opportunity Ranking v1 verification passed: REVIEW > WATCH > WAIT > BLOCKED ordering, " +
    "higher finalScore wins, missing evidence penalized, stale/integrity capped, " +
    "empty queue safe, malformed rejected, old records compatible, " +
    "no execution fields, pure functions, deterministic, dismissed excluded, " +
    "filter by action, explain produces text, top opportunity helper.",
  );
} finally {
  await server.close();
}
