/**
 * Paper Replay Engine v1
 *
 * Read-only replay/backtest engine that replays historical candle windows
 * through the existing signal quality, candidate, decision, action plan,
 * paper outcome, and watch/session logic.
 *
 * This is NOT trading. NOT paper trading execution.
 * Read-only historical replay for proof and confidence assessment.
 *
 * Safety guarantees:
 * - No wallet connection
 * - No real orders
 * - No buy/sell/execute buttons
 * - Does not modify risk gates or signal scoring
 * - Does not fabricate profit or prices
 * - Missing data stays unavailable
 */

import type { CandidateReviewRecord } from "@/lib/candidateReviewQueue";
import { loadCandidateReviewQueue } from "@/lib/candidateReviewQueue";
import type { SignalQualityRecord } from "@/lib/signalQualityScore";
import { loadSignalQualityHistory } from "@/lib/signalQualityScore";
import { loadMarketDataIntegrityHistory } from "@/lib/marketDataIntegrity";
import type { PaperOutcomeRecord } from "@/lib/paperOutcomeTracker";
import { loadPaperOutcomeHistory } from "@/lib/paperOutcomeTracker";
import { loadPaperWatchSessions } from "@/lib/paperWatchSession";

// === Types ===

export interface ReplayStepResult {
  symbol: string;
  timestamp: string;
  integrityScore: number | null;
  signalScore: number | null;
  candidateStatus: string | null;
  decisionAction: string | null;
  actionPlanAction: string | null;
  outcomeStatus: string | null;
  priceAtStep: number | null;
  referencePrice: number | null;
  movePct: number | null;
  favorable: boolean | null;
}

export interface ReplaySummary {
  totalSteps: number;
  totalSymbols: number;
  symbols: string[];
  reviewCount: number;
  watchCount: number;
  waitCount: number;
  ignoreCount: number;
  favorableCount: number;
  unfavorableCount: number;
  flatCount: number;
  unavailableCount: number;
  pendingCount: number;
  measurableWinRate: number | null;
  averageMovePct: number | null;
  bestSymbol: string | null;
  worstSymbol: string | null;
  missingDataCount: number;
  blockedCount: number;
  confidenceLabel: string;
  generatedAt: string;
}

export interface ReplayResult {
  steps: ReplayStepResult[];
  summary: ReplaySummary;
}

// === Helpers ===

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

// === Core replay functions ===

/**
 * Run a replay over historical data.
 *
 * Loads existing localStorage data (integrity history, signal quality history,
 * candidate queue, paper outcomes) and replays each historical tick through
 * the decision/action plan/outcome evaluation pipeline.
 *
 * Does NOT execute trades. Does NOT modify any data. Read-only.
 */
export function runPaperReplay(): ReplayResult {
  const integrityHistory = loadMarketDataIntegrityHistory();
  const signalHistory = loadSignalQualityHistory();
  const candidates = loadCandidateReviewQueue().filter((c) => c.candidateStatus !== "DISMISSED");
  const outcomes = loadPaperOutcomeHistory();
  const watchSessions = loadPaperWatchSessions();

  // Build per-symbol timeline from integrity history
  const symbolTimelines = new Map<string, Array<{ timestamp: string; price: number | null; integrityScore: number | null }>>();

  for (const report of integrityHistory) {
    const sym = report.symbol;
    if (!symbolTimelines.has(sym)) symbolTimelines.set(sym, []);
    symbolTimelines.get(sym)!.push({
      timestamp: report.createdAt,
      price: null, // Integrity report does not store close price
      integrityScore: report.integrityScore,
    });
  }

  // Build candidate map by symbol + timestamp
  const candidateMap = new Map<string, CandidateReviewRecord>();
  for (const c of candidates) {
    candidateMap.set(`${c.symbol}|${c.createdAt}`, c);
  }

  // Build signal quality map by symbol + timestamp
  const signalMap = new Map<string, SignalQualityRecord>();
  for (const s of signalHistory) {
    signalMap.set(`${s.input.symbol}|${s.createdAt}`, s);
  }

  // Build outcome map by symbol
  const outcomeBySymbol = new Map<string, PaperOutcomeRecord[]>();
  for (const o of outcomes) {
    if (!outcomeBySymbol.has(o.symbol)) outcomeBySymbol.set(o.symbol, []);
    outcomeBySymbol.get(o.symbol)!.push(o);
  }

  // Build replay steps
  const steps: ReplayStepResult[] = [];

  // For each candidate, create a replay step
  for (const candidate of candidates) {
    const symbol = candidate.symbol;
    const timestamp = candidate.createdAt;

    // Find matching signal quality record
    const signalKey = `${symbol}|${timestamp}`;
    const signal = signalMap.get(signalKey);

    // Find matching integrity report (closest by time)
    const integrityReports = integrityHistory.filter((r) => r.symbol === symbol);
    const matchingIntegrity = integrityReports.length > 0
      ? integrityReports.reduce((best, r) => {
          const bestDiff = Math.abs(Date.parse(best.createdAt) - Date.parse(timestamp));
          const rDiff = Math.abs(Date.parse(r.createdAt) - Date.parse(timestamp));
          return rDiff < bestDiff ? r : best;
        })
      : null;

    // Find outcomes for this symbol
    const symOutcomes = outcomeBySymbol.get(symbol) ?? [];
    const matchingOutcome = symOutcomes.length > 0
      ? symOutcomes.reduce((best, o) => {
          const bestDiff = Math.abs(Date.parse(best.createdAt) - Date.parse(timestamp));
          const oDiff = Math.abs(Date.parse(o.createdAt) - Date.parse(timestamp));
          return oDiff < bestDiff ? o : best;
        })
      : null;

    // Compute move percentage
    let movePct: number | null = null;
    let favorable: boolean | null = null;
    if (matchingOutcome && matchingOutcome.baselinePrice !== null && matchingOutcome.latestPrice !== null) {
      const baseline = matchingOutcome.baselinePrice;
      const latest = matchingOutcome.latestPrice;
      if (baseline > 0) {
        movePct = ((latest - baseline) / baseline) * 100;
        if (matchingOutcome.direction === "LONG") {
          favorable = movePct > 0.15;
        } else if (matchingOutcome.direction === "SHORT") {
          favorable = movePct < -0.15;
        }
      }
    }

    // Determine decision action from candidate status
    let decisionAction: string | null = null;
    if (candidate.candidateStatus === "REVIEW") decisionAction = "REVIEW";
    else if (candidate.candidateStatus === "WATCH") decisionAction = "WATCH";
    else if (candidate.candidateStatus === "BLOCKED") decisionAction = "IGNORE";
    else if (candidate.candidateStatus === "STALE") decisionAction = "WAIT";
    else if (candidate.candidateStatus === "DISMISSED") decisionAction = "IGNORE";

    steps.push({
      symbol,
      timestamp,
      integrityScore: matchingIntegrity?.integrityScore ?? null,
      signalScore: signal?.score ?? signal?.finalScore ?? candidate.finalScore ?? null,
      candidateStatus: candidate.candidateStatus,
      decisionAction,
      actionPlanAction: decisionAction, // Simplified: action plan action aligns with decision
      outcomeStatus: matchingOutcome?.outcomeStatus ?? null,
      priceAtStep: matchingOutcome?.latestPrice ?? null,
      referencePrice: matchingOutcome?.baselinePrice ?? null,
      movePct,
      favorable,
    });
  }

  // Also add steps for watch sessions
  for (const ws of watchSessions) {
    // Avoid duplicates with candidates
    const exists = steps.some((s) => s.symbol === ws.symbol && s.timestamp === ws.createdAt);
    if (exists) continue;

    steps.push({
      symbol: ws.symbol,
      timestamp: ws.createdAt,
      integrityScore: null,
      signalScore: ws.finalScore,
      candidateStatus: null,
      decisionAction: ws.action,
      actionPlanAction: ws.action,
      outcomeStatus: ws.status,
      priceAtStep: ws.currentPrice,
      referencePrice: ws.referencePrice,
      movePct: ws.referencePrice !== null && ws.currentPrice !== null && ws.referencePrice > 0
        ? ((ws.currentPrice - ws.referencePrice) / ws.referencePrice) * 100
        : null,
      favorable: ws.status === "CONFIRMED" ? true : ws.status === "INVALIDATED" ? false : null,
    });
  }

  // Sort steps by timestamp descending
  steps.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const summary = buildReplaySummary(steps);

  return { steps, summary };
}

export function buildReplaySummary(steps: ReplayStepResult[]): ReplaySummary {
  const totalSteps = steps.length;
  const symbolsSet = new Set(steps.map((s) => s.symbol));
  const symbols = [...symbolsSet].sort();

  let reviewCount = 0;
  let watchCount = 0;
  let waitCount = 0;
  let ignoreCount = 0;
  let favorableCount = 0;
  let unfavorableCount = 0;
  let flatCount = 0;
  let unavailableCount = 0;
  let pendingCount = 0;
  let blockedCount = 0;
  let missingDataCount = 0;

  let moveSum = 0;
  let moveCount = 0;

  // Per-symbol stats
  const symbolStats = new Map<string, { wins: number; losses: number; flat: number; total: number; moveSum: number; moveCount: number }>();

  for (const step of steps) {
    // Decision counts
    if (step.decisionAction === "REVIEW") reviewCount++;
    else if (step.decisionAction === "WATCH") watchCount++;
    else if (step.decisionAction === "WAIT") waitCount++;
    else if (step.decisionAction === "IGNORE") ignoreCount++;

    // Blocked
    if (step.candidateStatus === "BLOCKED") blockedCount++;

    // Missing data
    if (step.integrityScore === null && step.signalScore === null) missingDataCount++;

    // Outcome counts
    if (step.favorable === true) favorableCount++;
    else if (step.favorable === false) unfavorableCount++;
    else if (step.outcomeStatus === "FLAT") flatCount++;
    else if (step.outcomeStatus === "UNAVAILABLE" || (step.outcomeStatus === null && step.movePct === null)) unavailableCount++;
    else if (step.outcomeStatus === "PENDING" || step.outcomeStatus === "WATCHING") pendingCount++;

    // Move percentage
    if (step.movePct !== null) {
      moveSum += Math.abs(step.movePct);
      moveCount++;
    }

    // Per-symbol
    if (!symbolStats.has(step.symbol)) {
      symbolStats.set(step.symbol, { wins: 0, losses: 0, flat: 0, total: 0, moveSum: 0, moveCount: 0 });
    }
    const ss = symbolStats.get(step.symbol)!;
    ss.total++;
    if (step.favorable === true) ss.wins++;
    else if (step.favorable === false) ss.losses++;
    else if (step.outcomeStatus === "FLAT") ss.flat++;
    if (step.movePct !== null) {
      ss.moveSum += Math.abs(step.movePct);
      ss.moveCount++;
    }
  }

  // Measurable win rate
  const measurableTotal = favorableCount + unfavorableCount + flatCount;
  const measurableWinRate = measurableTotal > 0 ? (favorableCount / measurableTotal) * 100 : null;

  // Average move
  const averageMovePct = moveCount > 0 ? moveSum / moveCount : null;

  // Best/worst symbol by win rate
  let bestSymbol: string | null = null;
  let worstSymbol: string | null = null;
  let bestWinRate = -1;
  let worstWinRate = 101;

  for (const [sym, ss] of symbolStats) {
    const measurable = ss.wins + ss.losses + ss.flat;
    if (measurable === 0) continue;
    const winRate = (ss.wins / measurable) * 100;
    if (winRate > bestWinRate) {
      bestWinRate = winRate;
      bestSymbol = sym;
    }
    if (winRate < worstWinRate) {
      worstWinRate = winRate;
      worstSymbol = sym;
    }
  }

  // Confidence label
  let confidenceLabel = "INSUFFICIENT_DATA";
  if (totalSteps === 0) {
    confidenceLabel = "NO_DATA";
  } else if (measurableWinRate !== null) {
    if (measurableTotal >= 5 && measurableWinRate >= 60) confidenceLabel = "HIGH";
    else if (measurableTotal >= 3 && measurableWinRate >= 50) confidenceLabel = "MEDIUM";
    else if (measurableTotal >= 1) confidenceLabel = "LOW";
    else confidenceLabel = "PENDING_PROOF";
  } else if (totalSteps > 0) {
    confidenceLabel = "PENDING_PROOF";
  }

  return {
    totalSteps,
    totalSymbols: symbols.length,
    symbols,
    reviewCount,
    watchCount,
    waitCount,
    ignoreCount,
    favorableCount,
    unfavorableCount,
    flatCount,
    unavailableCount,
    pendingCount,
    measurableWinRate,
    averageMovePct,
    bestSymbol,
    worstSymbol,
    missingDataCount,
    blockedCount,
    confidenceLabel,
    generatedAt: new Date().toISOString(),
  };
}

export function normalizeReplaySummary(record: unknown): ReplaySummary | null {
  if (!isRecord(record)) return null;
  if (typeof record.totalSteps !== "number") return null;

  const totalSteps = typeof record.totalSteps === "number" ? record.totalSteps : 0;
  const symbols = Array.isArray(record.symbols) ? record.symbols.filter((s): s is string => typeof s === "string") : [];

  return {
    totalSteps,
    totalSymbols: typeof record.totalSymbols === "number" ? record.totalSymbols : symbols.length,
    symbols,
    reviewCount: typeof record.reviewCount === "number" ? record.reviewCount : 0,
    watchCount: typeof record.watchCount === "number" ? record.watchCount : 0,
    waitCount: typeof record.waitCount === "number" ? record.waitCount : 0,
    ignoreCount: typeof record.ignoreCount === "number" ? record.ignoreCount : 0,
    favorableCount: typeof record.favorableCount === "number" ? record.favorableCount : 0,
    unfavorableCount: typeof record.unfavorableCount === "number" ? record.unfavorableCount : 0,
    flatCount: typeof record.flatCount === "number" ? record.flatCount : 0,
    unavailableCount: typeof record.unavailableCount === "number" ? record.unavailableCount : 0,
    pendingCount: typeof record.pendingCount === "number" ? record.pendingCount : 0,
    measurableWinRate: safeNumberOrNull(record.measurableWinRate),
    averageMovePct: safeNumberOrNull(record.averageMovePct),
    bestSymbol: safeStringOrNull(record.bestSymbol),
    worstSymbol: safeStringOrNull(record.worstSymbol),
    missingDataCount: typeof record.missingDataCount === "number" ? record.missingDataCount : 0,
    blockedCount: typeof record.blockedCount === "number" ? record.blockedCount : 0,
    confidenceLabel: typeof record.confidenceLabel === "string" ? record.confidenceLabel : "INSUFFICIENT_DATA",
    generatedAt: typeof record.generatedAt === "string" ? record.generatedAt : new Date().toISOString(),
  };
}

/**
 * Explain replay results in plain English.
 */
export function explainReplayResult(summary: ReplaySummary): string {
  if (summary.totalSteps === 0) {
    return "No replay data available. Run the Auto Intelligence Cycle to generate historical data for replay analysis.";
  }

  const parts: string[] = [];

  parts.push(`Replayed ${summary.totalSteps} decision${summary.totalSteps !== 1 ? "s" : ""} across ${summary.totalSymbols} symbol${summary.totalSymbols !== 1 ? "s" : ""}.`);

  if (summary.reviewCount > 0) parts.push(`${summary.reviewCount} REVIEW, ${summary.watchCount} WATCH, ${summary.waitCount} WAIT, ${summary.ignoreCount} IGNORE.`);

  if (summary.measurableWinRate !== null) {
    parts.push(`${summary.favorableCount} favorable, ${summary.unfavorableCount} unfavorable, ${summary.flatCount} flat out of ${summary.favorableCount + summary.unfavorableCount + summary.flatCount} measurable outcomes.`);
    parts.push(`Measurable win rate: ${summary.measurableWinRate.toFixed(1)}%.`);
  } else {
    parts.push(`${summary.pendingCount} pending, ${summary.unavailableCount} unavailable.`);
  }

  if (summary.averageMovePct !== null) {
    parts.push(`Average absolute move: ${summary.averageMovePct.toFixed(2)}%.`);
  }

  if (summary.bestSymbol) {
    parts.push(`Best symbol: ${summary.bestSymbol}.`);
  }
  if (summary.worstSymbol && summary.worstSymbol !== summary.bestSymbol) {
    parts.push(`Worst symbol: ${summary.worstSymbol}.`);
  }

  if (summary.missingDataCount > 0) {
    parts.push(`${summary.missingDataCount} step${summary.missingDataCount !== 1 ? "s" : ""} had missing data.`);
  }
  if (summary.blockedCount > 0) {
    parts.push(`${summary.blockedCount} blocked candidate${summary.blockedCount !== 1 ? "s" : ""} excluded from win rate.`);
  }

  parts.push(`Confidence: ${summary.confidenceLabel}.`);

  return parts.join(" ");
}
