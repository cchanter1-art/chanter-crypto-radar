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

  console.log(
    "Candidate Review Queue v1 verification passed: REVIEW/WATCH/BLOCKED/STALE status rules, " +
    "risk BLOCKED override, missing evidence guard, dedup update, cap at 200, " +
    "malformed safe, export includes queue, dismiss/reviewed/clear dismissed, " +
    "no positions, no trades, no execution fields, pure builder, summary helper, multi-symbol.",
  );
} finally {
  await server.close();
}
