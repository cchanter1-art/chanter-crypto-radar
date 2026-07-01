/**
 * Paper Outcome Tracker v1
 *
 * Read-only forward outcome proof for ranked opportunities.
 * Tracks what happened after a candidate appeared -- did the
 * price move favorably, adversely, or stay flat?
 *
 * Safety guarantees:
 * - No trades, no orders, no positions, no execution
 * - No wallet/Web3/API keys
 * - Does not modify risk gates
 * - Uses only existing available candle/price data
 * - Missing data = UNAVAILABLE or PENDING, never fabricated
 */

import type { CandidateReviewRecord } from "@/lib/candidateReviewQueue";

// === Types ===

export type OutcomeResult =
  | "PENDING"
  | "WIN"
  | "LOSS"
  | "FLAT"
  | "NO_ACTION"
  | "BLOCKED"
  | "UNAVAILABLE";

export type OutcomeFilter =
  | "ALL"
  | "PENDING"
  | "WIN"
  | "LOSS"
  | "FLAT"
  | "NO_ACTION"
  | "BLOCKED"
  | "UNAVAILABLE";

export interface PaperOutcomeSymbolSummary {
  symbol: string;
  total: number;
  wins: number;
  losses: number;
  flat: number;
  blocked: number;
  noAction: number;
  pending: number;
  unavailable: number;
  measurable: number;
  measurableWinRate: number;
  averageMovePct: number | null;
  latestOutcomeAt: string | null;
}

export interface PaperOutcomeRecord {
  id: string;
  sourceCandidateId: string;
  sourceRankingId: string | null;
  symbol: string;
  timeframe: string;
  direction: string;
  action: string;
  candidateStatus: string;
  reasonCode: string;
  reasonSummary: string;
  rankScore: number;
  finalScore: number;
  evidenceCompleteness: string;
  integrityScore: number;
  integrityReadiness: string;
  createdAt: string;
  baselinePrice: number | null;
  baselineTime: string | null;
  latestPrice: number | null;
  latestTime: string | null;
  changePct: number | null;
  maxFavorablePct: number | null;
  maxAdversePct: number | null;
  outcome15m: OutcomeResult;
  outcome1h: OutcomeResult;
  outcome4h: OutcomeResult;
  outcomeStatus: OutcomeResult;
  outcomeSummary: string;
  updatedAt: string;
}

export interface PaperOutcomeSummary {
  total: number;
  pending: number;
  wins: number;
  losses: number;
  flat: number;
  blocked: number;
  noAction: number;
  unavailable: number;
  measurable: number;
  winRate: number;
  avgChangePct: number | null;
}

export interface OutcomeOptions {
  flatThresholdPct?: number;
  horizon15mMs?: number;
  horizon1hMs?: number;
  horizon4hMs?: number;
}

export interface MarketDataSnapshot {
  price: number;
  time: string;
}

// === Constants ===

export const PAPER_OUTCOME_STORAGE_KEY = "chanter-paper-outcome-history";
export const MAX_PAPER_OUTCOME_RECORDS = 500;

const DEFAULT_FLAT_THRESHOLD_PCT = 0.15;
const DEFAULT_HORIZON_15M_MS = 15 * 60 * 1000;
const DEFAULT_HORIZON_1H_MS = 60 * 60 * 1000;
const DEFAULT_HORIZON_4H_MS = 240 * 60 * 1000;

// === Helpers ===

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isOutcomeResult(value: unknown): value is OutcomeResult {
  return (
    value === "PENDING" ||
    value === "WIN" ||
    value === "LOSS" ||
    value === "FLAT" ||
    value === "NO_ACTION" ||
    value === "BLOCKED" ||
    value === "UNAVAILABLE"
  );
}

function safeString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function safeNumber(value: unknown, fallback: number): number {
  return isFiniteNumber(value) ? value : fallback;
}

function safeNumberOrNull(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null;
}

function safeStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

// === Outcome computation ===

function computeOutcomeForHorizon(
  direction: string,
  baselinePrice: number | null,
  latestPrice: number | null,
  baselineTime: string | null,
  latestTime: string | null,
  now: number,
  horizonMs: number,
  flatThresholdPct: number,
): OutcomeResult {
  if (baselinePrice === null || baselinePrice <= 0) return "UNAVAILABLE";
  if (!baselineTime) return "UNAVAILABLE";
  if (!latestTime) return "PENDING";

  const baselineMs = Date.parse(baselineTime);
  if (Number.isNaN(baselineMs)) return "UNAVAILABLE";

  const elapsedMs = now - baselineMs;
  if (elapsedMs < horizonMs) return "PENDING";

  if (latestPrice === null || latestPrice <= 0) return "UNAVAILABLE";

  const changePct = ((latestPrice - baselinePrice) / baselinePrice) * 100;
  const absChange = Math.abs(changePct);

  if (absChange < flatThresholdPct) return "FLAT";

  if (direction === "LONG") {
    return changePct > 0 ? "WIN" : "LOSS";
  } else if (direction === "SHORT") {
    return changePct < 0 ? "WIN" : "LOSS";
  }

  return "NO_ACTION";
}

function computeMaxFavorable(
  direction: string,
  baselinePrice: number,
  latestPrice: number,
): number {
  if (direction === "LONG") {
    return ((latestPrice - baselinePrice) / baselinePrice) * 100;
  } else if (direction === "SHORT") {
    return ((baselinePrice - latestPrice) / baselinePrice) * 100;
  }
  return 0;
}

function computeMaxAdverse(
  direction: string,
  baselinePrice: number,
  latestPrice: number,
): number {
  if (direction === "LONG") {
    return ((baselinePrice - latestPrice) / baselinePrice) * 100;
  } else if (direction === "SHORT") {
    return ((latestPrice - baselinePrice) / baselinePrice) * 100;
  }
  return 0;
}

function determineOutcomeStatus(
  outcome15m: OutcomeResult,
  outcome1h: OutcomeResult,
  outcome4h: OutcomeResult,
): OutcomeResult {
  // Priority: UNAVAILABLE > BLOCKED > NO_ACTION > PENDING > WIN/LOSS/FLAT
  if (outcome15m === "UNAVAILABLE" && outcome1h === "UNAVAILABLE" && outcome4h === "UNAVAILABLE") {
    return "UNAVAILABLE";
  }
  // Use the longest available horizon that has resolved
  if (outcome4h !== "PENDING") return outcome4h;
  if (outcome1h !== "PENDING") return outcome1h;
  if (outcome15m !== "PENDING") return outcome15m;
  return "PENDING";
}

function buildOutcomeSummary(
  symbol: string,
  direction: string,
  outcomeStatus: OutcomeResult,
  changePct: number | null,
): string {
  if (outcomeStatus === "BLOCKED") return `${symbol}: BLOCKED -- risk gate blocked, not scored`;
  if (outcomeStatus === "NO_ACTION") return `${symbol}: NO_ACTION -- WAIT direction, no forward action`;
  if (outcomeStatus === "UNAVAILABLE") return `${symbol}: UNAVAILABLE -- no baseline price data`;
  if (outcomeStatus === "PENDING") return `${symbol}: PENDING -- awaiting horizon elapsed time`;
  if (outcomeStatus === "FLAT") return `${symbol}: FLAT -- price moved less than threshold`;
  if (outcomeStatus === "WIN") {
    const pct = changePct !== null ? changePct.toFixed(2) + "%" : "unknown";
    return `${symbol}: WIN -- favorable move (${pct}) for ${direction}`;
  }
  if (outcomeStatus === "LOSS") {
    const pct = changePct !== null ? changePct.toFixed(2) + "%" : "unknown";
    return `${symbol}: LOSS -- adverse move (${pct}) for ${direction}`;
  }
  return `${symbol}: ${outcomeStatus}`;
}

// === Core functions ===

export function buildPaperOutcomeRecord(
  candidate: CandidateReviewRecord,
  marketData: { price: number; time: string } | null,
  options?: OutcomeOptions,
): PaperOutcomeRecord {
  const flatThresholdPct = options?.flatThresholdPct ?? DEFAULT_FLAT_THRESHOLD_PCT;
  const horizon15mMs = options?.horizon15mMs ?? DEFAULT_HORIZON_15M_MS;
  const horizon1hMs = options?.horizon1hMs ?? DEFAULT_HORIZON_1H_MS;
  const horizon4hMs = options?.horizon4hMs ?? DEFAULT_HORIZON_4H_MS;
  const now = Date.now();

  const baselinePrice = marketData ? safeNumberOrNull(marketData.price) : null;
  const baselineTime = marketData ? safeStringOrNull(marketData.time) : null;

  let action = "WAIT";
  if (candidate.candidateStatus === "BLOCKED") action = "BLOCKED";
  else if (candidate.candidateStatus === "REVIEW") action = "REVIEW";
  else if (candidate.candidateStatus === "WATCH") action = "WATCH";
  else if (candidate.candidateStatus === "STALE") action = "WAIT";

  // Determine reasonCode from candidate
  const reasonCode = safeString(candidate.reasonSummary, "UNKNOWN").split(" ")[0] || "UNKNOWN";

  let outcome15m: OutcomeResult;
  let outcome1h: OutcomeResult;
  let outcome4h: OutcomeResult;

  if (candidate.candidateStatus === "BLOCKED") {
    outcome15m = "BLOCKED";
    outcome1h = "BLOCKED";
    outcome4h = "BLOCKED";
  } else if (candidate.direction === "WAIT") {
    outcome15m = "NO_ACTION";
    outcome1h = "NO_ACTION";
    outcome4h = "NO_ACTION";
  } else {
    // Initially PENDING until market data arrives and time passes
    outcome15m = computeOutcomeForHorizon(
      candidate.direction,
      baselinePrice,
      baselinePrice,
      baselineTime,
      baselineTime,
      now,
      horizon15mMs,
      flatThresholdPct,
    );
    outcome1h = computeOutcomeForHorizon(
      candidate.direction,
      baselinePrice,
      baselinePrice,
      baselineTime,
      baselineTime,
      now,
      horizon1hMs,
      flatThresholdPct,
    );
    outcome4h = computeOutcomeForHorizon(
      candidate.direction,
      baselinePrice,
      baselinePrice,
      baselineTime,
      baselineTime,
      now,
      horizon4hMs,
      flatThresholdPct,
    );
  }

  const outcomeStatus = determineOutcomeStatus(outcome15m, outcome1h, outcome4h);
  const changePct = baselinePrice !== null && baselinePrice > 0 ? 0 : null;
  const maxFav = baselinePrice !== null && baselinePrice > 0 ? 0 : null;
  const maxAdv = baselinePrice !== null && baselinePrice > 0 ? 0 : null;

  const record: PaperOutcomeRecord = {
    id: `outcome-${candidate.id}`,
    sourceCandidateId: candidate.id,
    sourceRankingId: null,
    symbol: candidate.symbol,
    timeframe: candidate.timeframe,
    direction: candidate.direction,
    action,
    candidateStatus: candidate.candidateStatus,
    reasonCode,
    reasonSummary: candidate.reasonSummary,
    rankScore: candidate.finalScore,
    finalScore: candidate.finalScore,
    evidenceCompleteness: candidate.evidenceCompleteness,
    integrityScore: candidate.integrityScore,
    integrityReadiness: candidate.integrityReadiness,
    createdAt: candidate.createdAt,
    baselinePrice,
    baselineTime,
    latestPrice: baselinePrice,
    latestTime: baselineTime,
    changePct,
    maxFavorablePct: maxFav,
    maxAdversePct: maxAdv,
    outcome15m,
    outcome1h,
    outcome4h,
    outcomeStatus,
    outcomeSummary: buildOutcomeSummary(candidate.symbol, candidate.direction, outcomeStatus, changePct),
    updatedAt: new Date(now).toISOString(),
  };

  return record;
}

export function updatePaperOutcomeRecord(
  record: PaperOutcomeRecord,
  latestMarketData: MarketDataSnapshot | null,
  now?: number,
): PaperOutcomeRecord {
  const currentTime = now ?? Date.now();
  const flatThresholdPct = DEFAULT_FLAT_THRESHOLD_PCT;

  if (!latestMarketData || latestMarketData.price <= 0) {
    // No new data -- keep existing state but update timestamp
    return {
      ...record,
      updatedAt: new Date(currentTime).toISOString(),
    };
  }

  const latestPrice = safeNumberOrNull(latestMarketData.price);
  const latestTime = safeStringOrNull(latestMarketData.time);

  if (latestPrice === null || !latestTime) {
    return {
      ...record,
      updatedAt: new Date(currentTime).toISOString(),
    };
  }

  const baselinePrice = record.baselinePrice;
  const baselineTime = record.baselineTime;

  let changePct: number | null = null;
  let maxFavorablePct: number | null = null;
  let maxAdversePct: number | null = null;

  if (baselinePrice !== null && baselinePrice > 0) {
    changePct = ((latestPrice - baselinePrice) / baselinePrice) * 100;
    maxFavorablePct = computeMaxFavorable(record.direction, baselinePrice, latestPrice);
    maxAdversePct = computeMaxAdverse(record.direction, baselinePrice, latestPrice);

    // Track max favorable/adverse across updates
    if (record.maxFavorablePct !== null) {
      maxFavorablePct = Math.max(record.maxFavorablePct, maxFavorablePct);
    }
    if (record.maxAdversePct !== null) {
      maxAdversePct = Math.max(record.maxAdversePct, maxAdversePct);
    }
  }

  let outcome15m: OutcomeResult;
  let outcome1h: OutcomeResult;
  let outcome4h: OutcomeResult;

  if (record.candidateStatus === "BLOCKED") {
    outcome15m = "BLOCKED";
    outcome1h = "BLOCKED";
    outcome4h = "BLOCKED";
  } else if (record.direction === "WAIT") {
    outcome15m = "NO_ACTION";
    outcome1h = "NO_ACTION";
    outcome4h = "NO_ACTION";
  } else {
    outcome15m = computeOutcomeForHorizon(
      record.direction,
      baselinePrice,
      latestPrice,
      baselineTime,
      latestTime,
      currentTime,
      DEFAULT_HORIZON_15M_MS,
      flatThresholdPct,
    );
    outcome1h = computeOutcomeForHorizon(
      record.direction,
      baselinePrice,
      latestPrice,
      baselineTime,
      latestTime,
      currentTime,
      DEFAULT_HORIZON_1H_MS,
      flatThresholdPct,
    );
    outcome4h = computeOutcomeForHorizon(
      record.direction,
      baselinePrice,
      latestPrice,
      baselineTime,
      latestTime,
      currentTime,
      DEFAULT_HORIZON_4H_MS,
      flatThresholdPct,
    );
  }

  const outcomeStatus = determineOutcomeStatus(outcome15m, outcome1h, outcome4h);

  return {
    ...record,
    latestPrice,
    latestTime,
    changePct,
    maxFavorablePct,
    maxAdversePct,
    outcome15m,
    outcome1h,
    outcome4h,
    outcomeStatus,
    outcomeSummary: buildOutcomeSummary(record.symbol, record.direction, outcomeStatus, changePct),
    updatedAt: new Date(currentTime).toISOString(),
  };
}


export function buildPaperOutcomeSummary(
  records: PaperOutcomeRecord[],
): PaperOutcomeSummary {
  const summary: PaperOutcomeSummary = {
    total: records.length,
    pending: 0,
    wins: 0,
    losses: 0,
    flat: 0,
    blocked: 0,
    noAction: 0,
    unavailable: 0,
    measurable: 0,
    winRate: 0,
    avgChangePct: null,
  };

  let changeSum = 0;
  let changeCount = 0;

  for (const r of records) {
    switch (r.outcomeStatus) {
      case "PENDING": summary.pending++; break;
      case "WIN": summary.wins++; summary.measurable++; break;
      case "LOSS": summary.losses++; summary.measurable++; break;
      case "FLAT": summary.flat++; summary.measurable++; break;
      case "BLOCKED": summary.blocked++; break;
      case "NO_ACTION": summary.noAction++; break;
      case "UNAVAILABLE": summary.unavailable++; break;
    }
    if (r.changePct !== null) {
      changeSum += r.changePct;
      changeCount++;
    }
  }

  if (summary.measurable > 0) {
    summary.winRate = (summary.wins / summary.measurable) * 100;
  }
  if (changeCount > 0) {
    summary.avgChangePct = changeSum / changeCount;
  }

  return summary;
}

export function normalizePaperOutcomeRecord(
  record: unknown,
): PaperOutcomeRecord | null {
  if (!isRecord(record)) return null;

  const id = safeString(record.id, "");
  const sourceCandidateId = safeString(record.sourceCandidateId, "");
  if (!id || !sourceCandidateId) return null;

  const symbol = safeString(record.symbol, "");
  if (!symbol) return null;

  const createdAt = isValidDateString(record.createdAt) ? record.createdAt : new Date().toISOString();
  const updatedAt = isValidDateString(record.updatedAt) ? record.updatedAt : createdAt;

  const outcome15m = isOutcomeResult(record.outcome15m) ? record.outcome15m : "PENDING";
  const outcome1h = isOutcomeResult(record.outcome1h) ? record.outcome1h : "PENDING";
  const outcome4h = isOutcomeResult(record.outcome4h) ? record.outcome4h : "PENDING";
  const outcomeStatus = isOutcomeResult(record.outcomeStatus) ? record.outcomeStatus : "PENDING";

  return {
    id,
    sourceCandidateId,
    sourceRankingId: safeStringOrNull(record.sourceRankingId),
    symbol,
    timeframe: safeString(record.timeframe, "15m"),
    direction: safeString(record.direction, "WAIT"),
    action: safeString(record.action, "WAIT"),
    candidateStatus: safeString(record.candidateStatus, "WATCH"),
    reasonCode: safeString(record.reasonCode, "UNKNOWN"),
    reasonSummary: safeString(record.reasonSummary, ""),
    rankScore: safeNumber(record.rankScore, 0),
    finalScore: safeNumber(record.finalScore, 0),
    evidenceCompleteness: safeString(record.evidenceCompleteness, "missing"),
    integrityScore: safeNumber(record.integrityScore, 0),
    integrityReadiness: safeString(record.integrityReadiness, "unknown"),
    createdAt,
    baselinePrice: safeNumberOrNull(record.baselinePrice),
    baselineTime: isValidDateString(record.baselineTime) ? record.baselineTime : null,
    latestPrice: safeNumberOrNull(record.latestPrice),
    latestTime: isValidDateString(record.latestTime) ? record.latestTime : null,
    changePct: safeNumberOrNull(record.changePct),
    maxFavorablePct: safeNumberOrNull(record.maxFavorablePct),
    maxAdversePct: safeNumberOrNull(record.maxAdversePct),
    outcome15m,
    outcome1h,
    outcome4h,
    outcomeStatus,
    outcomeSummary: safeString(record.outcomeSummary, ""),
    updatedAt,
  };
}

// === Persistence ===

export function loadPaperOutcomeHistory(): PaperOutcomeRecord[] {
  try {
    const raw = localStorage.getItem(PAPER_OUTCOME_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizePaperOutcomeRecord)
      .filter((r): r is PaperOutcomeRecord => r !== null)
      .slice(0, MAX_PAPER_OUTCOME_RECORDS);
  } catch {
    return [];
  }
}

export function savePaperOutcomeHistory(records: PaperOutcomeRecord[]): void {
  try {
    const capped = records.slice(0, MAX_PAPER_OUTCOME_RECORDS);
    localStorage.setItem(PAPER_OUTCOME_STORAGE_KEY, JSON.stringify(capped));
  } catch {
    // localStorage might be full or unavailable
  }
}

export function addOrUpdatePaperOutcome(
  records: PaperOutcomeRecord[],
  record: PaperOutcomeRecord,
): PaperOutcomeRecord[] {
  const idx = records.findIndex((r) => r.id === record.id);
  if (idx >= 0) {
    const updated = [...records];
    updated[idx] = record;
    return updated;
  }
  return [record, ...records].slice(0, MAX_PAPER_OUTCOME_RECORDS);
}

export function clearPaperOutcomeHistory(): PaperOutcomeRecord[] {
  try {
    localStorage.removeItem(PAPER_OUTCOME_STORAGE_KEY);
  } catch {
    // ignore
  }
  return [];
}

// === Filtering and sorting ===

export function filterPaperOutcomes(
  records: PaperOutcomeRecord[],
  filter: OutcomeFilter,
): PaperOutcomeRecord[] {
  if (filter === "ALL") return records;
  return records.filter((r) => r.outcomeStatus === filter);
}

export function sortPaperOutcomes(
  records: PaperOutcomeRecord[],
): PaperOutcomeRecord[] {
  const priority: Record<OutcomeResult, number> = {
    WIN: 0,
    LOSS: 1,
    FLAT: 2,
    PENDING: 3,
    NO_ACTION: 4,
    BLOCKED: 5,
    UNAVAILABLE: 6,
  };
  return [...records].sort((a, b) => {
    const pa = priority[a.outcomeStatus] ?? 99;
    const pb = priority[b.outcomeStatus] ?? 99;
    if (pa !== pb) return pa - pb;
    // Secondary: most recent first
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

export function getTopOutcomeStats(
  records: PaperOutcomeRecord[],
): PaperOutcomeSummary {
  return buildPaperOutcomeSummary(records);
}

// === Per-symbol summary ===

export function buildPaperOutcomeSymbolSummary(
  records: PaperOutcomeRecord[],
): PaperOutcomeSymbolSummary[] {
  const bySymbol = new Map<string, PaperOutcomeRecord[]>();
  for (const r of records) {
    const list = bySymbol.get(r.symbol) ?? [];
    list.push(r);
    bySymbol.set(r.symbol, list);
  }
  const summaries: PaperOutcomeSymbolSummary[] = [];
  for (const [symbol, recs] of bySymbol) {
    let wins = 0, losses = 0, flat = 0, blocked = 0, noAction = 0, pending = 0, unavailable = 0;
    let changeSum = 0, changeCount = 0;
    let latestAt: string | null = null;
    for (const r of recs) {
      switch (r.outcomeStatus) {
        case "WIN": wins++; break;
        case "LOSS": losses++; break;
        case "FLAT": flat++; break;
        case "BLOCKED": blocked++; break;
        case "NO_ACTION": noAction++; break;
        case "PENDING": pending++; break;
        case "UNAVAILABLE": unavailable++; break;
      }
      if (r.changePct !== null) {
        changeSum += r.changePct;
        changeCount++;
      }
      if (r.updatedAt && (!latestAt || r.updatedAt > latestAt)) {
        latestAt = r.updatedAt;
      }
    }
    const measurable = wins + losses + flat;
    summaries.push({
      symbol,
      total: recs.length,
      wins,
      losses,
      flat,
      blocked,
      noAction,
      pending,
      unavailable,
      measurable,
      measurableWinRate: measurable > 0 ? (wins / measurable) * 100 : 0,
      averageMovePct: changeCount > 0 ? changeSum / changeCount : null,
      latestOutcomeAt: latestAt,
    });
  }
  // Sort by measurableWinRate desc, then total desc
  summaries.sort((a, b) => {
    if (b.measurableWinRate !== a.measurableWinRate) return b.measurableWinRate - a.measurableWinRate;
    if (b.total !== a.total) return b.total - a.total;
    return a.symbol.localeCompare(b.symbol);
  });
  return summaries;
}

export function getBestOutcomeSymbol(
  records: PaperOutcomeRecord[],
): PaperOutcomeSymbolSummary | null {
  const summaries = buildPaperOutcomeSymbolSummary(records);
  if (summaries.length === 0) return null;
  // Best = highest measurable win rate with at least 1 measurable outcome
  const measurable = summaries.filter((s) => s.measurable > 0);
  if (measurable.length > 0) return measurable[0];
  // Fallback: most total records
  return summaries[0];
}

export function getWorstOutcomeSymbol(
  records: PaperOutcomeRecord[],
): PaperOutcomeSymbolSummary | null {
  const summaries = buildPaperOutcomeSymbolSummary(records);
  if (summaries.length === 0) return null;
  // Worst = lowest measurable win rate with at least 1 measurable outcome
  const measurable = summaries.filter((s) => s.measurable > 0);
  if (measurable.length > 0) return measurable[measurable.length - 1];
  return summaries[summaries.length - 1];
}
