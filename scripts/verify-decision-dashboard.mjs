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
  const dd = await server.ssrLoadModule("/src/lib/decisionDashboard.ts");
  const cq = await server.ssrLoadModule("/src/lib/candidateReviewQueue.ts");
  const ranking = await server.ssrLoadModule("/src/lib/opportunityRanking.ts");
  const quality = await server.ssrLoadModule("/src/lib/signalQualityScore.ts");
  const tracker = await server.ssrLoadModule("/src/lib/paperOutcomeTracker.ts");

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
        integrityFreshness: opts.freshness ?? "current", integrityReadiness: opts.readiness ?? "ready", hasAutoObservations: opts.hasAutoObs !== false, autoObsCount: 5,
        autoObsLatestSymbol: opts.symbol ?? "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: opts.hasForward !== false,
        forwardObsCount: 3, forwardLatestDirection: opts.direction ?? "LONG", hasBacktest: opts.hasBacktest !== false,
        backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: opts.riskStatus ?? (opts.direction === "WAIT" ? "WAIT" : "APPROVED"),
        completeness: opts.completeness ?? "complete", positiveFactors: opts.positiveFactors ?? ["good integrity"], negativeFactors: opts.negativeFactors ?? [], missingFactors: opts.missingFactors ?? [],
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

  function makeSnapshot(opts) {
    const candidates = opts.candidates ?? [];
    const rankings = opts.rankings ?? ranking.buildOpportunityRankings(candidates);
    const outcomeSummary = opts.outcomeSummary ?? null;
    const outcomeSymbolSummaries = opts.outcomeSymbolSummaries ?? [];
    return dd.buildDecisionDashboardSnapshot({
      candidates,
      rankings,
      latestSignalQuality: opts.latestSignalQuality ?? null,
      latestIntegrity: opts.latestIntegrity ?? null,
      outcomeSummary,
      outcomeSymbolSummaries,
      cycleState: opts.cycleState ?? null,
    });
  }

  // 1. Empty state works
  {
    store.clear();
    const snapshot = makeSnapshot({ candidates: [] });
    assert.equal(snapshot.hasData, false);
    assert.equal(snapshot.primary, null);
    assert.equal(snapshot.topDecisions.length, 0);
    assert.equal(snapshot.totalCandidates, 0);
  }

  // 2. BLOCKED candidate never becomes REVIEW
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 35, riskStatus: "BLOCKED", riskReason: "blocked", integrityScore: 30, freshness: "stale", readiness: "ready_with_warnings", completeness: "partial", hasAutoObs: false, hasForward: false, hasBacktest: false, negativeFactors: ["low integrity"], positiveFactors: [], missingFactors: ["auto obs"] });
    const snapshot = makeSnapshot({ candidates: [cand] });
    assert.ok(snapshot.primary, "Must have primary decision");
    assert.notEqual(snapshot.primary.action, "REVIEW");
    assert.equal(snapshot.primary.action, "IGNORE");
  }

  // 3. REVIEW candidate with strong evidence becomes REVIEW
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, completeness: "complete", integrityScore: 90 });
    const snapshot = makeSnapshot({ candidates: [cand] });
    assert.equal(snapshot.primary.action, "REVIEW");
    assert.ok(snapshot.primary.confidenceLabel === "HIGH" || snapshot.primary.confidenceLabel === "MEDIUM");
  }

  // 4. Medium candidate becomes WATCH
  {
    store.clear();
    const cand = makeCandidate({ symbol: "ETHUSDT", direction: "LONG", finalScore: 68, completeness: "partial", hasAutoObs: false, hasForward: false, hasBacktest: false, missingFactors: ["auto obs"], positiveFactors: [] });
    const snapshot = makeSnapshot({ candidates: [cand] });
    assert.equal(snapshot.primary.action, "WATCH");
  }

  // 5. Stale/incomplete integrity becomes WAIT
  {
    store.clear();
    const cand = makeCandidate({ symbol: "SOLUSDT", direction: "LONG", finalScore: 83, freshness: "stale", readiness: "not_ready", integrityScore: 40 });
    const snapshot = makeSnapshot({ candidates: [cand] });
    assert.equal(snapshot.primary.action, "WAIT");
  }

  // 6. Low score becomes IGNORE
  {
    store.clear();
    const cand = makeCandidate({ symbol: "ADAUSDT", direction: "LONG", finalScore: 25, integrityScore: 30, freshness: "stale", readiness: "not_ready", completeness: "missing", hasAutoObs: false, hasForward: false, hasBacktest: false, positiveFactors: [], missingFactors: ["everything"] });
    const snapshot = makeSnapshot({ candidates: [cand] });
    assert.equal(snapshot.primary.action, "IGNORE");
  }

  // 7. Proof bullets include outcome summary when available
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const outcomeSummary = { total: 5, pending: 2, wins: 2, losses: 1, flat: 0, blocked: 0, noAction: 0, unavailable: 0, measurable: 3, winRate: 66.7, avgChangePct: 1.5 };
    const outcomeSymbolSummaries = [{ symbol: "BTCUSDT", total: 5, wins: 2, losses: 1, flat: 0, blocked: 0, noAction: 0, pending: 2, unavailable: 0, measurable: 3, measurableWinRate: 66.7, averageMovePct: 1.5, latestOutcomeAt: "2026-01-01T00:00:00.000Z" }];
    const snapshot = makeSnapshot({ candidates: [cand], outcomeSummary, outcomeSymbolSummaries });
    assert.ok(snapshot.primary.proofBullets.length > 0);
    assert.ok(snapshot.primary.proofBullets.some((b) => b.includes("5 tracked")));
    assert.ok(snapshot.primary.proofBullets.some((b) => b.includes("66.7%")));
  }

  // 8. Missing data bullets show missing integrity/outcome/evidence
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const snapshot = makeSnapshot({ candidates: [cand], latestIntegrity: null, outcomeSymbolSummaries: [] });
    assert.ok(snapshot.primary.missingDataBullets.some((b) => b.includes("No forward outcome")));
    assert.ok(snapshot.primary.missingDataBullets.some((b) => b.includes("No market data integrity")));
  }

  // 9. Deterministic ordering
  {
    store.clear();
    const cand1 = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const cand2 = makeCandidate({ symbol: "ETHUSDT", direction: "LONG", finalScore: 83 });
    const candidates = [cand1, cand2];
    const s1 = makeSnapshot({ candidates });
    const s2 = makeSnapshot({ candidates });
    assert.deepEqual(
      s1.topDecisions.map((d) => d.symbol),
      s2.topDecisions.map((d) => d.symbol),
      "Must be deterministic",
    );
  }

  // 10. No execution/order/position fields in decision output
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const snapshot = makeSnapshot({ candidates: [cand] });
    const json = JSON.stringify(snapshot);
    const forbidden = ["tradeId", "orderId", "positionId", "execution", "buy", "sell", "openPosition", "submitOrder", "executeTrade"];
    for (const field of forbidden) {
      assert.ok(!json.includes('"' + field + '"'), "Decision must not contain: " + field);
    }
  }

  // 11. getPrimaryDecision returns the top decision
  {
    store.clear();
    const cand1 = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const cand2 = makeCandidate({ symbol: "ETHUSDT", direction: "LONG", finalScore: 68, completeness: "partial", hasAutoObs: false, hasForward: false, hasBacktest: false, missingFactors: ["auto obs"], positiveFactors: [] });
    const snapshot = makeSnapshot({ candidates: [cand1, cand2] });
    const primary = dd.getPrimaryDecision(snapshot);
    assert.ok(primary);
    assert.equal(primary.action, "REVIEW");
  }

  // 12. getDecisionActionLabel and confidence label work
  {
    assert.equal(dd.getDecisionActionLabel("REVIEW"), "Review candidate ready");
    assert.equal(dd.getDecisionActionLabel("WATCH"), "Worth watching");
    assert.equal(dd.getDecisionActionLabel("WAIT"), "Waiting for conditions");
    assert.equal(dd.getDecisionActionLabel("IGNORE"), "Ignore for now");
    assert.equal(dd.getDecisionConfidenceLabel("HIGH"), "High confidence");
    assert.equal(dd.getDecisionConfidenceLabel("MEDIUM"), "Medium confidence");
    assert.equal(dd.getDecisionConfidenceLabel("LOW"), "Low confidence");
  }

  // 13. getDecisionProofSummary returns first proof bullet
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const snapshot = makeSnapshot({ candidates: [cand] });
    const proof = dd.getDecisionProofSummary(snapshot.primary);
    assert.ok(proof.length > 0);
  }

  // 14. Old localStorage absence does not crash
  {
    store.clear();
    const snapshot = makeSnapshot({ candidates: [] });
    assert.equal(snapshot.hasData, false);
    assert.equal(snapshot.primary, null);
  }

  // 15. DISMISSED candidates excluded
  {
    store.clear();
    const cand1 = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const cand2 = makeCandidate({ symbol: "ETHUSDT", direction: "LONG", finalScore: 83 });
    cq.addOrUpdateCandidate(cand1);
    cq.addOrUpdateCandidate(cand2);
    const candidates = cq.loadCandidateReviewQueue();
    cq.dismissCandidate(candidates[0].id, "Not interested");
    const refreshed = cq.loadCandidateReviewQueue();
    const active = refreshed.filter((c) => c.candidateStatus !== "DISMISSED");
    const snapshot = makeSnapshot({ candidates: active });
    assert.equal(snapshot.totalCandidates, 1);
  }


  // 16. loadDecisionDashboardInputs returns empty state when no localStorage keys exist
  {
    store.clear();
    const input = dd.loadDecisionDashboardInputs();
    assert.equal(input.candidates.length, 0);
    assert.equal(input.latestSignalQuality, null);
    assert.equal(input.latestIntegrity, null);
    assert.equal(input.outcomeSummary, null);
    assert.equal(input.outcomeSymbolSummaries.length, 0);
    const snapshot = dd.buildDecisionDashboardSnapshot(input);
    assert.equal(snapshot.hasData, false);
    assert.equal(snapshot.primary, null);
  }

  // 17. Malformed localStorage does not crash loader
  {
    store.clear();
    store.set("chanter-candidate-review-queue", "not-json");
    store.set("chanter-signal-quality-history", JSON.stringify([{ garbage: true }]));
    store.set("chanter-market-data-integrity-history", JSON.stringify([null, 42]));
    store.set("chanter-paper-outcome-history", "broken");
    const input = dd.loadDecisionDashboardInputs();
    assert.ok(input.candidates.length === 0, "Malformed candidates must not crash");
    assert.equal(input.latestSignalQuality, null);
    assert.equal(input.latestIntegrity, null);
    assert.equal(input.outcomeSummary, null);
  }

  // 18. Latest signal quality history is loaded
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    cq.addOrUpdateCandidate(cand);
    // Save a signal quality record
    const sr = quality.createSignalQualityRecord({
      profile: "Trend Follow", scenario: "Trending Up", symbol: "BTCUSDT", leverage: 2,
      direction: "LONG", confidence: "High", stopLossPercent: 3, takeProfitPercent: 6,
      riskStatus: "APPROVED", riskReason: "ok", riskRewardRatio: 2,
      backtestEvidence: { status: "positive", runId: "bt1", tradesTaken: 10, winRate: 60, netPnl: 200, maxDrawdown: 5, profitFactor: 1.5 },
      forwardEvidence: { status: "consistent", observationCount: 5, actionableCount: 5, approvedCount: 4, blockedCount: 0, waitCount: 0, directionConsistencyPercent: 80 },
      dataFreshness: "fresh", localMockOnly: true,
    }, "2026-01-01T00:00:00.000Z");
    quality.saveSignalQualityHistory([sr]);
    const input = dd.loadDecisionDashboardInputs();
    assert.ok(input.latestSignalQuality !== null, "Latest signal quality must be loaded");
    assert.equal(input.latestSignalQuality.input.symbol, "BTCUSDT");
  }

  // 19. Latest market integrity history is loaded
  {
    store.clear();
    // Use the existing makeIntegrity helper from the candidate test to build a valid report
    // Actually, use runIntegrityCheckForLive from liveCandleProvider for a real report
    const { runIntegrityCheckForLive } = await server.ssrLoadModule("/src/lib/liveCandleProvider.ts");
    const { saveMarketDataIntegrityHistory } = await server.ssrLoadModule("/src/lib/marketDataIntegrity.ts");
    // Build mock candles
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    const candles = [];
    for (let i = 0; i < 100; i++) {
      const t = new Date(now - (99 - i) * 15 * 60 * 1000).toISOString();
      const price = 50000 + i * 10;
      candles.push({ timestamp: t, open: price, high: price + 50, low: price - 50, close: price, volume: 100, source: "LIVE_READ_ONLY", symbol: "BTCUSDT", timeframe: "15m" });
    }
    const report = runIntegrityCheckForLive("BTCUSDT", candles, "2026-01-01T00:00:00.000Z");
    saveMarketDataIntegrityHistory([report]);
    const input = dd.loadDecisionDashboardInputs();
    assert.ok(input.latestIntegrity !== null, "Latest integrity must be loaded");
    assert.equal(input.latestIntegrity.symbol, "BTCUSDT");
  }

  // 20. Paper outcome summaries are included
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const outcome = tracker.buildPaperOutcomeRecord(cand, { price: 50000, time: "2026-01-01T00:00:00.000Z" });
    let history = [];
    history = tracker.addOrUpdatePaperOutcome(history, outcome);
    tracker.savePaperOutcomeHistory(history);
    const input = dd.loadDecisionDashboardInputs();
    assert.ok(input.outcomeSummary !== null, "Outcome summary must be loaded");
    assert.equal(input.outcomeSummary.total, 1);
    assert.ok(input.outcomeSymbolSummaries.length > 0, "Symbol summaries must be loaded");
  }

  // 21. Candidate queue feeds primary decision
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    cq.addOrUpdateCandidate(cand);
    const input = dd.loadDecisionDashboardInputs();
    assert.ok(input.candidates.length > 0, "Candidates must be loaded");
    const snapshot = dd.buildDecisionDashboardSnapshot(input);
    assert.ok(snapshot.primary !== null, "Must have primary decision");
    assert.equal(snapshot.primary.symbol, "BTCUSDT");
    assert.equal(snapshot.primary.action, "REVIEW");
  }

  // 22. Dashboard card can build from loaded data (full integration)
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    cq.addOrUpdateCandidate(cand);
    const sr = quality.createSignalQualityRecord({
      profile: "Trend Follow", scenario: "Trending Up", symbol: "BTCUSDT", leverage: 2,
      direction: "LONG", confidence: "High", stopLossPercent: 3, takeProfitPercent: 6,
      riskStatus: "APPROVED", riskReason: "ok", riskRewardRatio: 2,
      backtestEvidence: { status: "positive", runId: "bt1", tradesTaken: 10, winRate: 60, netPnl: 200, maxDrawdown: 5, profitFactor: 1.5 },
      forwardEvidence: { status: "consistent", observationCount: 5, actionableCount: 5, approvedCount: 4, blockedCount: 0, waitCount: 0, directionConsistencyPercent: 80 },
      dataFreshness: "fresh", localMockOnly: true,
    }, "2026-01-01T00:00:00.000Z");
    quality.saveSignalQualityHistory([sr]);
    const input = dd.loadDecisionDashboardInputs();
    const snapshot = dd.buildDecisionDashboardSnapshot(input);
    assert.ok(snapshot.primary, "Must have primary from full data");
    assert.ok(snapshot.primary.evidenceBullets.length > 0, "Must have evidence");
    assert.ok(snapshot.primary.proofBullets.length > 0, "Must have proof");
  }

  // 23. No execution fields in full loaded output
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    cq.addOrUpdateCandidate(cand);
    const input = dd.loadDecisionDashboardInputs();
    const snapshot = dd.buildDecisionDashboardSnapshot(input);
    const json = JSON.stringify(snapshot);
    const forbidden = ["tradeId", "orderId", "positionId", "execution", "buy", "sell", "openPosition"];
    for (const field of forbidden) {
      assert.ok(!json.includes('"' + field + '"'), "Loaded output must not contain: " + field);
    }
  }

  // 24. Blocked candidate still cannot become REVIEW with full loaded data
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 35, riskStatus: "BLOCKED", riskReason: "blocked", integrityScore: 30, freshness: "stale", readiness: "ready_with_warnings", completeness: "partial", hasAutoObs: false, hasForward: false, hasBacktest: false, negativeFactors: ["low integrity"], positiveFactors: [], missingFactors: ["auto obs"] });
    cq.addOrUpdateCandidate(cand);
    const input = dd.loadDecisionDashboardInputs();
    const snapshot = dd.buildDecisionDashboardSnapshot(input);
    assert.notEqual(snapshot.primary.action, "REVIEW", "BLOCKED must never be REVIEW");
  }

  console.log(
    "Decision Dashboard v1.1 runtime QA verification passed: empty state, BLOCKED never REVIEW, " +
    "REVIEW with strong evidence, WATCH for medium, WAIT for stale, IGNORE for low, " +
    "proof bullets, missing data bullets, deterministic, no execution fields, " +
    "primary decision, labels, proof summary, old localStorage safe, dismissed excluded."
  );
} finally {
  await server.close();
}
