/**
 * Historical Replay Dataset v1
 *
 * Collects candle windows from existing available data (paper outcomes,
 * integrity reports, candidates) per tracked symbol and builds replay
 * windows for 15m / 1h / 4h horizons.
 *
 * This is NOT trading. NOT paper trading execution.
 * Read-only historical replay for proof and confidence assessment.
 *
 * Safety guarantees:
 * - No wallet connection
 * - No real orders
 * - No buy/sell/execute buttons
 * - Does not fabricate prices or outcomes
 * - Missing candle windows stay unavailable
 * - Does not modify any data
 */

import { loadCandidateReviewQueue } from "@/lib/candidateReviewQueue";
import { loadPaperOutcomeHistory, type PaperOutcomeRecord } from "@/lib/paperOutcomeTracker";
import { loadPaperWatchSessions, type PaperWatchSession } from "@/lib/paperWatchSession";
// Tracked symbols (mirrors autoIntelligenceCycle for read-only access)
const TRACKED_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "ADAUSDT", "AVAXUSDT"] as const;

// === Types ===

export type ReplayHorizon = "15m" | "1h" | "4h" | "UNAVAILABLE";

export interface ReplayWindow {
  windowId: string;
  symbol: string;
  baselineTime: string;
  baselinePrice: number;
  futureClosePrice: number | null;
  futureTime: string | null;
  movePct: number | null;
  horizon: ReplayHorizon;
  available: boolean;
  missingDataReason: string | null;
  direction: string;
  favorable: boolean | null;
  source: "PAPER_OUTCOME" | "WATCH_SESSION" | "CANDIDATE_NO_OUTCOME";
}

export interface ReplayWindowSymbolStat {
  symbol: string;
  total: number;
  measurable: number;
  unavailable: number;
  favorable: number;
  unfavorable: number;
  flat: number;
  winRate: number | null;
  avgMovePct: number | null;
  bestHorizon: ReplayHorizon | null;
}

export interface ReplayDatasetSummary {
  totalWindows: number;
  measurableWindows: number;
  unavailableWindows: number;
  favorableCount: number;
  unfavorableCount: number;
  flatCount: number;
  bySymbol: ReplayWindowSymbolStat[];
  bestSymbol: string | null;
  worstSymbol: string | null;
  averageMovePct: number | null;
  horizonCounts: { "15m": number; "1h": number; "4h": number; UNAVAILABLE: number };
  symbolsScanned: number;
  generatedAt: string;
}

// === Constants ===

const FLAT_THRESHOLD_PCT = 0.15;

// === Helpers ===

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function computeFavorable(direction: string, movePct: number | null): boolean | null {
  if (movePct === null) return null;
  if (Math.abs(movePct) < FLAT_THRESHOLD_PCT) return null; // flat
  if (direction === "LONG") return movePct > 0;
  if (direction === "SHORT") return movePct < 0;
  return null;
}

function horizonFromOutcome(
  outcome: PaperOutcomeRecord,
  horizon: "15m" | "1h" | "4h",
): { result: string; hasData: boolean } {
  if (horizon === "15m") return { result: outcome.outcome15m, hasData: outcome.outcome15m !== "UNAVAILABLE" && outcome.outcome15m !== "BLOCKED" };
  if (horizon === "1h") return { result: outcome.outcome1h, hasData: outcome.outcome1h !== "UNAVAILABLE" && outcome.outcome1h !== "BLOCKED" };
  return { result: outcome.outcome4h, hasData: outcome.outcome4h !== "UNAVAILABLE" && outcome.outcome4h !== "BLOCKED" };
}

function buildWindowFromOutcome(
  outcome: PaperOutcomeRecord,
  horizon: "15m" | "1h" | "4h",
): ReplayWindow | null {
  const { hasData } = horizonFromOutcome(outcome, horizon);
  if (!hasData) {
    return {
      windowId: `${outcome.symbol}-${horizon}-${outcome.id}`,
      symbol: outcome.symbol,
      baselineTime: outcome.baselineTime ?? outcome.createdAt,
      baselinePrice: outcome.baselinePrice ?? 0,
      futureClosePrice: null,
      futureTime: null,
      movePct: null,
      horizon,
      available: false,
      missingDataReason: `Insufficient ${horizon} candle data`,
      direction: outcome.direction,
      favorable: null,
      source: "PAPER_OUTCOME",
    };
  }

  const baselinePrice = outcome.baselinePrice;
  const futureClosePrice = outcome.latestPrice;
  if (baselinePrice === null || futureClosePrice === null) {
    return {
      windowId: `${outcome.symbol}-${horizon}-${outcome.id}`,
      symbol: outcome.symbol,
      baselineTime: outcome.baselineTime ?? outcome.createdAt,
      baselinePrice: baselinePrice ?? 0,
      futureClosePrice: null,
      futureTime: null,
      movePct: null,
      horizon,
      available: false,
      missingDataReason: `Missing ${horizon} price data`,
      direction: outcome.direction,
      favorable: null,
      source: "PAPER_OUTCOME",
    };
  }

  const movePct = baselinePrice > 0 ? ((futureClosePrice - baselinePrice) / baselinePrice) * 100 : null;
  const favorable = computeFavorable(outcome.direction, movePct);

  return {
    windowId: `${outcome.symbol}-${horizon}-${outcome.id}`,
    symbol: outcome.symbol,
    baselineTime: outcome.baselineTime ?? outcome.createdAt,
    baselinePrice: baselinePrice,
    futureClosePrice,
    futureTime: outcome.latestTime ?? outcome.updatedAt,
    movePct,
    horizon,
    available: true,
    missingDataReason: null,
    direction: outcome.direction,
    favorable,
    source: "PAPER_OUTCOME",
  };
}

function buildWindowFromWatchSession(
  session: PaperWatchSession,
): ReplayWindow | null {
  if (session.referencePrice === null) {
    return {
      windowId: `watch-${session.symbol}-${session.id}`,
      symbol: session.symbol,
      baselineTime: session.createdAt,
      baselinePrice: 0,
      futureClosePrice: null,
      futureTime: null,
      movePct: null,
      horizon: "UNAVAILABLE",
      available: false,
      missingDataReason: "Reference price unavailable",
      direction: session.direction,
      favorable: null,
      source: "WATCH_SESSION",
    };
  }

  const movePct = session.currentPrice !== null && session.referencePrice > 0
    ? ((session.currentPrice - session.referencePrice) / session.referencePrice) * 100
    : null;
  const favorable = computeFavorable(session.direction, movePct);

  return {
    windowId: `watch-${session.symbol}-${session.id}`,
    symbol: session.symbol,
    baselineTime: session.createdAt,
    baselinePrice: session.referencePrice,
    futureClosePrice: session.currentPrice,
    futureTime: session.lastCheckedAt,
    movePct,
    horizon: "15m",
    available: movePct !== null,
    missingDataReason: movePct === null ? "No current price update" : null,
    direction: session.direction,
    favorable,
    source: "WATCH_SESSION",
  };
}

function buildWindowFromCandidateNoOutcome(
  candidate: { id: string; symbol: string; createdAt: string; direction: string; candidateStatus: string; finalScore: number },
): ReplayWindow {
  return {
    windowId: `cand-${candidate.symbol}-${candidate.id}`,
    symbol: candidate.symbol,
    baselineTime: candidate.createdAt,
    baselinePrice: 0,
    futureClosePrice: null,
    futureTime: null,
    movePct: null,
    horizon: "UNAVAILABLE",
    available: false,
    missingDataReason: "No paper outcome tracked for this candidate",
    direction: candidate.direction,
    favorable: null,
    source: "CANDIDATE_NO_OUTCOME",
  };
}

// === Core functions ===

export function buildReplayWindows(): ReplayWindow[] {
  const windows: ReplayWindow[] = [];

  // Load outcomes and build 3 windows each (15m, 1h, 4h)
  const outcomes = loadPaperOutcomeHistory();
  for (const outcome of outcomes) {
    for (const horizon of ["15m", "1h", "4h"] as const) {
      const w = buildWindowFromOutcome(outcome, horizon);
      if (w) windows.push(w);
    }
  }

  // Load watch sessions
  const watchSessions = loadPaperWatchSessions();
  for (const session of watchSessions) {
    const w = buildWindowFromWatchSession(session);
    if (w) windows.push(w);
  }

  // Load candidates without outcomes -- mark as unavailable
  const candidates = loadCandidateReviewQueue().filter((c) => c.candidateStatus !== "DISMISSED");
  const outcomeSymbols = new Set(outcomes.map((o) => `${o.symbol}|${o.createdAt}`));
  for (const c of candidates) {
    const key = `${c.symbol}|${c.createdAt}`;
    if (!outcomeSymbols.has(key)) {
      windows.push(buildWindowFromCandidateNoOutcome(c));
    }
  }

  // Also check tracked symbols with no data at all
  const scannedSymbols = new Set(windows.map((w) => w.symbol));
  for (const sym of TRACKED_SYMBOLS) {
    if (!scannedSymbols.has(sym)) {
      windows.push({
        windowId: `empty-${sym}`,
        symbol: sym,
        baselineTime: new Date().toISOString(),
        baselinePrice: 0,
        futureClosePrice: null,
        futureTime: null,
        movePct: null,
        horizon: "UNAVAILABLE",
        available: false,
        missingDataReason: "No candle data available for this symbol",
        direction: "WAIT",
        favorable: null,
        source: "CANDIDATE_NO_OUTCOME",
      });
    }
  }

  return windows;
}

export function summarizeReplayWindows(windows: ReplayWindow[]): ReplayDatasetSummary {
  const totalWindows = windows.length;
  let measurableWindows = 0;
  let unavailableWindows = 0;
  let favorableCount = 0;
  let unfavorableCount = 0;
  let flatCount = 0;
  let moveSum = 0;
  let moveCount = 0;

  const symbolMap = new Map<string, ReplayWindowSymbolStat>();
  const horizonCounts = { "15m": 0, "1h": 0, "4h": 0, UNAVAILABLE: 0 };

  for (const w of windows) {
    // Horizon count
    horizonCounts[w.horizon]++;

    if (w.available) {
      measurableWindows++;
      if (w.favorable === true) favorableCount++;
      else if (w.favorable === false) unfavorableCount++;
      else flatCount++;

      if (w.movePct !== null) {
        moveSum += Math.abs(w.movePct);
        moveCount++;
      }
    } else {
      unavailableWindows++;
    }

    // Per-symbol stats
    if (!symbolMap.has(w.symbol)) {
      symbolMap.set(w.symbol, {
        symbol: w.symbol,
        total: 0, measurable: 0, unavailable: 0,
        favorable: 0, unfavorable: 0, flat: 0,
        winRate: null, avgMovePct: null, bestHorizon: null,
      });
    }
    const ss = symbolMap.get(w.symbol)!;
    ss.total++;
    if (w.available) {
      ss.measurable++;
      if (w.favorable === true) ss.favorable++;
      else if (w.favorable === false) ss.unfavorable++;
      else ss.flat++;
    } else {
      ss.unavailable++;
    }
  }

  // Compute per-symbol win rates and best horizons
  const bySymbol: ReplayWindowSymbolStat[] = [];
  for (const [sym, ss] of symbolMap) {
    const measurable = ss.favorable + ss.unfavorable + ss.flat;
    if (measurable > 0) {
      ss.winRate = (ss.favorable / measurable) * 100;
    }
    if (ss.measurable > 0) {
      ss.avgMovePct = moveCount > 0 ? moveSum / moveCount : null; // simplified
    }
    // Best horizon = the longest available horizon
    const symWindows = windows.filter((w) => w.symbol === sym && w.available);
    if (symWindows.some((w) => w.horizon === "4h")) ss.bestHorizon = "4h";
    else if (symWindows.some((w) => w.horizon === "1h")) ss.bestHorizon = "1h";
    else if (symWindows.some((w) => w.horizon === "15m")) ss.bestHorizon = "15m";
    bySymbol.push(ss);
  }

  bySymbol.sort((a, b) => b.measurable - a.measurable || a.symbol.localeCompare(b.symbol));

  // Best/worst symbol by win rate (only symbols with measurable outcomes)
  let bestSymbol: string | null = null;
  let worstSymbol: string | null = null;
  let bestRate = -1;
  let worstRate = 101;
  for (const ss of bySymbol) {
    if (ss.winRate === null) continue;
    if (ss.winRate > bestRate) { bestRate = ss.winRate; bestSymbol = ss.symbol; }
    if (ss.winRate < worstRate) { worstRate = ss.winRate; worstSymbol = ss.symbol; }
  }

  return {
    totalWindows,
    measurableWindows,
    unavailableWindows,
    favorableCount,
    unfavorableCount,
    flatCount,
    bySymbol,
    bestSymbol,
    worstSymbol,
    averageMovePct: moveCount > 0 ? moveSum / moveCount : null,
    horizonCounts,
    symbolsScanned: symbolMap.size,
    generatedAt: new Date().toISOString(),
  };
}

export function normalizeReplayWindow(record: unknown): ReplayWindow | null {
  if (!isRecord(record)) return null;
  const windowId = safeString(record.windowId);
  const symbol = safeString(record.symbol);
  if (!windowId || !symbol) return null;

  const horizon = record.horizon === "15m" || record.horizon === "1h" || record.horizon === "4h" || record.horizon === "UNAVAILABLE"
    ? record.horizon : "UNAVAILABLE";

  return {
    windowId,
    symbol,
    baselineTime: safeString(record.baselineTime) ?? new Date().toISOString(),
    baselinePrice: safeNumber(record.baselinePrice) ?? 0,
    futureClosePrice: safeNumber(record.futureClosePrice),
    futureTime: safeString(record.futureTime),
    movePct: safeNumber(record.movePct),
    horizon,
    available: typeof record.available === "boolean" ? record.available : false,
    missingDataReason: safeString(record.missingDataReason),
    direction: safeString(record.direction) ?? "WAIT",
    favorable: typeof record.favorable === "boolean" ? record.favorable : null,
    source: record.source === "PAPER_OUTCOME" || record.source === "WATCH_SESSION" || record.source === "CANDIDATE_NO_OUTCOME"
      ? record.source : "CANDIDATE_NO_OUTCOME",
  };
}

export function normalizeReplayDatasetSummary(record: unknown): ReplayDatasetSummary | null {
  if (!isRecord(record)) return null;
  if (typeof record.totalWindows !== "number") return null;

  return {
    totalWindows: record.totalWindows,
    measurableWindows: typeof record.measurableWindows === "number" ? record.measurableWindows : 0,
    unavailableWindows: typeof record.unavailableWindows === "number" ? record.unavailableWindows : 0,
    favorableCount: typeof record.favorableCount === "number" ? record.favorableCount : 0,
    unfavorableCount: typeof record.unfavorableCount === "number" ? record.unfavorableCount : 0,
    flatCount: typeof record.flatCount === "number" ? record.flatCount : 0,
    bySymbol: Array.isArray(record.bySymbol) ? record.bySymbol.filter(isRecord).map((s) => ({
      symbol: safeString(s.symbol) ?? "",
      total: typeof s.total === "number" ? s.total : 0,
      measurable: typeof s.measurable === "number" ? s.measurable : 0,
      unavailable: typeof s.unavailable === "number" ? s.unavailable : 0,
      favorable: typeof s.favorable === "number" ? s.favorable : 0,
      unfavorable: typeof s.unfavorable === "number" ? s.unfavorable : 0,
      flat: typeof s.flat === "number" ? s.flat : 0,
      winRate: safeNumber(s.winRate),
      avgMovePct: safeNumber(s.avgMovePct),
      bestHorizon: safeString(s.bestHorizon) as ReplayHorizon | null,
    })) : [],
    bestSymbol: safeString(record.bestSymbol),
    worstSymbol: safeString(record.worstSymbol),
    averageMovePct: safeNumber(record.averageMovePct),
    horizonCounts: {
      "15m": typeof record.horizonCounts === "object" && record.horizonCounts && typeof (record.horizonCounts as Record<string, unknown>)["15m"] === "number" ? (record.horizonCounts as Record<string, number>)["15m"] : 0,
      "1h": typeof record.horizonCounts === "object" && record.horizonCounts && typeof (record.horizonCounts as Record<string, unknown>)["1h"] === "number" ? (record.horizonCounts as Record<string, number>)["1h"] : 0,
      "4h": typeof record.horizonCounts === "object" && record.horizonCounts && typeof (record.horizonCounts as Record<string, unknown>)["4h"] === "number" ? (record.horizonCounts as Record<string, number>)["4h"] : 0,
      UNAVAILABLE: typeof record.horizonCounts === "object" && record.horizonCounts && typeof (record.horizonCounts as Record<string, unknown>).UNAVAILABLE === "number" ? (record.horizonCounts as Record<string, number>).UNAVAILABLE : 0,
    },
    symbolsScanned: typeof record.symbolsScanned === "number" ? record.symbolsScanned : 0,
    generatedAt: safeString(record.generatedAt) ?? new Date().toISOString(),
  };
}

export function explainReplayDataset(summary: ReplayDatasetSummary): string {
  if (summary.totalWindows === 0) {
    return "No replay windows available. Run the Auto Intelligence Cycle to generate candle data.";
  }

  const parts: string[] = [];
  parts.push(`Scanned ${summary.symbolsScanned} symbol${summary.symbolsScanned !== 1 ? "s" : ""}, ${summary.totalWindows} replay window${summary.totalWindows !== 1 ? "s" : ""}.`);
  parts.push(`${summary.measurableWindows} measurable, ${summary.unavailableWindows} unavailable.`);

  if (summary.favorableCount + summary.unfavorableCount + summary.flatCount > 0) {
    parts.push(`${summary.favorableCount} favorable, ${summary.unfavorableCount} unfavorable, ${summary.flatCount} flat.`);
  }

  if (summary.horizonCounts["15m"] > 0 || summary.horizonCounts["1h"] > 0 || summary.horizonCounts["4h"] > 0) {
    parts.push(`Horizons: ${summary.horizonCounts["15m"]}x15m, ${summary.horizonCounts["1h"]}x1h, ${summary.horizonCounts["4h"]}x4h.`);
  }

  if (summary.averageMovePct !== null) {
    parts.push(`Average move: ${summary.averageMovePct.toFixed(2)}%.`);
  }

  if (summary.bestSymbol) parts.push(`Best: ${summary.bestSymbol}.`);
  if (summary.worstSymbol && summary.worstSymbol !== summary.bestSymbol) parts.push(`Worst: ${summary.worstSymbol}.`);

  if (summary.unavailableWindows > 0) {
    parts.push(`${summary.unavailableWindows} window${summary.unavailableWindows !== 1 ? "s" : ""} missing candle data.`);
  }

  return parts.join(" ");
}
