/**
 * Opportunity Ranking v1
 *
 * Pure functions that rank candidate review records into a clear
 * opportunity list. Review-only. No trades. No execution.
 *
 * Safety guarantees:
 * - No wallet/Web3
 * - No API keys
 * - No order/execution fields
 * - No mutation of candidate records
 * - Deterministic ordering
 */

import {
  explainCandidateDecision,
  type CandidateReviewRecord,
  type CandidateExplanation,
  type PromotionChecklistItem,
} from "@/lib/candidateReviewQueue";

// === Types ===

export type OpportunityAction = "REVIEW" | "WATCH" | "WAIT" | "BLOCKED";

export interface OpportunityRankingRecord {
  id: string;
  symbol: string;
  timeframe: string;
  direction: string;
  action: OpportunityAction;
  rankScore: number;
  finalScore: number;
  baseScore: number;
  evidenceModifier: number;
  candidateStatus: string;
  reasonCode: string;
  reasonSummary: string;
  riskStatus: string;
  integrityScore: number;
  integrityReadiness: string;
  evidenceCompleteness: string;
  positiveFactors: string[];
  negativeFactors: string[];
  missingFactors: string[];
  promotionChecklist: PromotionChecklistItem[];
  createdAt: string;
  updatedAt: string;
  sourceCandidateId: string;
}

export interface RankingOptions {
  maxResults?: number;
}

// === Action mapping ===

function mapAction(candidate: CandidateReviewRecord, explanation: CandidateExplanation): OpportunityAction {
  if (candidate.candidateStatus === "BLOCKED") return "BLOCKED";
  if (candidate.candidateStatus === "STALE") return "WAIT";
  if (explanation.primaryReasonCode === "RISK_BLOCKED") return "BLOCKED";
  if (explanation.primaryReasonCode === "LOW_FINAL_SCORE") return "BLOCKED";
  if (explanation.primaryReasonCode === "INTEGRITY_BLOCKED") return "BLOCKED";
  if (explanation.primaryReasonCode === "INTEGRITY_STALE") return "WAIT";
  if (explanation.primaryReasonCode === "EVIDENCE_MISSING") return "WAIT";
  if (candidate.candidateStatus === "REVIEW") return "REVIEW";
  if (candidate.candidateStatus === "WATCH") return "WATCH";
  if (candidate.direction === "WAIT") return "WAIT";
  return "WAIT";
}

// === Rank score computation ===

const ACTION_BASE_SCORE: Record<OpportunityAction, number> = {
  REVIEW: 400,
  WATCH: 300,
  WAIT: 200,
  BLOCKED: 100,
};

const COMPLETENESS_BONUS: Record<string, number> = {
  complete: 30,
  partial: 15,
  missing: 0,
};

const READINESS_BONUS: Record<string, number> = {
  ready: 20,
  clean: 25,
  ready_with_warnings: 10,
  not_ready: 0,
  blocked: 0,
};

function computeRankScore(
  candidate: CandidateReviewRecord,
  action: OpportunityAction,
  explanation: CandidateExplanation,
): number {
  let score = ACTION_BASE_SCORE[action];

  // Final score contribution (0-100)
  score += candidate.finalScore;

  // Evidence completeness bonus
  score += COMPLETENESS_BONUS[candidate.evidenceCompleteness] ?? 0;

  // Integrity readiness bonus
  score += READINESS_BONUS[candidate.integrityReadiness] ?? 0;

  // Positive factors (+3 each, capped at +15)
  score += Math.min(explanation.positiveFactors.length * 3, 15);

  // Missing evidence penalty (-5 each, capped at -25)
  score -= Math.min(explanation.missingEvidence.length * 5, 25);

  // Negative factors penalty (-4 each, capped at -20)
  score -= Math.min(explanation.blockingFactors.length * 4, 20);

  // Integrity score bonus (0-10)
  if (candidate.integrityScore >= 90) score += 10;
  else if (candidate.integrityScore >= 70) score += 5;

  // Risk not blocked bonus
  if (candidate.riskStatus !== "BLOCKED") score += 5;

  return Math.round(score);
}

// === Core functions ===

export function buildOpportunityRankings(
  candidates: CandidateReviewRecord[],
  options?: RankingOptions,
): OpportunityRankingRecord[] {
  const max = options?.maxResults ?? 50;
  const rankings = candidates
    .filter((c) => c.candidateStatus !== "DISMISSED")
    .map((c) => {
      const exp = explainCandidateDecision(c);
      const action = mapAction(c, exp);
      const rankScore = computeRankScore(c, action, exp);
      return normalizeOpportunityRankingRecord(c, action, rankScore, exp);
    })
    .sort(sortOpportunityRankingsComparator)
    .slice(0, max);
  return rankings;
}

function sortOpportunityRankingsComparator(
  a: OpportunityRankingRecord,
  b: OpportunityRankingRecord,
): number {
  // Primary: action priority (REVIEW > WATCH > WAIT > BLOCKED)
  const aPriority = ACTION_BASE_SCORE[a.action];
  const bPriority = ACTION_BASE_SCORE[b.action];
  if (aPriority !== bPriority) return bPriority - aPriority;

  // Secondary: rankScore descending
  if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;

  // Tertiary: finalScore descending
  if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;

  // Quaternary: symbol ascending (deterministic tiebreak)
  return a.symbol.localeCompare(b.symbol);
}

export function sortOpportunityRankings(
  rankings: OpportunityRankingRecord[],
): OpportunityRankingRecord[] {
  return [...rankings].sort(sortOpportunityRankingsComparator);
}

export function getTopOpportunity(
  rankings: OpportunityRankingRecord[],
): OpportunityRankingRecord | null {
  if (rankings.length === 0) return null;
  return sortOpportunityRankings(rankings)[0] ?? null;
}

export function explainOpportunityRank(
  opportunity: OpportunityRankingRecord,
): string {
  const parts: string[] = [];

  parts.push(`Action: ${opportunity.action}`);
  parts.push(`Rank score: ${opportunity.rankScore}`);
  parts.push(`Final score: ${opportunity.finalScore}`);

  if (opportunity.reasonSummary) {
    parts.push(`Reason: ${opportunity.reasonSummary}`);
  }

  if (opportunity.riskStatus === "BLOCKED") {
    parts.push("Risk: BLOCKED");
  }

  if (opportunity.integrityScore < 70) {
    parts.push(`Integrity: ${opportunity.integrityScore}/100 (low)`);
  } else {
    parts.push(`Integrity: ${opportunity.integrityScore}/100`);
  }

  if (opportunity.evidenceCompleteness === "missing") {
    parts.push("Evidence: missing");
  } else if (opportunity.evidenceCompleteness === "partial") {
    parts.push("Evidence: partial");
  } else {
    parts.push("Evidence: complete");
  }

  if (opportunity.positiveFactors.length > 0) {
    parts.push(`Positive: ${opportunity.positiveFactors.length} factors`);
  }

  if (opportunity.missingFactors.length > 0) {
    parts.push(`Missing: ${opportunity.missingFactors.length} factors`);
  }

  return parts.join(" | ");
}

export function normalizeOpportunityRankingRecord(
  candidate: CandidateReviewRecord,
  action: OpportunityAction,
  rankScore: number,
  explanation: CandidateExplanation,
): OpportunityRankingRecord {
  return {
    id: `opportunity-${candidate.id}`,
    symbol: candidate.symbol,
    timeframe: candidate.timeframe,
    direction: candidate.direction,
    action,
    rankScore,
    finalScore: candidate.finalScore,
    baseScore: candidate.baseScore,
    evidenceModifier: candidate.evidenceModifier,
    candidateStatus: candidate.candidateStatus,
    reasonCode: explanation.primaryReasonCode,
    reasonSummary: explanation.shortSummary,
    riskStatus: candidate.riskStatus,
    integrityScore: candidate.integrityScore,
    integrityReadiness: candidate.integrityReadiness,
    evidenceCompleteness: candidate.evidenceCompleteness,
    positiveFactors: explanation.positiveFactors,
    negativeFactors: explanation.blockingFactors,
    missingFactors: explanation.missingEvidence,
    promotionChecklist: explanation.promotionChecklist,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    sourceCandidateId: candidate.id,
  };
}

export function filterRankingsByAction(
  rankings: OpportunityRankingRecord[],
  action: OpportunityAction,
): OpportunityRankingRecord[] {
  return rankings.filter((r) => r.action === action);
}
