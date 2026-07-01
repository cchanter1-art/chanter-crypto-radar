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
  const cq = await server.ssrLoadModule("/src/lib/candidateReviewQueue.ts");
  const quality = await server.ssrLoadModule("/src/lib/signalQualityScore.ts");
  const riskApi = await server.ssrLoadModule("/src/lib/paperRiskController.ts");
  const futuresApi = await server.ssrLoadModule("/src/lib/futuresPaperEngine.ts");

  // Helper: create a signal quality record for testing
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
      anomalyDetails: [],
      gapDetails: [],
    };
  }

  // 1. REVIEW candidate when score >= 80 and evidence is sufficient
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-01-01T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: ["good"], negativeFactors: [], missingFactors: [] },
      },
    });
    assert.ok(sr, "Signal record must be created");
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    assert.ok(candidate, "Candidate must be created");
    assert.equal(candidate.candidateStatus, "REVIEW");
    assert.equal(candidate.symbol, "BTCUSDT");
    assert.equal(candidate.finalScore, 83);
  }

  // 2. WATCH candidate when score 60-79
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-01-02T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 65, evidenceModifier: 3, finalScore: 68, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 70, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: false, autoObsCount: 0, autoObsLatestSymbol: null, autoObsLatestScore: null, hasForwardTest: false, forwardObsCount: 0, forwardLatestDirection: null, hasBacktest: false, backtestReturn: null, backtestWinRate: null, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "partial", positiveFactors: [], negativeFactors: [], missingFactors: ["auto obs"] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(70, "current", "ready"), symbol: "BTCUSDT" });
    assert.ok(candidate);
    assert.equal(candidate.candidateStatus, "WATCH");
  }

  // 3. BLOCKED candidate when score < 60
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-01-03T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 40, evidenceModifier: -5, finalScore: 35, label: "Poor", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 30, integritySource: "LOCAL_MOCK", integrityFreshness: "stale", integrityReadiness: "ready_with_warnings", hasAutoObservations: false, autoObsCount: 0, autoObsLatestSymbol: null, autoObsLatestScore: null, hasForwardTest: false, forwardObsCount: 0, forwardLatestDirection: null, hasBacktest: false, backtestReturn: null, backtestWinRate: null, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "partial", positiveFactors: [], negativeFactors: ["low integrity"], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(30, "stale", "ready_with_warnings"), symbol: "BTCUSDT" });
    assert.ok(candidate);
    assert.equal(candidate.candidateStatus, "BLOCKED");
  }

  // 4. STALE candidate when data is stale
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-01-04T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 5, finalScore: 80, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 80, integritySource: "LIVE_READ_ONLY", integrityFreshness: "stale", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 3, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 75, hasForwardTest: false, forwardObsCount: 0, forwardLatestDirection: null, hasBacktest: false, backtestReturn: null, backtestWinRate: null, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "partial", positiveFactors: [], negativeFactors: ["stale"], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(80, "stale", "ready"), symbol: "BTCUSDT" });
    assert.ok(candidate);
    assert.equal(candidate.candidateStatus, "STALE");
  }

  // 5. Risk BLOCKED forces candidate BLOCKED
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-01-05T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 85, evidenceModifier: 5, finalScore: 90, label: "Strong", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 95, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 90, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 15, backtestWinRate: 60, hasRiskGate: true, riskGateStatus: "BLOCKED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    // Override risk status to BLOCKED
    const blockedInput = { ...sr.input, riskStatus: "BLOCKED", riskReason: "Risk blocked" };
    // Can't override input on existing record, so build manually
    const candidate = cq.buildCandidateFromSnapshot({
      signalRecord: { ...sr, input: blockedInput },
      integrityReport: makeIntegrity(95, "current", "ready"),
      symbol: "BTCUSDT",
    });
    assert.ok(candidate);
    assert.equal(candidate.candidateStatus, "BLOCKED");
  }

  // 6. Missing evidence never becomes REVIEW
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-01-06T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 80, evidenceModifier: 8, finalScore: 88, label: "Strong", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: false, integrityScore: null, integritySource: null, integrityFreshness: null, integrityReadiness: null, hasAutoObservations: false, autoObsCount: 0, autoObsLatestSymbol: null, autoObsLatestScore: null, hasForwardTest: false, forwardObsCount: 0, forwardLatestDirection: null, hasBacktest: false, backtestReturn: null, backtestWinRate: null, hasRiskGate: false, riskGateStatus: null, completeness: "missing", positiveFactors: [], negativeFactors: [], missingFactors: ["all"] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: null, symbol: "BTCUSDT" });
    assert.ok(candidate);
    assert.notEqual(candidate.candidateStatus, "REVIEW");
    assert.equal(candidate.candidateStatus, "WATCH");
  }

  // 7. Duplicate candidate updates without creating duplicate
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-01-07T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(candidate);
    const firstCount = cq.loadCandidateReviewQueue().length;
    assert.equal(firstCount, 1);
    // Add same candidate again
    cq.addOrUpdateCandidate(candidate);
    const secondCount = cq.loadCandidateReviewQueue().length;
    assert.equal(secondCount, 1, "Duplicate must not create new row");
    // Original createdAt preserved
    const loaded = cq.loadCandidateReviewQueue()[0];
    assert.equal(loaded.createdAt, candidate.createdAt, "Original createdAt preserved");
  }

  // 8. Cap at 200 candidates
  {
    store.clear();
    for (let i = 0; i < 210; i++) {
      const sr = makeSignalRecord({
        createdAt: new Date(Date.now() - i * 60000).toISOString(),
        evidenceSnapshot: {
          adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
          stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backRate: 55, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
        },
      });
      const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "SYM" + i });
      cq.addOrUpdateCandidate(candidate);
    }
    const loaded = cq.loadCandidateReviewQueue();
    assert.ok(loaded.length <= 200, "Must cap at 200");
  }

  // 9. Malformed candidate import safe
  {
    store.clear();
    store.set("chanter-candidate-review-queue", "not-json");
    const loaded = cq.loadCandidateReviewQueue();
    assert.ok(Array.isArray(loaded));
    assert.equal(loaded.length, 0);

    store.set("chanter-candidate-review-queue", JSON.stringify([{ bad: "data" }]));
    const loaded2 = cq.loadCandidateReviewQueue();
    assert.equal(loaded2.length, 0, "Malformed records filtered out");
  }

  // 10. Old backup import safe (empty queue)
  {
    store.clear();
    const loaded = cq.loadCandidateReviewQueue();
    assert.equal(loaded.length, 0);
  }

  // 11. Export includes candidate queue (via save/load roundtrip)
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-01-10T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: ["good"], negativeFactors: [], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(candidate);
    const raw = store.get("chanter-candidate-review-queue");
    assert.ok(raw, "Queue must be in localStorage");
    const parsed = JSON.parse(raw);
    assert.ok(Array.isArray(parsed));
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].symbol, "BTCUSDT");
  }

  // 12. Dismiss candidate works
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-01-11T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(candidate);
    const loaded = cq.loadCandidateReviewQueue();
    cq.dismissCandidate(loaded[0].id);
    const after = cq.loadCandidateReviewQueue();
    assert.equal(after[0].candidateStatus, "DISMISSED");
    assert.ok(after[0].dismissedAt);
  }

  // 13. Mark reviewed works
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-01-12T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(candidate);
    const loaded = cq.loadCandidateReviewQueue();
    cq.markCandidateReviewed(loaded[0].id, "Looks promising");
    const after = cq.loadCandidateReviewQueue();
    assert.ok(after[0].reviewedAt);
    assert.equal(after[0].reviewNotes, "Looks promising");
  }

  // 14. Clear dismissed works
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-01-13T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(candidate);
    const loaded = cq.loadCandidateReviewQueue();
    cq.dismissCandidate(loaded[0].id);
    cq.clearDismissedCandidates();
    const after = cq.loadCandidateReviewQueue();
    assert.equal(after.length, 0, "Dismissed must be cleared");
  }

  // 15. No paper positions created
  {
    store.clear();
    const futuresApi = await server.ssrLoadModule("/src/lib/futuresPaperEngine.ts");
    const sr = makeSignalRecord({
      createdAt: "2026-01-14T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(candidate);
    assert.equal(futuresApi.loadFuturesPaperPositions().length, 0, "No positions created");
    assert.equal(futuresApi.loadFuturesPaperHistory().length, 0, "No trades created");
  }

  // 16. No execution/order fields on candidate
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-01-15T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    assert.equal(candidate.tradeId, undefined);
    assert.equal(candidate.orderId, undefined);
    assert.equal(candidate.positionId, undefined);
    assert.equal(candidate.execution, undefined);
  }

  // 17. getCandidateSummary works
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-01-16T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(candidate);
    const summary = cq.getCandidateSummary();
    assert.equal(summary.total, 1);
    assert.equal(summary.review, 1);
    assert.equal(summary.watch, 0);
    assert.equal(summary.latestSymbol, "BTCUSDT");
    assert.equal(summary.latestScore, 83);
  }

  // 18. Clear queue works
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-01-17T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(candidate);
    cq.clearCandidateReviewQueue();
    assert.equal(cq.loadCandidateReviewQueue().length, 0);
  }

  // 19. buildCandidateFromSnapshot is pure (no side effects)
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-01-18T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    // Verify nothing was saved to localStorage
    assert.equal(store.size, 0, "buildCandidateFromSnapshot must not write to localStorage");
  }

  // 20. Multiple symbols create separate candidates
  {
    store.clear();
    for (const sym of ["BTCUSDT", "ETHUSDT", "SOLUSDT"]) {
      const sr = makeSignalRecord({
        createdAt: "2026-01-19T00:00:00.000Z",
        evidenceSnapshot: {
          adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
          stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: sym, autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
        },
      });
      const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: sym });
      cq.addOrUpdateCandidate(candidate);
    }
    const loaded = cq.loadCandidateReviewQueue();
    assert.equal(loaded.length, 3, "Three separate candidates");
  }

  // --- Integration Tests (21-35) ---

  // 21. Auto tick creates candidate after successful fetch + integrity + evidence snapshot
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-02-01T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: ["good"], negativeFactors: [], missingFactors: [] },
      },
    });
    const integrity = makeIntegrity(90, "current", "ready");
    integrity.latestCandleTime = "2026-02-01T00:00:00.000Z";
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: integrity, symbol: "BTCUSDT", source: "AUTO_CYCLE" });
    assert.ok(candidate, "Auto tick must produce a candidate");
    assert.equal(candidate.source, "AUTO_CYCLE");
    cq.addOrUpdateCandidate(candidate);
    const loaded = cq.loadCandidateReviewQueue();
    assert.equal(loaded.length, 1, "Queue must have 1 candidate after auto tick");
    assert.equal(loaded[0].candidateStatus, "REVIEW");
  }

  // 22. Failed fetch creates no candidate
  {
    store.clear();
    // Simulate: no signal quality record, no integrity -> no candidate
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: null, integrityReport: null, symbol: "BTCUSDT", source: "AUTO_CYCLE" });
    assert.equal(candidate, null, "Failed fetch (no signal, no integrity) must produce no candidate");
    const loaded = cq.loadCandidateReviewQueue();
    assert.equal(loaded.length, 0, "Queue must be empty after failed fetch");
  }

  // 23. Duplicate candidate updates existing row (preserves createdAt)
  {
    store.clear();
    const sr1 = makeSignalRecord({
      createdAt: "2026-03-01T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const c1 = cq.buildCandidateFromSnapshot({ signalRecord: sr1, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(c1);
    const firstLoaded = cq.loadCandidateReviewQueue();
    assert.equal(firstLoaded.length, 1);
    const originalCreatedAt = firstLoaded[0].createdAt;

    // Add same candidate again (same id = same symbol + same evidenceSnapshotAt)
    const sr2 = makeSignalRecord({
      createdAt: "2026-03-01T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const c2 = cq.buildCandidateFromSnapshot({ signalRecord: sr2, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(c2);
    const secondLoaded = cq.loadCandidateReviewQueue();
    assert.equal(secondLoaded.length, 1, "Duplicate must not add a new row");
    assert.equal(secondLoaded[0].createdAt, originalCreatedAt, "createdAt must be preserved on dedup update");
    assert.ok(secondLoaded[0].updatedAt >= firstLoaded[0].updatedAt, "updatedAt must be >= original on dedup");
  }

  // 24. Summary helper counts correct
  {
    store.clear();
    // REVIEW
    const sr1 = makeSignalRecord({
      createdAt: "2026-04-01T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    cq.addOrUpdateCandidate(cq.buildCandidateFromSnapshot({ signalRecord: sr1, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" }));
    // WATCH
    const sr2 = makeSignalRecord({
      createdAt: "2026-04-02T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 65, evidenceModifier: 3, finalScore: 68, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 70, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: false, autoObsCount: 0, autoObsLatestSymbol: null, autoObsLatestScore: null, hasForwardTest: false, forwardObsCount: 0, forwardLatestDirection: null, hasBacktest: false, backtestReturn: null, backtestWinRate: null, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "partial", positiveFactors: [], negativeFactors: [], missingFactors: ["auto obs"] },
      },
    });
    cq.addOrUpdateCandidate(cq.buildCandidateFromSnapshot({ signalRecord: sr2, integrityReport: makeIntegrity(70, "current", "ready"), symbol: "ETHUSDT" }));
    // BLOCKED
    const sr3 = makeSignalRecord({
      createdAt: "2026-04-03T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 40, evidenceModifier: -5, finalScore: 35, label: "Poor", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 30, integritySource: "LOCAL_MOCK", integrityFreshness: "stale", integrityReadiness: "ready_with_warnings", hasAutoObservations: false, autoObsCount: 0, autoObsLatestSymbol: null, autoObsLatestScore: null, hasForwardTest: false, forwardObsCount: 0, forwardLatestDirection: null, hasBacktest: false, backtestReturn: null, backtestWinRate: null, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "partial", positiveFactors: [], negativeFactors: ["low integrity"], missingFactors: [] },
      },
    });
    cq.addOrUpdateCandidate(cq.buildCandidateFromSnapshot({ signalRecord: sr3, integrityReport: makeIntegrity(30, "stale", "ready_with_warnings"), symbol: "SOLUSDT" }));
    const summary = cq.getCandidateSummary();
    assert.equal(summary.total, 3, "Summary total must be 3");
    assert.equal(summary.review, 1, "Summary review must be 1");
    assert.equal(summary.watch, 1, "Summary watch must be 1");
    assert.equal(summary.blocked, 1, "Summary blocked must be 1");
    assert.equal(summary.stale, 0, "Summary stale must be 0");
    assert.equal(summary.dismissed, 0, "Summary dismissed must be 0");
    assert.ok(summary.latestSymbol, "Latest symbol must be set");
    assert.equal(summary.latestScore, 35, "Latest score must be 35 (BLOCKED added last = newest in queue)");
  }

  // 25. Mark reviewed works
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-05-01T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(candidate);
    const loaded = cq.loadCandidateReviewQueue();
    cq.markCandidateReviewed(loaded[0].id, "Looks promising, will monitor");
    const reviewed = cq.loadCandidateReviewQueue();
    assert.ok(reviewed[0].reviewedAt, "reviewedAt must be set");
    assert.equal(reviewed[0].reviewNotes, "Looks promising, will monitor");
  }

  // 26. Dismiss works
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-06-01T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(candidate);
    const loaded = cq.loadCandidateReviewQueue();
    cq.dismissCandidate(loaded[0].id);
    const dismissed = cq.loadCandidateReviewQueue();
    assert.equal(dismissed[0].candidateStatus, "DISMISSED");
    assert.ok(dismissed[0].dismissedAt, "dismissedAt must be set");
  }

  // 27. Clear dismissed works
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-07-01T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(candidate);
    const loaded = cq.loadCandidateReviewQueue();
    cq.dismissCandidate(loaded[0].id);
    assert.equal(cq.loadCandidateReviewQueue().length, 1);
    cq.clearDismissedCandidates();
    assert.equal(cq.loadCandidateReviewQueue().length, 0, "Clear dismissed must remove dismissed records");
  }

  // 28. Clear queue works
  {
    store.clear();
    for (const sym of ["BTCUSDT", "ETHUSDT", "SOLUSDT"]) {
      const sr = makeSignalRecord({
        createdAt: "2026-08-01T00:00:00.000Z",
        evidenceSnapshot: {
          adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
          stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: sym, autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
        },
      });
      cq.addOrUpdateCandidate(cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: sym }));
    }
    assert.equal(cq.loadCandidateReviewQueue().length, 3);
    cq.clearCandidateReviewQueue();
    assert.equal(cq.loadCandidateReviewQueue().length, 0, "Clear queue must remove all records");
  }

  // 29. Export includes candidate queue (via createLocalDataBackup)
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-09-01T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(candidate);

    // Load backup module
    const backupApi = await server.ssrLoadModule("/src/lib/localDataBackup.ts");
    const queue = cq.loadCandidateReviewQueue();
    // Use spread to pass queue as the last param, all others default
    const defaultState = { watchlist: [], trades: [], alerts: [], settings: {} };
    const exported = backupApi.createLocalDataBackup(defaultState, [], [], undefined, [], undefined, undefined, [], [], undefined, undefined, [], undefined, [], [], undefined, queue);
    assert.ok(exported.candidateReviewQueue, "Export must include candidateReviewQueue");
    assert.equal(exported.candidateReviewQueue.length, 1, "Exported queue must have 1 record");
    assert.equal(exported.candidateReviewQueue[0].symbol, "BTCUSDT");
  }

  // 30. Old backup without candidate queue imports safely
  {
    store.clear();
    const backupApi = await server.ssrLoadModule("/src/lib/localDataBackup.ts");
    const validBackup = {
      version: backupApi.BACKUP_SCHEMA_VERSION,
      app: backupApi.BACKUP_APP_NAME,
      exportedAt: "2026-07-01T00:00:00.000Z",
      watchlist: [], paperTrades: [], priceAlerts: [], paperSignals: [],
      signalSensitivity: "Balanced", backtestRuns: [],
      riskControllerSettings: riskApi.DEFAULT_PAPER_RISK_SETTINGS,
      riskJournal: [],
      futuresPaperSettings: futuresApi.DEFAULT_FUTURES_PAPER_SETTINGS,
      futuresPaperPositions: [], futuresPaperHistory: [],
      futuresStrategyProfile: "Manual",
      futuresTestScenario: "Neutral / Current Mock",
      futuresStrategyBacktests: [],
      forwardTestData: { activeSession: null, completedSessions: [] },
      signalQualityHistory: [], marketDataIntegrityHistory: [],
      settings: { displayName: "", email: "", priceAlerts: true, autoRefresh: false },
    };
    // No candidateReviewQueue field - old backup
    const oldBackupJson = JSON.stringify(validBackup);
    const result = backupApi.parseLocalDataBackup(oldBackupJson);
    assert.ok(result.ok, "Old backup must import without error");
    assert.ok(Array.isArray(result.value.candidateReviewQueue), "candidateReviewQueue must be an array");
    assert.equal(result.value.candidateReviewQueue.length, 0, "Old backup must produce empty candidate queue");
  }

  // 31. Malformed candidate queue import is safe
  {
    store.clear();
    const backupApi = await server.ssrLoadModule("/src/lib/localDataBackup.ts");
    const validBackup = {
      version: backupApi.BACKUP_SCHEMA_VERSION,
      app: backupApi.BACKUP_APP_NAME,
      exportedAt: "2026-07-01T00:00:00.000Z",
      watchlist: [], paperTrades: [], priceAlerts: [], paperSignals: [],
      signalSensitivity: "Balanced", backtestRuns: [],
      riskControllerSettings: riskApi.DEFAULT_PAPER_RISK_SETTINGS,
      riskJournal: [],
      futuresPaperSettings: futuresApi.DEFAULT_FUTURES_PAPER_SETTINGS,
      futuresPaperPositions: [], futuresPaperHistory: [],
      futuresStrategyProfile: "Manual",
      futuresTestScenario: "Neutral / Current Mock",
      futuresStrategyBacktests: [],
      forwardTestData: { activeSession: null, completedSessions: [] },
      signalQualityHistory: [], marketDataIntegrityHistory: [],
      settings: { displayName: "", email: "", priceAlerts: true, autoRefresh: false },
    };
    const malformedJson = JSON.stringify({ ...validBackup, candidateReviewQueue: "not_an_array" });
    const result = backupApi.parseLocalDataBackup(malformedJson);
    assert.ok(result.ok, "Malformed candidate queue must not crash import");
    assert.ok(Array.isArray(result.value.candidateReviewQueue), "Malformed queue must fall back to array");
    assert.equal(result.value.candidateReviewQueue.length, 0, "Malformed queue must be empty");
  }

  // 32. No paper positions created by candidate operations
  {
    store.clear();
    // Check localStorage for paper positions key
    const sr = makeSignalRecord({
      createdAt: "2026-10-01T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(candidate);
    cq.markCandidateReviewed(candidate.id, "notes");
    cq.dismissCandidate(candidate.id);
    cq.clearDismissedCandidates();

    // Check no paper position keys were written
    let hasPositionKey = false;
    for (const key of store.keys()) {
      if (key.includes("paper") && key.includes("position")) hasPositionKey = true;
    }
    assert.ok(!hasPositionKey, "No paper position keys must be written by candidate operations");
  }

  // 33. No paper trades created by candidate operations
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-11-01T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(candidate);

    let hasTradeKey = false;
    for (const key of store.keys()) {
      if (key.includes("paper") && key.includes("trade")) hasTradeKey = true;
      if (key.includes("paper") && key.includes("history")) hasTradeKey = true;
    }
    assert.ok(!hasTradeKey, "No paper trade/history keys must be written by candidate operations");
  }

  // 34. No order/execution fields exist on candidate records
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-12-01T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    const forbidden = ["tradeId", "orderId", "positionId", "execution", "executed", "filled", "buy", "sell", "openPosition", "closePosition"];
    for (const field of forbidden) {
      assert.equal(candidate[field], undefined, "Candidate must not have field: " + field);
    }
    const json = JSON.stringify(candidate);
    for (const field of forbidden) {
      assert.ok(!json.includes("\"" + field + "\""), "Candidate JSON must not contain field: " + field);
    }
  }

  // 35. Risk controller untouched by candidate operations
  {
    store.clear();
    // Set a known risk controller state
    store.set("chanter-paper-risk-controller", JSON.stringify({ maxConcurrentPositions: 5, maxDailyLoss: 10, maxPositionLoss: 7 }));
    const sr = makeSignalRecord({
      createdAt: "2026-12-15T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(candidate);
    cq.markCandidateReviewed(candidate.id, "notes");
    cq.dismissCandidate(candidate.id);

    const riskRaw = store.get("chanter-paper-risk-controller");
    assert.ok(riskRaw, "Risk controller key must still exist");
    const risk = JSON.parse(riskRaw);
    assert.equal(risk.maxConcurrentPositions, 5, "Risk controller maxConcurrentPositions must be unchanged");
    assert.equal(risk.maxDailyLoss, 10, "Risk controller maxDailyLoss must be unchanged");
    assert.equal(risk.maxPositionLoss, 7, "Risk controller maxPositionLoss must be unchanged");
  }

  // --- v2 Polish Tests (36-50) ---

  // 36. Multi-symbol candidate creation (multiple symbols in one batch)
  {
    store.clear();
    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
    for (const sym of symbols) {
      const sr = makeSignalRecord({
        createdAt: "2026-03-15T00:00:00.000Z",
        evidenceSnapshot: {
          adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
          stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: sym, autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
        },
      });
      sr.input.symbol = sym;
      const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: sym, source: "AUTO_CYCLE" });
      assert.ok(candidate, "Candidate must be created for " + sym);
      cq.addOrUpdateCandidate(candidate);
    }
    const loaded = cq.loadCandidateReviewQueue();
    assert.equal(loaded.length, 3, "Three separate candidates for three symbols");
    const syms = loaded.map((r) => r.symbol).sort();
    assert.deepEqual(syms, ["BTCUSDT", "ETHUSDT", "SOLUSDT"]);
  }

  // 37. Dedupe by symbol + timeframe + evidence snapshot timestamp
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-03-20T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const c1 = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(c1);
    // Same symbol, same evidenceSnapshotAt -> dedup
    const c2 = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(85, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(c2);
    const loaded = cq.loadCandidateReviewQueue();
    assert.equal(loaded.length, 1, "Same symbol + same evidenceSnapshotAt must dedup");
  }

  // 38. filterCandidates: ALL returns all
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-04-01T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    cq.addOrUpdateCandidate(cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" }));
    const loaded = cq.loadCandidateReviewQueue();
    const all = cq.filterCandidates(loaded, "ALL");
    assert.equal(all.length, loaded.length, "ALL filter returns all records");
  }

  // 39. filterCandidates: REVIEW returns only REVIEW
  {
    store.clear();
    const sr1 = makeSignalRecord({
      createdAt: "2026-04-02T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    cq.addOrUpdateCandidate(cq.buildCandidateFromSnapshot({ signalRecord: sr1, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" }));
    const sr2 = makeSignalRecord({
      createdAt: "2026-04-03T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 40, evidenceModifier: -5, finalScore: 35, label: "Poor", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 30, integritySource: "LOCAL_MOCK", integrityFreshness: "stale", integrityReadiness: "ready_with_warnings", hasAutoObservations: false, autoObsCount: 0, autoObsLatestSymbol: null, autoObsLatestScore: null, hasForwardTest: false, forwardObsCount: 0, forwardLatestDirection: null, hasBacktest: false, backtestReturn: null, backtestWinRate: null, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "partial", positiveFactors: [], negativeFactors: ["low integrity"], missingFactors: [] },
      },
    });
    cq.addOrUpdateCandidate(cq.buildCandidateFromSnapshot({ signalRecord: sr2, integrityReport: makeIntegrity(30, "stale", "ready_with_warnings"), symbol: "ETHUSDT" }));
    const loaded = cq.loadCandidateReviewQueue();
    const reviewOnly = cq.filterCandidates(loaded, "REVIEW");
    assert.equal(reviewOnly.length, 1, "REVIEW filter returns only REVIEW candidates");
    assert.equal(reviewOnly[0].candidateStatus, "REVIEW");
    const blockedOnly = cq.filterCandidates(loaded, "BLOCKED");
    assert.equal(blockedOnly.length, 1, "BLOCKED filter returns only BLOCKED candidates");
    assert.equal(blockedOnly[0].candidateStatus, "BLOCKED");
  }

  // 40. sortCandidates: score-high sorts descending
  {
    store.clear();
    const scores = [83, 68, 35, 90];
    for (let i = 0; i < scores.length; i++) {
      const sr = makeSignalRecord({
        createdAt: new Date(2026, 4, 1 + i).toISOString(),
        evidenceSnapshot: {
          adjusted: { baseScore: scores[i], evidenceModifier: 0, finalScore: scores[i], label: "Watch", capsApplied: [], evidenceFactors: [] },
          stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
        },
      });
      cq.addOrUpdateCandidate(cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" }));
    }
    const loaded = cq.loadCandidateReviewQueue();
    const highToLow = cq.sortCandidates(loaded, "score-high");
    assert.ok(highToLow[0].finalScore >= highToLow[1].finalScore, "score-high: first >= second");
    assert.ok(highToLow[1].finalScore >= highToLow[2].finalScore, "score-high: second >= third");
    assert.ok(highToLow[2].finalScore >= highToLow[3].finalScore, "score-high: third >= fourth");
    const lowToHigh = cq.sortCandidates(loaded, "score-low");
    assert.ok(lowToHigh[0].finalScore <= lowToHigh[1].finalScore, "score-low: first <= second");
  }

  // 41. sortCandidates: status-priority sorts REVIEW before WATCH before BLOCKED
  {
    store.clear();
    // Add WATCH (score 68)
    const srW = makeSignalRecord({
      createdAt: "2026-05-10T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 65, evidenceModifier: 3, finalScore: 68, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 70, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: false, autoObsCount: 0, autoObsLatestSymbol: null, autoObsLatestScore: null, hasForwardTest: false, forwardObsCount: 0, forwardLatestDirection: null, hasBacktest: false, backtestReturn: null, backtestWinRate: null, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "partial", positiveFactors: [], negativeFactors: [], missingFactors: ["auto obs"] },
      },
    });
    cq.addOrUpdateCandidate(cq.buildCandidateFromSnapshot({ signalRecord: srW, integrityReport: makeIntegrity(70, "current", "ready"), symbol: "ETHUSDT" }));
    // Add REVIEW (score 83)
    const srR = makeSignalRecord({
      createdAt: "2026-05-11T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    cq.addOrUpdateCandidate(cq.buildCandidateFromSnapshot({ signalRecord: srR, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" }));
    // Add BLOCKED (score 35)
    const srB = makeSignalRecord({
      createdAt: "2026-05-12T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 40, evidenceModifier: -5, finalScore: 35, label: "Poor", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 30, integritySource: "LOCAL_MOCK", integrityFreshness: "stale", integrityReadiness: "ready_with_warnings", hasAutoObservations: false, autoObsCount: 0, autoObsLatestSymbol: null, autoObsLatestScore: null, hasForwardTest: false, forwardObsCount: 0, forwardLatestDirection: null, hasBacktest: false, backtestReturn: null, backtestWinRate: null, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "partial", positiveFactors: [], negativeFactors: ["low integrity"], missingFactors: [] },
      },
    });
    cq.addOrUpdateCandidate(cq.buildCandidateFromSnapshot({ signalRecord: srB, integrityReport: makeIntegrity(30, "stale", "ready_with_warnings"), symbol: "SOLUSDT" }));
    const loaded = cq.loadCandidateReviewQueue();
    const byPriority = cq.sortCandidates(loaded, "status-priority");
    assert.equal(byPriority[0].candidateStatus, "REVIEW", "status-priority: REVIEW first");
    assert.equal(byPriority[1].candidateStatus, "WATCH", "status-priority: WATCH second");
    assert.equal(byPriority[2].candidateStatus, "BLOCKED", "status-priority: BLOCKED third");
  }

  // 42. Review notes persistence
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-06-01T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(candidate);
    const loaded = cq.loadCandidateReviewQueue();
    cq.markCandidateReviewed(loaded[0].id, "Strong setup, will monitor closely");
    const reviewed = cq.loadCandidateReviewQueue();
    assert.equal(reviewed[0].reviewNotes, "Strong setup, will monitor closely", "Review notes must persist");
    assert.ok(reviewed[0].reviewedAt, "reviewedAt must be set");
  }

  // 43. Dismiss reason persistence
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-06-15T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(candidate);
    const loaded = cq.loadCandidateReviewQueue();
    cq.dismissCandidate(loaded[0].id, "Stale setup, market conditions changed");
    const dismissed = cq.loadCandidateReviewQueue();
    assert.equal(dismissed[0].candidateStatus, "DISMISSED");
    assert.equal(dismissed[0].dismissReason, "Stale setup, market conditions changed", "Dismiss reason must persist");
    assert.ok(dismissed[0].dismissedAt, "dismissedAt must be set");
  }

  // 44. Export includes candidate queue with dismissReason field
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-07-01T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(candidate);
    const loaded = cq.loadCandidateReviewQueue();
    cq.dismissCandidate(loaded[0].id, "Test reason");
    const queue = cq.loadCandidateReviewQueue();
    const backupApi = await server.ssrLoadModule("/src/lib/localDataBackup.ts");
    const exported = backupApi.createLocalDataBackup({ watchlist: [], trades: [], alerts: [], settings: {} }, [], [], undefined, [], undefined, undefined, [], [], undefined, undefined, [], undefined, [], [], undefined, queue);
    assert.ok(exported.candidateReviewQueue, "Export must include candidateReviewQueue");
    assert.equal(exported.candidateReviewQueue.length, 1);
    assert.equal(exported.candidateReviewQueue[0].dismissReason, "Test reason", "Exported record must have dismissReason");
  }

  // 45. Old backup without candidate queue still imports (compat recheck)
  {
    store.clear();
    const backupApi = await server.ssrLoadModule("/src/lib/localDataBackup.ts");
    const validBackup = {
      version: backupApi.BACKUP_SCHEMA_VERSION,
      app: backupApi.BACKUP_APP_NAME,
      exportedAt: "2026-07-01T00:00:00.000Z",
      watchlist: [], paperTrades: [], priceAlerts: [], paperSignals: [],
      signalSensitivity: "Balanced", backtestRuns: [],
      riskControllerSettings: riskApi.DEFAULT_PAPER_RISK_SETTINGS,
      riskJournal: [],
      futuresPaperSettings: futuresApi.DEFAULT_FUTURES_PAPER_SETTINGS,
      futuresPaperPositions: [], futuresPaperHistory: [],
      futuresStrategyProfile: "Manual",
      futuresTestScenario: "Neutral / Current Mock",
      futuresStrategyBacktests: [],
      forwardTestData: { activeSession: null, completedSessions: [] },
      signalQualityHistory: [], marketDataIntegrityHistory: [],
      settings: { displayName: "", email: "", priceAlerts: true, autoRefresh: false },
    };
    const result = backupApi.parseLocalDataBackup(JSON.stringify(validBackup));
    assert.ok(result.ok, "Old backup without candidateReviewQueue must import");
    assert.ok(Array.isArray(result.value.candidateReviewQueue), "candidateReviewQueue must be array");
    assert.equal(result.value.candidateReviewQueue.length, 0, "Must be empty array");
  }

  // 46. Malformed candidate record rejected safely
  {
    store.clear();
    // Directly store malformed records in localStorage
    const malformed = [
      { id: "bad-1", createdAt: "not-a-date" },
      { notEvenARecord: true },
      null,
      "string-not-object",
      { id: "good-1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", symbol: "BTCUSDT", timeframe: "15m", source: "AUTO_CYCLE", direction: "WAIT", candidateStatus: "WATCH", baseScore: 65, evidenceModifier: 0, finalScore: 65, evidenceCompleteness: "partial", evidencePositiveFactors: [], evidenceNegativeFactors: [], evidenceMissingFactors: [], evidenceCapsApplied: [], evidenceSnapshotAt: "2026-01-01T00:00:00.000Z", integrityScore: 70, integrityReadiness: "ready", latestCandleAt: "2026-01-01T00:00:00.000Z", riskStatus: "APPROVED", riskReason: "ok", reasonSummary: "test", reviewNotes: "", reviewedAt: null, dismissedAt: null, dismissReason: "" },
    ];
    store.set("chanter-candidate-review-queue", JSON.stringify(malformed));
    const loaded = cq.loadCandidateReviewQueue();
    assert.equal(loaded.length, 1, "Only 1 valid record out of 4 malformed");
    assert.equal(loaded[0].id, "good-1");
  }

  // 47. No paper positions created by multi-symbol candidate operations
  {
    store.clear();
    for (const sym of ["BTCUSDT", "ETHUSDT", "SOLUSDT", "ADAUSDT", "AVAXUSDT"]) {
      const sr = makeSignalRecord({
        createdAt: "2026-08-01T00:00:00.000Z",
        evidenceSnapshot: {
          adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
          stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: sym, autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
        },
      });
      sr.input.symbol = sym;
      const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: sym });
      cq.addOrUpdateCandidate(candidate);
    }
    let hasPositionKey = false;
    for (const key of store.keys()) {
      if (key.includes("position")) hasPositionKey = true;
    }
    assert.ok(!hasPositionKey, "No position keys in localStorage from multi-symbol operations");
  }

  // 48. No paper trades created by candidate operations
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-09-01T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(candidate);
    cq.markCandidateReviewed(candidate.id, "notes");
    cq.dismissCandidate(candidate.id, "reason");
    let hasTradeKey = false;
    for (const key of store.keys()) {
      if (key.includes("trade") || key.includes("history")) hasTradeKey = true;
    }
    assert.ok(!hasTradeKey, "No trade/history keys from candidate operations");
  }

  // 49. No execution/order fields on v2 candidate records
  {
    store.clear();
    const sr = makeSignalRecord({
      createdAt: "2026-10-01T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
      },
    });
    const candidate = cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" });
    cq.addOrUpdateCandidate(candidate);
    cq.markCandidateReviewed(candidate.id, "test");
    cq.dismissCandidate(candidate.id, "test");
    const loaded = cq.loadCandidateReviewQueue();
    const json = JSON.stringify(loaded[0]);
    const forbidden = ["tradeId", "orderId", "positionId", "execution", "executed", "filled", "buy", "sell", "openPosition", "closePosition"];
    for (const field of forbidden) {
      assert.ok(!json.includes("\"" + field + "\""), "Candidate JSON must not contain: " + field);
    }
    // Verify dismissReason field exists
    assert.ok("dismissReason" in loaded[0], "Candidate must have dismissReason field");
  }

  // 50. getLatestCandidatePerSymbol returns one per symbol
  {
    store.clear();
    // Add two candidates for BTCUSDT with different timestamps
    for (const date of ["2026-11-01T00:00:00.000Z", "2026-11-02T00:00:00.000Z"]) {
      const sr = makeSignalRecord({
        createdAt: date,
        evidenceSnapshot: {
          adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
          stack: { hasMarketIntegrity: true, integrityScore: 90, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5, autoObsLatestSymbol: "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true, forwardObsCount: 3, forwardLatestDirection: "LONG", hasBacktest: true, backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "complete", positiveFactors: [], negativeFactors: [], missingFactors: [] },
        },
      });
      cq.addOrUpdateCandidate(cq.buildCandidateFromSnapshot({ signalRecord: sr, integrityReport: makeIntegrity(90, "current", "ready"), symbol: "BTCUSDT" }));
    }
    // Add one for ETHUSDT
    const sr2 = makeSignalRecord({
      createdAt: "2026-11-03T00:00:00.000Z",
      evidenceSnapshot: {
        adjusted: { baseScore: 65, evidenceModifier: 3, finalScore: 68, label: "Watch", capsApplied: [], evidenceFactors: [] },
        stack: { hasMarketIntegrity: true, integrityScore: 70, integritySource: "LIVE_READ_ONLY", integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: false, autoObsCount: 0, autoObsLatestSymbol: null, autoObsLatestScore: null, hasForwardTest: false, forwardObsCount: 0, forwardLatestDirection: null, hasBacktest: false, backtestReturn: null, backtestWinRate: null, hasRiskGate: true, riskGateStatus: "APPROVED", completeness: "partial", positiveFactors: [], negativeFactors: [], missingFactors: ["auto obs"] },
      },
    });
    cq.addOrUpdateCandidate(cq.buildCandidateFromSnapshot({ signalRecord: sr2, integrityReport: makeIntegrity(70, "current", "ready"), symbol: "ETHUSDT" }));
    const latest = cq.getLatestCandidatePerSymbol();
    assert.equal(latest.length, 2, "One per symbol (BTCUSDT + ETHUSDT)");
    const btcLatest = latest.find((r) => r.symbol === "BTCUSDT");
    assert.ok(btcLatest, "Must have BTCUSDT latest");
    // The latest BTCUSDT candidate should have the newer evidenceSnapshotAt
    const ethLatest = latest.find((r) => r.symbol === "ETHUSDT");
    assert.ok(ethLatest, "Must have ETHUSDT latest");
  }

      console.log(
    "Candidate Review Queue v1 verification passed: REVIEW/WATCH/BLOCKED/STALE status rules, " +
    "risk BLOCKED override, missing evidence guard, dedup update, cap at 200, " +
    "malformed safe, export includes queue, dismiss/reviewed/clear dismissed, " +
    "no positions, no trades, no execution fields, pure builder, summary helper, multi-symbol, " +
    "auto tick candidate creation, failed fetch no candidate, dedup preserves createdAt, " +
    "summary counts, mark reviewed, dismiss, clear dismissed, clear queue, " +
    "backup export includes queue, old backup compat, malformed import safe, " +
    "no paper positions, no paper trades, no execution fields, risk controller untouched, " +
    "multi-symbol batch creation, dedup by symbol+timestamp, filter helpers, sort helpers, " +
    "review notes persistence, dismiss reason persistence, malformed record rejection, " +
    "latest-per-symbol helper.",
  );
} finally {
  await server.close();
}
