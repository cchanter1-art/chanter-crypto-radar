/**
 * Paper Action Plan Preview v1
 *
 * Generates a read-only paper-only action plan for the top candidate.
 * This is a preview/explanation layer only -- no trades, no orders,
 * no positions, no execution.
 *
 * Safety guarantees:
 * - No wallet connection
 * - No real orders
 * - No paper positions opened
 * - No buy/sell/execute buttons
 * - Does not modify risk gates
 */

import type { CandidateReviewRecord } from "@/lib/candidateReviewQueue";
import type { OpportunityRankingRecord } from "@/lib/opportunityRanking";
import type { PaperOutcomeSymbolSummary } from "@/lib/paperOutcomeTracker";

// === Types ===

export type PaperPlanAction = "WATCH" | "REVIEW" | "WAIT" | "IGNORE";

export interface PaperActionPlan {
  symbol: string;
  action: PaperPlanAction;
  referencePrice: number | null;
  setupType: string;
  invalidationReason: string;
  confirmationNeeded: string;
  riskNote: string;
  confidenceLabel: string;
  direction: string;
  finalScore: number;
  evidenceCompleteness: string;
  integrityScore: number;
  outcomeWinRate: number | null;
  outcomeTracked: number;
  generatedAt: string;
  source: "PAPER_PLAN_PREVIEW";
}

// === Helpers ===

function determineSetupType(
  candidate: CandidateReviewRecord,
): string {
  if (candidate.candidateStatus === "BLOCKED") return "Blocked by risk/data";
  if (candidate.candidateStatus === "STALE") return "Data-quality wait";
  if (candidate.direction === "WAIT") return "Directional wait -- no signal yet";
  if (candidate.finalScore >= 80 && candidate.evidenceCompleteness === "complete") return "Momentum watch -- strong evidence";
  if (candidate.finalScore >= 80) return "Momentum watch -- evidence building";
  if (candidate.finalScore >= 60) return "Moderate watch -- incomplete evidence";
  return "Weak setup -- below threshold";
}

function determineInvalidation(candidate: CandidateReviewRecord): string {
  if (candidate.candidateStatus === "BLOCKED") return `Blocked: ${candidate.riskReason}`;
  if (candidate.candidateStatus === "STALE") return "Data is stale -- integrity may be outdated";
  if (candidate.riskStatus === "BLOCKED") return `Risk gate blocked: ${candidate.riskReason}`;
  if (candidate.integrityScore < 50) return `Integrity too low (${candidate.integrityScore}/100)`;
  if (candidate.evidenceCompleteness === "missing") return "No evidence sources available";
  if (candidate.direction === "WAIT") return "No directional signal -- still in WAIT";
  if (candidate.finalScore < 50) return `Score too low (${candidate.finalScore}/100)`;
  return "None -- setup appears valid for paper review";
}

function determineConfirmationNeeded(
  candidate: CandidateReviewRecord,
  outcomeSummary: PaperOutcomeSymbolSummary | null,
): string {
  const parts: string[] = [];
  if (candidate.evidenceCompleteness !== "complete") parts.push("more evidence sources");
  if (candidate.integrityScore < 85) parts.push("higher data integrity");
  if (!outcomeSummary || outcomeSummary.total === 0) parts.push("forward outcome proof");
  if (outcomeSummary && outcomeSummary.measurable === 0) parts.push("matured outcome results");
  if (candidate.direction === "WAIT") parts.push("directional signal");
  if (parts.length === 0) return "Setup appears complete for paper review";
  return "Needed: " + parts.join(", ");
}

function determineRiskNote(candidate: CandidateReviewRecord): string {
  if (candidate.riskStatus === "BLOCKED") return "Risk gate BLOCKED -- do not advance";
  if (candidate.integrityScore < 70) return "Low data integrity -- treat with caution";
  if (candidate.evidenceCompleteness === "missing") return "No evidence -- high uncertainty";
  if (candidate.finalScore < 60) return "Below threshold -- weak setup";
  return "Risk gate clear for paper review -- no execution";
}

// === Core functions ===

export function buildPaperActionPlan(
  candidate: CandidateReviewRecord,
  ranking: OpportunityRankingRecord | undefined,
  referencePrice: number | null,
  outcomeSummary: PaperOutcomeSymbolSummary | null,
): PaperActionPlan {
  let action: PaperPlanAction;
  if (candidate.candidateStatus === "BLOCKED" || candidate.riskStatus === "BLOCKED") action = "IGNORE";
  else if (candidate.candidateStatus === "STALE") action = "WAIT";
  else if (ranking?.action === "REVIEW") action = "REVIEW";
  else if (ranking?.action === "WATCH") action = "WATCH";
  else if (candidate.finalScore >= 80) action = "REVIEW";
  else if (candidate.finalScore >= 60) action = "WATCH";
  else if (candidate.finalScore < 50) action = "IGNORE";
  else action = "WAIT";

  const confidenceLabel =
    action === "REVIEW" ? (candidate.finalScore >= 85 ? "HIGH" : "MEDIUM") :
    action === "WATCH" ? "MEDIUM" :
    "LOW";

  return {
    symbol: candidate.symbol,
    action,
    referencePrice,
    setupType: determineSetupType(candidate),
    invalidationReason: determineInvalidation(candidate),
    confirmationNeeded: determineConfirmationNeeded(candidate, outcomeSummary),
    riskNote: determineRiskNote(candidate),
    confidenceLabel,
    direction: candidate.direction,
    finalScore: candidate.finalScore,
    evidenceCompleteness: candidate.evidenceCompleteness,
    integrityScore: candidate.integrityScore,
    outcomeWinRate: outcomeSummary && outcomeSummary.measurable > 0 ? outcomeSummary.measurableWinRate : null,
    outcomeTracked: outcomeSummary ? outcomeSummary.total : 0,
    generatedAt: new Date().toISOString(),
    source: "PAPER_PLAN_PREVIEW",
  };
}

export function getTopPaperActionPlan(
  candidates: CandidateReviewRecord[],
  rankings: OpportunityRankingRecord[],
  priceBySymbol: Map<string, number | null>,
  outcomeSummaries: PaperOutcomeSymbolSummary[],
): PaperActionPlan | null {
  const active = candidates.filter((c) => c.candidateStatus !== "DISMISSED");
  if (active.length === 0) return null;

  const rankingMap = new Map<string, OpportunityRankingRecord>();
  for (const r of rankings) rankingMap.set(r.symbol, r);

  const summaryMap = new Map<string, PaperOutcomeSymbolSummary>();
  for (const s of outcomeSummaries) summaryMap.set(s.symbol, s);

  const actionPriority: Record<PaperPlanAction, number> = {
    REVIEW: 4, WATCH: 3, WAIT: 2, IGNORE: 1,
  };

  const plans = active
    .map((c) => {
      const ranking = rankingMap.get(c.symbol);
      const price = priceBySymbol.get(c.symbol) ?? null;
      const summary = summaryMap.get(c.symbol) ?? null;
      return buildPaperActionPlan(c, ranking, price, summary);
    })
    .sort((a, b) => {
      const pa = actionPriority[a.action];
      const pb = actionPriority[b.action];
      if (pa !== pb) return pb - pa;
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      return a.symbol.localeCompare(b.symbol);
    });

  return plans[0] ?? null;
}

export function explainPaperActionPlan(plan: PaperActionPlan): string {
  const parts: string[] = [];
  parts.push(`${plan.symbol}: ${plan.action}`);
  parts.push(plan.setupType);
  if (plan.referencePrice !== null) parts.push(`reference ~${plan.referencePrice.toFixed(2)}`);
  parts.push(plan.confirmationNeeded);
  if (plan.outcomeTracked > 0) {
    parts.push(plan.outcomeWinRate !== null ? `${plan.outcomeWinRate.toFixed(0)}% favorable rate` : `${plan.outcomeTracked} tracked`);
  }
  parts.push(`(${plan.confidenceLabel} confidence)`);
  return parts.join(" | ");
}
