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
  const ws = await server.ssrLoadModule("/src/lib/paperWatchSession.ts");
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
      adjusted: { baseScore: 75, evidenceModifier: 8, finalScore: opts.finalScore ?? 83, label: "Watch", capsApplied: [], evidenceFactors: [] },
      stack: {
        hasMarketIntegrity: true, integrityScore: opts.integrityScore ?? 90, integritySource: "LIVE_READ_ONLY",
        integrityFreshness: "current", integrityReadiness: "ready", hasAutoObservations: true, autoObsCount: 5,
        autoObsLatestSymbol: opts.symbol ?? "BTCUSDT", autoObsLatestScore: 80, hasForwardTest: true,
        forwardObsCount: 3, forwardLatestDirection: opts.direction ?? "LONG", hasBacktest: true,
        backtestReturn: 10, backtestWinRate: 55, hasRiskGate: true,
        riskGateStatus: opts.riskStatus ?? (opts.direction === "WAIT" ? "WAIT" : "APPROVED"),
        completeness: opts.completeness ?? "complete", positiveFactors: ["good"], negativeFactors: [], missingFactors: [],
      },
    });
    if (opts.symbol) sr.input.symbol = opts.symbol;
    if (opts.direction) sr.input.direction = opts.direction;
    return cq.buildCandidateFromSnapshot({
      signalRecord: sr,
      integrityReport: {
        symbol: opts.symbol ?? "BTCUSDT", timeframe: "15m", source: "LIVE_READ_ONLY",
        integrityScore: opts.integrityScore ?? 90, freshnessStatus: "current", readinessStatus: "ready",
        createdAt: "2026-01-01T00:00:00.000Z", candleCount: 100, gapCount: 0, anomalyCount: 0,
        warnings: [], integrityFactors: [], sampleRangeStart: "2026-01-01T00:00:00.000Z",
        sampleRangeEnd: "2026-01-01T00:00:00.000Z", latestCandleTime: "2026-01-01T00:00:00.000Z",
        anomalyDetails: [], gapDetails: [],
      },
      symbol: opts.symbol ?? "BTCUSDT",
    });
  }

  function makePlan(opts) {
    const cand = makeCandidate(opts);
    return plan.buildPaperActionPlan(cand, undefined, opts.price !== undefined ? opts.price : 50000, null);
  }

  // 1. Creates watch session from valid Paper Action Plan
  {
    store.clear();
    const p = makePlan({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const session = ws.createPaperWatchSessionFromPlan(p, "2026-01-01T00:00:00.000Z");
    assert.equal(session.symbol, "BTCUSDT");
    assert.equal(session.status, "WATCHING");
    assert.equal(session.referencePrice, 50000);
    assert.equal(session.source, "PAPER_WATCH_SESSION");
    assert.equal(session.action, "REVIEW");
  }

  // 2. Missing reference price does not fake value
  {
    store.clear();
    const p = makePlan({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, price: null });
    const session = ws.createPaperWatchSessionFromPlan(p, "2026-01-01T00:00:00.000Z");
    assert.equal(session.referencePrice, null);
    assert.equal(session.status, "WATCHING");
    assert.ok(session.outcomeNote?.includes("Reference price unavailable"));
  }

  // 3. Active session updates with later candle
  {
    store.clear();
    const p = makePlan({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, price: 50000 });
    const session = ws.createPaperWatchSessionFromPlan(p, "2026-01-01T00:00:00.000Z");
    const updated = ws.updatePaperWatchSessionFromCandle(session, { price: 50100, time: "2026-01-01T00:15:00.000Z" }, Date.parse("2026-01-01T00:15:00.000Z"));
    assert.equal(updated.currentPrice, 50100);
    // 0.2% move < 0.5% threshold, should stay WATCHING
    assert.equal(updated.status, "WATCHING");
  }

  // 4. Confirmation status when price moves favorably
  {
    store.clear();
    const p = makePlan({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, price: 50000 });
    const session = ws.createPaperWatchSessionFromPlan(p, "2026-01-01T00:00:00.000Z");
    // +1% move -> above 0.5% threshold
    const updated = ws.updatePaperWatchSessionFromCandle(session, { price: 50500, time: "2026-01-01T00:20:00.000Z" }, Date.parse("2026-01-01T00:20:00.000Z"));
    assert.equal(updated.status, "CONFIRMED");
    assert.ok(updated.outcomeNote?.includes("Confirmed"));
    assert.ok(updated.resolvedAt !== null);
  }

  // 5. Invalidation when price moves adversely
  {
    store.clear();
    const p = makePlan({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, price: 50000 });
    const session = ws.createPaperWatchSessionFromPlan(p, "2026-01-01T00:00:00.000Z");
    // -1% move
    const updated = ws.updatePaperWatchSessionFromCandle(session, { price: 49500, time: "2026-01-01T00:20:00.000Z" }, Date.parse("2026-01-01T00:20:00.000Z"));
    assert.equal(updated.status, "INVALIDATED");
    assert.ok(updated.outcomeNote?.includes("adversely"));
  }

  // 6. IGNORE plan creates expired session
  {
    store.clear();
    const cand = makeCandidate({ symbol: "BTCUSDT", direction: "LONG", finalScore: 35, riskStatus: "BLOCKED", riskReason: "blocked", integrityScore: 30, freshness: "stale", readiness: "ready_with_warnings", completeness: "partial", hasAutoObs: false, hasForward: false, hasBacktest: false, negativeFactors: ["low"], positiveFactors: [], missingFactors: ["all"] });
    const p = plan.buildPaperActionPlan(cand, undefined, 50000, null);
    assert.equal(p.action, "IGNORE");
    const session = ws.createPaperWatchSessionFromPlan(p, "2026-01-01T00:00:00.000Z");
    assert.equal(session.status, "EXPIRED");
  }

  // 7. No forbidden fields
  {
    store.clear();
    const p = makePlan({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const session = ws.createPaperWatchSessionFromPlan(p);
    const json = JSON.stringify(session);
    const forbidden = ["tradeId", "orderId", "positionId", "executionId", "buy", "sell", "openPosition", "execute"];
    for (const f of forbidden) {
      assert.ok(!json.includes('"' + f + '"'), "Session must not contain: " + f);
    }
  }

  // 8. Empty state -- no sessions
  {
    store.clear();
    const sessions = ws.loadPaperWatchSessions();
    assert.equal(sessions.length, 0);
    const active = ws.getActivePaperWatchSessions();
    assert.equal(active.length, 0);
    const latest = ws.getLatestPaperWatchSessionBySymbol("BTCUSDT");
    assert.equal(latest, null);
  }

  // 9. Persistence -- add and load
  {
    store.clear();
    const p = makePlan({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83 });
    const session = ws.createPaperWatchSessionFromPlan(p, "2026-01-01T00:00:00.000Z");
    ws.addOrUpdatePaperWatchSession(session);
    const loaded = ws.loadPaperWatchSessions();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].symbol, "BTCUSDT");
    const active = ws.getActivePaperWatchSessions();
    assert.equal(active.length, 1);
  }

  // 10. Malformed records rejected safely
  {
    store.clear();
    store.set("chanter-paper-watch-sessions", JSON.stringify([
      { garbage: true }, null, 42, "string",
      { id: "ok", symbol: "BTCUSDT", source: "PAPER_WATCH_SESSION", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", status: "WATCHING", action: "WATCH", setupType: "test", referencePrice: 50000, currentPrice: 50000, confirmationNeeded: "test", invalidationReason: "none", confidenceLabel: "MEDIUM", reasonSummary: "test", proofSummary: "test", missingDataSummary: "test", lastCheckedAt: "2026-01-01T00:00:00.000Z", resolvedAt: null, outcomeNote: null, direction: "LONG", finalScore: 83 },
    ]));
    const loaded = ws.loadPaperWatchSessions();
    assert.ok(loaded.length <= 1, "Malformed rejected");
    assert.ok(loaded.every((r) => r.symbol !== undefined));
  }

  // 11. Terminal states not changed by candle update
  {
    store.clear();
    const p = makePlan({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, price: 50000 });
    const session = ws.createPaperWatchSessionFromPlan(p, "2026-01-01T00:00:00.000Z");
    // Confirm it first
    const confirmed = ws.updatePaperWatchSessionFromCandle(session, { price: 50500, time: "2026-01-01T00:20:00.000Z" }, Date.parse("2026-01-01T00:20:00.000Z"));
    assert.equal(confirmed.status, "CONFIRMED");
    // Try to update again -- should not change status
    const reUpdated = ws.updatePaperWatchSessionFromCandle(confirmed, { price: 49000, time: "2026-01-01T00:40:00.000Z" }, Date.parse("2026-01-01T00:40:00.000Z"));
    assert.equal(reUpdated.status, "CONFIRMED", "Terminal state should not change");
  }

  // 12. Expiry after 4 hours
  {
    store.clear();
    const p = makePlan({ symbol: "BTCUSDT", direction: "LONG", finalScore: 83, price: 50000 });
    const session = ws.createPaperWatchSessionFromPlan(p, "2026-01-01T00:00:00.000Z");
    // 5 hours later with no significant move
    const expired = ws.updatePaperWatchSessionFromCandle(session, { price: 50010, time: "2026-01-01T05:00:00.000Z" }, Date.parse("2026-01-01T05:00:00.000Z"));
    assert.equal(expired.status, "EXPIRED");
  }

  // 13. Short direction confirms on price drop
  {
    store.clear();
    const p = makePlan({ symbol: "ETHUSDT", direction: "SHORT", finalScore: 83, price: 3000 });
    const session = ws.createPaperWatchSessionFromPlan(p, "2026-01-01T00:00:00.000Z");
    // -1.5% move -> favorable for SHORT
    const updated = ws.updatePaperWatchSessionFromCandle(session, { price: 2955, time: "2026-01-01T00:20:00.000Z" }, Date.parse("2026-01-01T00:20:00.000Z"));
    assert.equal(updated.status, "CONFIRMED");
  }

  console.log(
    "Paper Watch Session v1 verification passed: create from plan, missing price safe, " +
    "candle update, confirmation, invalidation, IGNORE -> expired, no forbidden fields, " +
    "empty state, persistence, malformed safe, terminal locked, expiry, SHORT confirm."
  );
} finally {
  await server.close();
}
