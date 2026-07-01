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
  const plan = await server.ssrLoadModule("/src/lib/paperActionPlan.ts");
  const cq = await server.ssrLoadModule("/src/lib/candidateReviewQueue.ts");
  const quality = await server.ssrLoadModule("/src/lib/signalQualityScore.ts");

  function makeCandidate(opts) {
    const sr = quality.createSignalQualityRecord({
      profile: "Trend Follow", scenario: "Trending Up", symbol: opts.symbol ?? "BTCUSDT", leverage: 2,
      direction: opts.direction ?? "LONG", confidence: "High", stopLossPercent: 3, takeProfitPercent: 6,
      riskStatus: opts.riskStatus ?? (opts.direction === "WAIT" ? "WAIT" : "APPROVED"),
      riskReason: opts.direction === "WAIT" ? "waiting" : "ok", riskRewardRatio: 2,
      backtestEvidence: { status: "positive", runId: "bt1", tradesTaken: 10, winRate: 60, netPnl: 200, maxDrawdown: 5, profitFactor: 1.5 },
      forwardEvidence: { status: "consistent", observationCount: 5, actionableCount: 5, approvedCount: 4, blockedCount: 0, waitCount: 0, directionConsistencyPercent: 80 },
      dataFreshness: "fresh", localMockOnly: true,
    }, opts.createdAt ?? "2026-01-01T00:00:00.000Z", {
      adjusted: { baseScore: opts.baseScore ?? 75, evidenceModifier: opts.modifier ?? 8, finalScore: opts.finalScore ?? 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
      stack: {
        hasMarketIntegrity: true, integrityScore: opts.integrityScore ?? 90, integritySource: "LIVE_READ_ONLY",
        integrityFreshness: opts.freshness ?? "current", integrityReadiness: opts.readiness ?? "ready",
        hasAutoObservations: opts.hasAutoObs !== false, autoObsCount: 5,
        autoObsLatestSymbol: opts.symbol ?? "BTCUSDT", autoObsLatestScore: 80,
        hasForwardTest: opts.hasForward !== false, forwardObsCount: 3, forwardLatestDirection: opts.direction ?? "LONG",
        hasBacktest: opts.hasBacktest !== false, backtestReturn: 10, backtestWinRate: 55,
        hasRiskGate: true, riskGateStatus: opts.riskStatus ?? (opts.direction === "WAIT" ? "WAIT" : "APPROVED"),
        completeness: opts.completeness ?? "complete", positiveFactors: opts.positiveFactors ?? ["good"], negativeFactors: opts.negativeFactors ?? [], missingFactors: opts.missingFactors ?? [],
      },
    });
    if (opts.symbol) sr.input.symbol = opts.symbol;
    if (opts.direction) sr.input.direction = opts.direction;
    return cq.buildCandidateFromSnapshot({
      signalRecord: sr,
      integrityReport: {
        symbol: opts.symbol ?? "BTCUSDT", timeframe: "15m", source: "LIVE_READ_ONLY",
        integrityScore: opts.integrityScore ?? 90, freshnessStatus: opts.freshness ?? "current", readinessStatus: opts.readiness ?? "ready",
        createdAt: opts.createdAt ?? "2026-01-01T00:00:00.000Z", candleCount: 100, gapCount: 0, anomalyCount: 0,
        warnings: [], integrityFactors: [], sampleRangeStart: "2026-01-01T00:00:00.000Z",
        sampleRangeEnd: "2026-01-01T00:00:00.000Z", latestCandleTime: "2026-01-01T00:00:00.000Z",
        anomalyDetails: [], gapDetails: [],
      },
      symbol: opts.symbol ?? "BTCUSDT",
    });
  }

  // 1. Plan generated for REVIEW candidate with available price
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, completeness: "complete", integrityScore: 90 });
    const p = plan.buildPaperActionPlan(cand, undefined, 50000, null);
    assert.equal(p.symbol, "BTCUSDT");
    assert.equal(p.action, "REVIEW");
    assert.equal(p.referencePrice, 50000);
    assert.ok(p.setupType.includes("Momentum"));
    assert.ok(p.confirmationNeeded.length > 0);
    assert.equal(p.source, "PAPER_PLAN_PREVIEW");
  }

  // 2. BLOCKED candidate produces IGNORE plan
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 35, riskStatus: "BLOCKED", riskReason: "blocked", integrityScore: 30, freshness: "stale", readiness: "ready_with_warnings", completeness: "partial", hasAutoObs: false, hasForward: false, hasBacktest: false, negativeFactors: ["low integrity"], positiveFactors: [], missingFactors: ["auto obs"] });
    const p = plan.buildPaperActionPlan(cand, undefined, 50000, null);
    assert.equal(p.action, "IGNORE");
    assert.ok(p.invalidationReason.includes("Blocked"));
    assert.ok(p.riskNote.includes("BLOCKED"));
  }

  // 3. Missing price produces null referencePrice
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const p = plan.buildPaperActionPlan(cand, undefined, null, null);
    assert.equal(p.referencePrice, null);
    assert.ok(p.setupType.includes("Momentum"));
  }

  // 4. No execution fields in output
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const p = plan.buildPaperActionPlan(cand, undefined, 50000, null);
    const json = JSON.stringify(p);
    const forbidden = ["tradeId", "orderId", "positionId", "executionId", "buy", "sell", "openPosition", "execute"];
    for (const f of forbidden) {
      assert.ok(!json.includes('"' + f + '"'), "Plan must not contain: " + f);
    }
  }

  // 5. Empty state -- getTopPaperActionPlan returns null for no candidates
  {
    store.clear();
    const result = plan.getTopPaperActionPlan([], [], new Map(), []);
    assert.equal(result, null);
  }

  // 6. getTopPaperActionPlan returns highest priority plan
  {
    store.clear();
    const cand1 = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const cand2 = makeCandidate({ symbol: "ETHUSDT", direction: "LONG", finalScore: 68, completeness: "partial", hasAutoObs: false, hasForward: false, hasBacktest: false, missingFactors: ["auto obs"], positiveFactors: [] });
    const priceMap = new Map([["BTCUSDT", 50000], ["ETHUSDT", 3000]]);
    const result = plan.getTopPaperActionPlan([cand1, cand2], [], priceMap, []);
    assert.ok(result);
    assert.equal(result.symbol, "BTCUSDT");
    assert.equal(result.action, "REVIEW");
  }

  // 7. explainPaperActionPlan produces readable text
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const p = plan.buildPaperActionPlan(cand, undefined, 50000, null);
    const text = plan.explainPaperActionPlan(p);
    assert.ok(text.includes("BTCUSDT"));
    assert.ok(text.includes("REVIEW"));
    assert.ok(text.includes("confidence"));
  }

  // 8. WAIT direction produces WAIT plan
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "WAIT", finalScore: 68, completeness: "partial", hasAutoObs: false, hasForward: false, hasBacktest: false, missingFactors: ["auto obs"], positiveFactors: [] });
    const p = plan.buildPaperActionPlan(cand, undefined, 50000, null);
    // Score 68 with WAIT direction: candidateStatus is WATCH, so plan action is WATCH
    assert.equal(p.action, "WATCH");
    assert.ok(p.invalidationReason.includes("directional") || p.invalidationReason.includes("WAIT") || p.invalidationReason.includes("None"));
  }

  // 9. Outcome summary included in plan
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const outcomeSummary = { symbol: "BTCUSDT", total: 5, wins: 3, losses: 1, flat: 1, blocked: 0, noAction: 0, pending: 2, unavailable: 0, measurable: 5, measurableWinRate: 60, averageMovePct: 1.2, latestOutcomeAt: "2026-01-01T00:00:00.000Z" };
    const p = plan.buildPaperActionPlan(cand, undefined, 50000, outcomeSummary);
    assert.equal(p.outcomeTracked, 5);
    assert.equal(p.outcomeWinRate, 60);
  }

  // 10. Deterministic ordering
  {
    store.clear();
    const cand1 = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const cand2 = makeCandidate({ symbol: "ETHUSDT", direction: "LONG", finalScore: 83 });
    const priceMap = new Map([["BTCUSDT", 50000], ["ETHUSDT", 3000]]);
    const r1 = plan.getTopPaperActionPlan([cand1, cand2], [], priceMap, []);
    const r2 = plan.getTopPaperActionPlan([cand1, cand2], [], priceMap, []);
    assert.equal(r1.symbol, r2.symbol, "Must be deterministic");
  }

  console.log(
    "Paper Action Plan v1 verification passed: REVIEW plan with price, BLOCKED -> IGNORE, " +
    "missing price -> null reference, no execution fields, empty state safe, " +
    "top plan selection, explain text, WAIT direction, outcome summary, deterministic."
  );
} finally {
  await server.close();
}
