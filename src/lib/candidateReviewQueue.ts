/**
 * Candidate Review Queue v1
 *
 * Collects high-quality signal candidates for human review.
 * Review-only. No orders. No paper positions. No execution.
 *
 * Safety guarantees:
 * - No wallet connection
 * - No real orders
 * - No paper positions opened automatically
 * - No trade creation
 * - Review-only candidate queue
 */

import type { SignalQualityRecord } from "@/lib/signalQualityScore";
import type { MarketDataIntegrityReport } from "@/lib/marketDataIntegrity";

export type CandidateStatus = "WATCH" | "REVIEW" | "BLOCKED" | "STALE" | "DISMISSED";

export interface CandidateReviewRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  symbol: string;
  timeframe: string;
  source: string;
  direction: string;
  candidateStatus: CandidateStatus;
  baseScore: number;
  evidenceModifier: number;
  finalScore: number;
  evidenceCompleteness: string;
  evidencePositiveFactors: string[];
  evidenceNegativeFactors: string[];
  evidenceMissingFactors: string[];
  evidenceCapsApplied: string[];
  evidenceSnapshotAt: string;
  integrityScore: number;
  integrityReadiness: string;
  latestCandleAt: string;
  riskStatus: string;
  riskReason: string;
  reasonSummary: string;
  reviewNotes: string;
  reviewedAt: string | null;
  dismissedAt: string | null;
}

export const CANDIDATE_REVIEW_STORAGE_KEY = "chanter-candidate-review-queue";
export const MAX_CANDIDATE_RECORDS = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isCandidateStatus(value: unknown): value is CandidateStatus {
  return value === "WATCH" || value === "REVIEW" || value === "BLOCKED" || value === "STALE" || value === "DISMISSED";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Build a candidate from a signal quality record and integrity report.
 * Pure function - no side effects.
 */
export function buildCandidateFromSnapshot(opts: {
  signalRecord: SignalQualityRecord;
  integrityReport: MarketDataIntegrityReport | null;
  symbol: string;
  source?: string;
}): CandidateReviewRecord | null {
  const { signalRecord, integrityReport, symbol } = opts;
  const source = opts.source ?? "AUTO_CYCLE";
  const now = new Date().toISOString();

  const baseScore = signalRecord.baseScore ?? signalRecord.score;
  const evidenceModifier = signalRecord.evidenceModifier ?? 0;
  const finalScore = signalRecord.finalScore ?? signalRecord.score;
  const evidenceCompleteness = signalRecord.evidenceCompleteness ?? "missing";
  const evidenceSnapshotAt = signalRecord.evidenceSnapshotAt ?? signalRecord.createdAt;
  const integrityScore = integrityReport ? integrityReport.integrityScore : 0;
  const integrityReadiness = integrityReport ? integrityReport.readinessStatus : "unknown";
  const latestCandleAt = integrityReport && integrityReport.latestCandleTime
    ? integrityReport.latestCandleTime
    : integrityReport && integrityReport.createdAt
      ? integrityReport.createdAt
      : now;
  const riskStatus = signalRecord.input.riskStatus;
  const riskReason = signalRecord.input.riskReason;
  const direction = signalRecord.input.direction;

  // Determine candidate status
  let status: CandidateStatus;

  if (riskStatus === "BLOCKED") {
    status = "BLOCKED";
  } else if (finalScore < 60) {
    status = "BLOCKED";
  } else if (integrityReport && (integrityReport.freshnessStatus === "stale" || integrityReport.readinessStatus === "blocked")) {
    status = "STALE";
  } else if (evidenceCompleteness === "missing" && finalScore < 80) {
    status = "WATCH";
  } else if (finalScore >= 80 && (evidenceCompleteness === "complete" || evidenceCompleteness === "partial")) {
    status = "REVIEW";
  } else if (finalScore >= 60 && finalScore < 80) {
    status = "WATCH";
  } else {
    // finalScore >= 80 but evidence missing
    status = "WATCH";
  }

  // STALE overrides WATCH/REVIEW but not BLOCKED
  if (status !== "BLOCKED" && integrityReport && integrityReport.freshnessStatus === "stale") {
    status = "STALE";
  }

  const reasonParts: string[] = [];
  reasonParts.push(`Score ${finalScore}/100 (${status})`);
  if (evidenceCompleteness === "missing") reasonParts.push("evidence missing");
  if (integrityReport && integrityReport.integrityScore < 50) reasonParts.push("low integrity");
  if (riskStatus === "BLOCKED") reasonParts.push("risk blocked");
  if (riskStatus === "WAIT") reasonParts.push("risk wait");
  if (direction === "WAIT") reasonParts.push("direction WAIT");

  return {
    id: `candidate-${symbol}-15m-${evidenceSnapshotAt}`,
    createdAt: now,
    updatedAt: now,
    symbol,
    timeframe: "15m",
    source,
    direction,
    candidateStatus: status,
    baseScore,
    evidenceModifier,
    finalScore,
    evidenceCompleteness,
    evidencePositiveFactors: signalRecord.evidencePositiveFactors ?? [],
    evidenceNegativeFactors: signalRecord.evidenceNegativeFactors ?? [],
    evidenceMissingFactors: signalRecord.evidenceMissingFactors ?? [],
    evidenceCapsApplied: signalRecord.evidenceCapsApplied ?? [],
    evidenceSnapshotAt,
    integrityScore,
    integrityReadiness,
    latestCandleAt,
    riskStatus,
    riskReason,
    reasonSummary: reasonParts.join(", "),
    reviewNotes: "",
    reviewedAt: null,
    dismissedAt: null,
  };
}

export function normalizeCandidateReviewRecord(value: unknown): CandidateReviewRecord | null {
  if (!isRecord(value)) return null;
  const r = value;

  if (typeof r.id !== "string" || r.id.trim() === "") return null;
  if (!isValidDateString(r.createdAt)) return null;
  if (!isValidDateString(r.updatedAt)) return null;
  if (typeof r.symbol !== "string" || r.symbol.trim() === "") return null;
  if (typeof r.timeframe !== "string") return null;
  if (typeof r.source !== "string") return null;
  if (typeof r.direction !== "string") return null;
  if (!isCandidateStatus(r.candidateStatus)) return null;
  if (!isFiniteNumber(r.baseScore)) return null;
  if (!isFiniteNumber(r.evidenceModifier)) return null;
  if (!isFiniteNumber(r.finalScore)) return null;
  if (typeof r.evidenceCompleteness !== "string") return null;
  if (!isStringArray(r.evidencePositiveFactors)) return null;
  if (!isStringArray(r.evidenceNegativeFactors)) return null;
  if (!isStringArray(r.evidenceMissingFactors)) return null;
  if (!isStringArray(r.evidenceCapsApplied)) return null;
  if (!isValidDateString(r.evidenceSnapshotAt)) return null;
  if (!isFiniteNumber(r.integrityScore)) return null;
  if (typeof r.integrityReadiness !== "string") return null;
  if (typeof r.latestCandleAt !== "string") return null;
  if (typeof r.riskStatus !== "string") return null;
  if (typeof r.riskReason !== "string") return null;
  if (typeof r.reasonSummary !== "string") return null;
  if (typeof r.reviewNotes !== "string") return null;
  if (r.reviewedAt !== null && !isValidDateString(r.reviewedAt)) return null;
  if (r.dismissedAt !== null && !isValidDateString(r.dismissedAt)) return null;

  return {
    id: r.id,
    createdAt: r.createdAt as string,
    updatedAt: r.updatedAt as string,
    symbol: r.symbol as string,
    timeframe: r.timeframe as string,
    source: r.source as string,
    direction: r.direction as string,
    candidateStatus: r.candidateStatus as CandidateStatus,
    baseScore: r.baseScore as number,
    evidenceModifier: r.evidenceModifier as number,
    finalScore: r.finalScore as number,
    evidenceCompleteness: r.evidenceCompleteness as string,
    evidencePositiveFactors: r.evidencePositiveFactors as string[],
    evidenceNegativeFactors: r.evidenceNegativeFactors as string[],
    evidenceMissingFactors: r.evidenceMissingFactors as string[],
    evidenceCapsApplied: r.evidenceCapsApplied as string[],
    evidenceSnapshotAt: r.evidenceSnapshotAt as string,
    integrityScore: r.integrityScore as number,
    integrityReadiness: r.integrityReadiness as string,
    latestCandleAt: r.latestCandleAt as string,
    riskStatus: r.riskStatus as string,
    riskReason: r.riskReason as string,
    reasonSummary: r.reasonSummary as string,
    reviewNotes: r.reviewNotes as string,
    reviewedAt: r.reviewedAt as string | null,
    dismissedAt: r.dismissedAt as string | null,
  };
}

export function loadCandidateReviewQueue(): CandidateReviewRecord[] {
  try {
    const raw = localStorage.getItem(CANDIDATE_REVIEW_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seenIds = new Set<string>();
    return parsed
      .map(normalizeCandidateReviewRecord)
      .filter((record): record is CandidateReviewRecord => {
        if (!record || seenIds.has(record.id)) return false;
        seenIds.add(record.id);
        return true;
      })
      .slice(0, MAX_CANDIDATE_RECORDS);
  } catch {
    return [];
  }
}

export function saveCandidateReviewQueue(records: CandidateReviewRecord[]): boolean {
  try {
    const normalized = records.map(normalizeCandidateReviewRecord).filter((r): r is CandidateReviewRecord => r !== null);
    const seenIds = new Set<string>();
    const deduped = normalized.filter((r) => {
      if (seenIds.has(r.id)) return false;
      seenIds.add(r.id);
      return true;
    });
    const capped = deduped.slice(0, MAX_CANDIDATE_RECORDS);
    localStorage.setItem(CANDIDATE_REVIEW_STORAGE_KEY, JSON.stringify(capped));
    return true;
  } catch {
    return false;
  }
}

export function addOrUpdateCandidate(record: CandidateReviewRecord): CandidateReviewRecord[] {
  const existing = loadCandidateReviewQueue();
  const idx = existing.findIndex((r) => r.id === record.id);
  if (idx >= 0) {
    // Update existing: keep original createdAt, update everything else
    const updated: CandidateReviewRecord = {
      ...record,
      createdAt: existing[idx].createdAt,
      updatedAt: new Date().toISOString(),
      reviewedAt: existing[idx].reviewedAt,
      reviewNotes: existing[idx].reviewNotes,
      dismissedAt: existing[idx].dismissedAt,
    };
    const next = [...existing];
    next[idx] = updated;
    saveCandidateReviewQueue(next);
    return next;
  }
  // Add new
  const next = [record, ...existing].slice(0, MAX_CANDIDATE_RECORDS);
  saveCandidateReviewQueue(next);
  return next;
}

export function markCandidateReviewed(id: string, notes: string): CandidateReviewRecord[] {
  const existing = loadCandidateReviewQueue();
  const now = new Date().toISOString();
  const next = existing.map((r) =>
    r.id === id
      ? { ...r, reviewedAt: now, reviewNotes: notes, updatedAt: now }
      : r,
  );
  saveCandidateReviewQueue(next);
  return next;
}

export function dismissCandidate(id: string): CandidateReviewRecord[] {
  const existing = loadCandidateReviewQueue();
  const now = new Date().toISOString();
  const next = existing.map((r) =>
    r.id === id
      ? { ...r, dismissedAt: now, candidateStatus: "DISMISSED" as CandidateStatus, updatedAt: now }
      : r,
  );
  saveCandidateReviewQueue(next);
  return next;
}

export function clearDismissedCandidates(): CandidateReviewRecord[] {
  const existing = loadCandidateReviewQueue();
  const next = existing.filter((r) => r.candidateStatus !== "DISMISSED");
  saveCandidateReviewQueue(next);
  return next;
}

export function clearCandidateReviewQueue(): boolean {
  try {
    localStorage.removeItem(CANDIDATE_REVIEW_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function getCandidateSummary(): {
  total: number;
  review: number;
  watch: number;
  blocked: number;
  stale: number;
  dismissed: number;
  latestSymbol: string | null;
  latestScore: number | null;
  lastUpdate: string | null;
} {
  const records = loadCandidateReviewQueue();
  const active = records.filter((r) => r.candidateStatus !== "DISMISSED");
  return {
    total: records.length,
    review: active.filter((r) => r.candidateStatus === "REVIEW").length,
    watch: active.filter((r) => r.candidateStatus === "WATCH").length,
    blocked: active.filter((r) => r.candidateStatus === "BLOCKED").length,
    stale: active.filter((r) => r.candidateStatus === "STALE").length,
    dismissed: records.filter((r) => r.candidateStatus === "DISMISSED").length,
    latestSymbol: active[0]?.symbol ?? null,
    latestScore: active[0]?.finalScore ?? null,
    lastUpdate: active[0]?.updatedAt ?? null,
  };
}
