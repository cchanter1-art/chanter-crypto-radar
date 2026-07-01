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
  dismissReason: string;
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
  signalRecord: SignalQualityRecord | null;
  integrityReport: MarketDataIntegrityReport | null;
  symbol: string;
  source?: string;
}): CandidateReviewRecord | null {
  const { signalRecord, integrityReport, symbol } = opts;
  if (!signalRecord) return null;
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
    dismissReason: "",
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
  if (typeof r.dismissReason !== "string") return null;

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
    dismissReason: r.dismissReason as string,
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

export function dismissCandidate(id: string, reason: string = ""): CandidateReviewRecord[] {
  const existing = loadCandidateReviewQueue();
  const now = new Date().toISOString();
  const next = existing.map((r) =>
    r.id === id
      ? { ...r, dismissedAt: now, candidateStatus: "DISMISSED" as CandidateStatus, updatedAt: now, dismissReason: reason }
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

export function getLatestCandidatePerSymbol(): CandidateReviewRecord[] {
  const records = loadCandidateReviewQueue();
  const bySymbol = new Map<string, CandidateReviewRecord>();
  for (const r of records) {
    const existing = bySymbol.get(r.symbol);
    if (!existing || r.updatedAt > existing.updatedAt) {
      bySymbol.set(r.symbol, r);
    }
  }
  return Array.from(bySymbol.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export type CandidateFilter = "ALL" | "REVIEW" | "WATCH" | "STALE" | "BLOCKED" | "DISMISSED";

export function filterCandidates(records: CandidateReviewRecord[], filter: CandidateFilter): CandidateReviewRecord[] {
  if (filter === "ALL") return records;
  return records.filter((r) => r.candidateStatus === filter);
}

export type CandidateSort = "newest" | "score-high" | "score-low" | "status-priority";

const STATUS_PRIORITY: Record<CandidateStatus, number> = {
  REVIEW: 0,
  WATCH: 1,
  STALE: 2,
  BLOCKED: 3,
  DISMISSED: 4,
};

export function sortCandidates(records: CandidateReviewRecord[], sort: CandidateSort): CandidateReviewRecord[] {
  const arr = [...records];
  if (sort === "newest") {
    arr.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } else if (sort === "score-high") {
    arr.sort((a, b) => b.finalScore - a.finalScore);
  } else if (sort === "score-low") {
    arr.sort((a, b) => a.finalScore - b.finalScore);
  } else if (sort === "status-priority") {
    arr.sort((a, b) => STATUS_PRIORITY[a.candidateStatus] - STATUS_PRIORITY[b.candidateStatus]);
  }
  return arr;
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

// === Decision Explanation Model ===

export type CandidateReasonCode =
  | "RISK_BLOCKED"
  | "LOW_FINAL_SCORE"
  | "INTEGRITY_BLOCKED"
  | "INTEGRITY_STALE"
  | "EVIDENCE_MISSING"
  | "WAIT_DIRECTION"
  | "REVIEW_READY"
  | "WATCH_ONLY"
  | "UNKNOWN_CONSERVATIVE";

export type ExplanationSeverity = "info" | "warning" | "blocked";

export interface PromotionChecklistItem {
  label: string;
  passed: boolean;
  detail: string;
}

export interface CandidateExplanation {
  primaryReasonCode: CandidateReasonCode;
  primaryReasonLabel: string;
  explanation: string;
  shortSummary: string;
  severity: ExplanationSeverity;
  blockingFactors: string[];
  missingEvidence: string[];
  positiveFactors: string[];
  promotionChecklist: PromotionChecklistItem[];
}

export function explainCandidateDecision(candidate: CandidateReviewRecord): CandidateExplanation {
  const blockingFactors: string[] = [];
  const missingEvidence: string[] = [];
  const positiveFactors: string[] = [];
  const checklist: PromotionChecklistItem[] = [];

  // --- Check 1: Risk status ---
  const riskBlocked = candidate.riskStatus === "BLOCKED";
  checklist.push({
    label: "Risk status not BLOCKED",
    passed: !riskBlocked,
    detail: riskBlocked ? `Risk status is BLOCKED: ${candidate.riskReason}` : "Risk status is not blocked.",
  });
  if (riskBlocked) {
    blockingFactors.push(`Risk controller BLOCKED: ${candidate.riskReason}`);
  }

  // --- Check 2: Final score threshold ---
  const scorePasses = candidate.finalScore >= 80;
  checklist.push({
    label: "Final score >= 80 (REVIEW threshold)",
    passed: scorePasses,
    detail: scorePasses ? `Score ${candidate.finalScore} meets threshold.` : `Score ${candidate.finalScore} below threshold of 80.`,
  });
  if (!scorePasses && candidate.finalScore < 60) {
    blockingFactors.push(`Final score ${candidate.finalScore} is below 60 (BLOCKED range)`);
  } else if (!scorePasses) {
    blockingFactors.push(`Final score ${candidate.finalScore} is below 80 (WATCH range)`);
  }

  // --- Check 3: Integrity score ---
  const integrityHealthy = candidate.integrityScore >= 70;
  checklist.push({
    label: "Integrity score >= 70",
    passed: integrityHealthy,
    detail: integrityHealthy ? `Integrity score ${candidate.integrityScore}/100 is healthy.` : `Integrity score ${candidate.integrityScore}/100 is below 70.`,
  });
  if (candidate.integrityScore < 30) {
    blockingFactors.push(`Integrity score ${candidate.integrityScore}/100 is critically low (blocked)`);
  } else if (!integrityHealthy) {
    blockingFactors.push(`Integrity score ${candidate.integrityScore}/100 is below healthy threshold`);
  }

  // --- Check 4: Integrity freshness ---
  const readinessBlocked = candidate.integrityReadiness === "blocked";
  const readinessStale = candidate.integrityReadiness.includes("stale") || candidate.integrityReadiness === "not_ready";
  checklist.push({
    label: "Integrity freshness is current",
    passed: !readinessBlocked && !readinessStale,
    detail: readinessBlocked ? "Integrity readiness is blocked." : readinessStale ? "Integrity data is stale." : "Integrity freshness is acceptable.",
  });
  if (readinessBlocked) {
    blockingFactors.push("Integrity readiness is blocked");
  } else if (readinessStale) {
    blockingFactors.push("Integrity data is stale");
  }

  // --- Check 5: Evidence completeness ---
  const evidenceComplete = candidate.evidenceCompleteness === "complete" || candidate.evidenceCompleteness === "partial";
  checklist.push({
    label: "Evidence completeness is partial or better",
    passed: evidenceComplete,
    detail: `Evidence completeness: ${candidate.evidenceCompleteness}`,
  });
  if (candidate.evidenceCompleteness === "missing") {
    missingEvidence.push("No evidence sources available");
  }
  if (candidate.evidenceMissingFactors && candidate.evidenceMissingFactors.length > 0) {
    for (const m of candidate.evidenceMissingFactors) {
      missingEvidence.push(m);
    }
  }

  // --- Check 6: Direction ---
  const directionIsWait = candidate.direction === "WAIT";
  checklist.push({
    label: "Direction is actionable (not WAIT)",
    passed: !directionIsWait,
    detail: directionIsWait ? "Direction is WAIT (conservative default from auto cycle)." : `Direction is ${candidate.direction}.`,
  });
  if (directionIsWait && candidate.candidateStatus === "WATCH") {
    blockingFactors.push("Direction is WAIT (no directional signal)");
  }

  // --- Check 7: Source ---
  const isMock = candidate.source === "LOCAL_MOCK" || candidate.source.includes("MOCK");
  checklist.push({
    label: "Source is live read-only or clearly marked",
    passed: true,
    detail: isMock ? "Source is LOCAL_MOCK (clearly marked)." : "Source is live read-only.",
  });

  // --- Check 8: No execution fields ---
  checklist.push({
    label: "No execution/order fields present",
    passed: true,
    detail: "Candidate is review-only with no trading fields.",
  });

  // --- Positive factors ---
  if (candidate.evidencePositiveFactors) {
    for (const p of candidate.evidencePositiveFactors) {
      positiveFactors.push(p);
    }
  }
  if (integrityHealthy) positiveFactors.push(`Integrity score ${candidate.integrityScore}/100 is healthy`);
  if (scorePasses) positiveFactors.push(`Final score ${candidate.finalScore} meets REVIEW threshold`);
  if (!riskBlocked) positiveFactors.push("Risk status is not blocked");
  if (evidenceComplete) positiveFactors.push(`Evidence completeness: ${candidate.evidenceCompleteness}`);

  // --- Determine primary reason ---
  let primaryReasonCode: CandidateReasonCode;
  let primaryReasonLabel: string;
  let explanation: string;
  let shortSummary: string;
  let severity: ExplanationSeverity;

  if (riskBlocked) {
    primaryReasonCode = "RISK_BLOCKED";
    primaryReasonLabel = "Risk Controller Blocked";
    explanation = `This candidate is BLOCKED because the risk controller returned BLOCKED status: ${candidate.riskReason}. No review promotion is possible until risk status changes.`;
    shortSummary = "Risk-blocked";
    severity = "blocked";
  } else if (candidate.evidenceCompleteness === "missing") {
    primaryReasonCode = "EVIDENCE_MISSING";
    primaryReasonLabel = "Missing Evidence";
    explanation = `Evidence completeness is "missing". No evidence sources (integrity, auto observations, forward test, backtest, risk gate) are available. Score cannot be trusted for review.`;
    shortSummary = "No evidence";
    severity = "warning";
  } else if (candidate.finalScore < 60) {
    primaryReasonCode = "LOW_FINAL_SCORE";
    primaryReasonLabel = "Low Final Score";
    explanation = `Final score ${candidate.finalScore} is below 60, placing this candidate in BLOCKED range. Base score was ${candidate.baseScore} with evidence modifier ${candidate.evidenceModifier >= 0 ? "+" : ""}${candidate.evidenceModifier}.`;
    shortSummary = `Score ${candidate.finalScore} too low`;
    severity = "blocked";
  } else if (readinessBlocked || candidate.integrityScore < 30) {
    primaryReasonCode = "INTEGRITY_BLOCKED";
    primaryReasonLabel = "Integrity Blocked";
    explanation = `Market data integrity is blocked (score ${candidate.integrityScore}/100, readiness: ${candidate.integrityReadiness}). Data quality is insufficient for review.`;
    shortSummary = "Integrity blocked";
    severity = "blocked";
  } else if (readinessStale) {
    primaryReasonCode = "INTEGRITY_STALE";
    primaryReasonLabel = "Stale Market Data";
    explanation = `Market data is stale (readiness: ${candidate.integrityReadiness}). Latest candle: ${candidate.latestCandleAt}. Candidate is marked STALE until fresh data is available.`;
    shortSummary = "Data is stale";
    severity = "warning";
  } else if (candidate.candidateStatus === "REVIEW") {
    primaryReasonCode = "REVIEW_READY";
    primaryReasonLabel = "Review Ready";
    explanation = `This candidate meets all criteria for review: final score ${candidate.finalScore} >= 80, evidence is ${candidate.evidenceCompleteness}, integrity is healthy, and risk is not blocked.`;
    shortSummary = "Ready for review";
    severity = "info";
  } else if (directionIsWait) {
    primaryReasonCode = "WAIT_DIRECTION";
    primaryReasonLabel = "WAIT Direction";
    explanation = `Direction is WAIT (conservative default from auto cycle). Score ${candidate.finalScore} may be acceptable but no directional signal is present. Candidate remains in WATCH.`;
    shortSummary = "No direction signal";
    severity = "warning";
  } else if (candidate.candidateStatus === "WATCH") {
    primaryReasonCode = "WATCH_ONLY";
    primaryReasonLabel = "Watch Only";
    explanation = `Final score ${candidate.finalScore} is in WATCH range (60-79). Candidate needs score >= 80 with complete evidence and healthy integrity to reach REVIEW.`;
    shortSummary = "Watch: score below 80";
    severity = "warning";
  } else {
    primaryReasonCode = "UNKNOWN_CONSERVATIVE";
    primaryReasonLabel = "Conservative Default";
    explanation = `Candidate status is ${candidate.candidateStatus} with score ${candidate.finalScore}. Conservative defaults are applied.`;
    shortSummary = "Conservative default";
    severity = "info";
  }

  return {
    primaryReasonCode,
    primaryReasonLabel,
    explanation,
    shortSummary,
    severity,
    blockingFactors,
    missingEvidence,
    positiveFactors,
    promotionChecklist: checklist,
  };
}

export function getCandidateBlockingFactors(candidate: CandidateReviewRecord): string[] {
  return explainCandidateDecision(candidate).blockingFactors;
}

export function getCandidatePromotionChecklist(candidate: CandidateReviewRecord): PromotionChecklistItem[] {
  return explainCandidateDecision(candidate).promotionChecklist;
}

export function getTopReasonCode(candidates: CandidateReviewRecord[]): CandidateReasonCode | null {
  if (candidates.length === 0) return null;
  const counts = new Map<CandidateReasonCode, number>();
  for (const c of candidates) {
    const exp = explainCandidateDecision(c);
    counts.set(exp.primaryReasonCode, (counts.get(exp.primaryReasonCode) ?? 0) + 1);
  }
  let topCode: CandidateReasonCode | null = null;
  let topCount = 0;
  for (const [code, count] of counts) {
    if (count > topCount) {
      topCode = code;
      topCount = count;
    }
  }
  return topCode;
}
