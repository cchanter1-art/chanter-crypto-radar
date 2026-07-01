/**
 * Decision Dashboard v1
 *
 * Human-readable decision summary engine that combines all existing
 * intelligence layers into a single clear answer:
 *   - What to watch now
 *   - Why it matters
 *   - What evidence supports it
 *   - What proof exists
 *   - What data is missing
 *
 * Safety guarantees:
 * - No trades, no orders, no positions, no execution
 * - No wallet/Web3/API keys
 * - Does not modify risk gates
 * - Review-only output: WATCH / REVIEW / WAIT / IGNORE
 */

import type { CandidateReviewRecord } from "@/lib/candidateReviewQueue";
import type { OpportunityRankingRecord } from "@/lib/opportunityRanking";
import type { SignalQualityRecord } from "@/lib/signalQualityScore";
import type { MarketDataIntegrityReport } from "@/lib/marketDataIntegrity";
import type { PaperOutcomeSummary, PaperOutcomeSymbolSummary } from "@/lib/paperOutcomeTracker";
import type { AutoIntelligenceCycleState } from "@/lib/autoIntelligenceCycle";
import { loadCandidateReviewQueue } from "@/lib/candidateReviewQueue";
import { buildOpportunityRankings } from "@/lib/opportunityRanking";
import { loadSignalQualityHistory } from "@/lib/signalQualityScore";
import { loadMarketDataIntegrityHistory } from "@/lib/marketDataIntegrity";
import {
  loadPaperOutcomeHistory,
  buildPaperOutcomeSummary,
  buildPaperOutcomeSymbolSummary,
} from "@/lib/paperOutcomeTracker";

// === Types ===

export type DecisionAction = "REVIEW" | "WATCH" | "WAIT" | "IGNORE";
export type DecisionConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface DecisionRecord {
  symbol: string;
  action: DecisionAction;
  priorityScore: number;
  finalScore: number;
  confidenceLabel: DecisionConfidence;
  reasonTitle: string;
  reasonSummary: string;
  evidenceBullets: string[];
  riskBullets: string[];
  proofBullets: string[];
  missingDataBullets: string[];
  updatedAt: string;
}

export interface DecisionDashboardSnapshot {
  primary: DecisionRecord | null;
  topDecisions: DecisionRecord[];
  totalCandidates: number;
  hasData: boolean;
  generatedAt: string;
}

export interface DecisionDashboardInput {
  candidates: CandidateReviewRecord[];
  rankings: OpportunityRankingRecord[];
  latestSignalQuality: SignalQualityRecord | null;
  latestIntegrity: MarketDataIntegrityReport | null;
  outcomeSummary: PaperOutcomeSummary | null;
  outcomeSymbolSummaries: PaperOutcomeSymbolSummary[];
  cycleState: AutoIntelligenceCycleState | null;
}

// === Decision logic ===

function mapDecisionAction(
  candidate: CandidateReviewRecord,
  ranking: OpportunityRankingRecord | undefined,
): DecisionAction {
  const status = candidate.candidateStatus;
  const action = ranking?.action;

  if (status === "BLOCKED" || action === "BLOCKED") return "IGNORE";
  if (status === "DISMISSED") return "IGNORE";
  if (status === "STALE") return "WAIT";
  if (action === "WAIT") return "WAIT";
  if (status === "REVIEW" && action === "REVIEW") return "REVIEW";
  if (status === "WATCH" && action === "WATCH") return "WATCH";
  if (candidate.finalScore < 50) return "IGNORE";
  if (candidate.finalScore >= 80 && candidate.evidenceCompleteness !== "missing") return "REVIEW";
  if (candidate.finalScore >= 60) return "WATCH";
  return "WAIT";
}

function computePriorityScore(
  candidate: CandidateReviewRecord,
  action: DecisionAction,
  ranking: OpportunityRankingRecord | undefined,
): number {
  const actionBase: Record<DecisionAction, number> = {
    REVIEW: 400,
    WATCH: 300,
    WAIT: 200,
    IGNORE: 100,
  };
  let score = actionBase[action];
  score += candidate.finalScore;
  if (ranking) score += Math.min(ranking.rankScore * 0.1, 50);
  if (candidate.evidenceCompleteness === "complete") score += 20;
  else if (candidate.evidenceCompleteness === "partial") score += 10;
  if (candidate.integrityScore >= 90) score += 10;
  else if (candidate.integrityScore >= 70) score += 5;
  if (candidate.riskStatus !== "BLOCKED") score += 5;
  return Math.round(score);
}

function computeConfidence(
  candidate: CandidateReviewRecord,
  action: DecisionAction,
  latestIntegrity: MarketDataIntegrityReport | null,
): DecisionConfidence {
  if (action === "IGNORE" || action === "WAIT") return "LOW";

  let confidencePoints = 0;
  if (candidate.finalScore >= 80) confidencePoints += 3;
  else if (candidate.finalScore >= 70) confidencePoints += 2;
  else confidencePoints += 1;

  if (candidate.evidenceCompleteness === "complete") confidencePoints += 3;
  else if (candidate.evidenceCompleteness === "partial") confidencePoints += 1;

  if (latestIntegrity && latestIntegrity.integrityScore >= 85) confidencePoints += 2;
  else if (latestIntegrity && latestIntegrity.integrityScore >= 70) confidencePoints += 1;

  if (candidate.integrityScore >= 85) confidencePoints += 1;

  if (confidencePoints >= 7) return "HIGH";
  if (confidencePoints >= 4) return "MEDIUM";
  return "LOW";
}

function buildReasonTitle(action: DecisionAction, symbol: string): string {
  if (action === "REVIEW") return `${symbol}: Review candidate ready`;
  if (action === "WATCH") return `${symbol}: Worth watching`;
  if (action === "WAIT") return `${symbol}: Waiting for better conditions`;
  return `${symbol}: Ignore for now`;
}

function buildReasonSummary(candidate: CandidateReviewRecord, action: DecisionAction): string {
  const parts: string[] = [];
  parts.push(`Score ${candidate.finalScore}/100`);
  parts.push(candidate.evidenceCompleteness + " evidence");
  parts.push(`integrity ${candidate.integrityScore}/100`);
  if (candidate.riskStatus === "BLOCKED") parts.push("risk BLOCKED");
  if (candidate.candidateStatus === "STALE") parts.push("stale data");
  if (candidate.direction === "WAIT") parts.push("no directional signal");

  if (action === "REVIEW") return `Strong candidate: ${parts.join(", ")}.`;
  if (action === "WATCH") return `Moderate candidate: ${parts.join(", ")}.`;
  if (action === "WAIT") return `Not ready: ${parts.join(", ")}.`;
  return `Insufficient: ${parts.join(", ")}.`;
}

function buildEvidenceBullets(
  candidate: CandidateReviewRecord,
  ranking: OpportunityRankingRecord | undefined,
): string[] {
  const bullets: string[] = [];
  if (ranking) {
    bullets.push(`Ranked #${ranking.rankScore > 500 ? 1 : ranking.rankScore > 400 ? 2 : 3} by opportunity score (${ranking.rankScore})`);
  }
  bullets.push(`Final score: ${candidate.finalScore}/100 (base ${candidate.baseScore} + modifier ${candidate.evidenceModifier})`);
  if (candidate.evidenceCompleteness === "complete") {
    bullets.push("Evidence complete: all 5 sources available");
  } else if (candidate.evidenceCompleteness === "partial") {
    bullets.push("Evidence partial: some sources available");
  } else {
    bullets.push("Evidence missing: no supporting sources");
  }
  for (const f of candidate.evidencePositiveFactors.slice(0, 3)) {
    bullets.push(`+ ${f}`);
  }
  return bullets;
}

function buildRiskBullets(candidate: CandidateReviewRecord): string[] {
  const bullets: string[] = [];
  if (candidate.riskStatus === "BLOCKED") {
    bullets.push(`Risk BLOCKED: ${candidate.riskReason}`);
  }
  if (candidate.candidateStatus === "STALE") {
    bullets.push("Data is stale -- integrity may be outdated");
  }
  if (candidate.integrityScore < 70) {
    bullets.push(`Low integrity score: ${candidate.integrityScore}/100`);
  }
  for (const f of candidate.evidenceNegativeFactors.slice(0, 2)) {
    bullets.push(`- ${f}`);
  }
  if (candidate.direction === "WAIT") {
    bullets.push("No directional signal (WAIT)");
  }
  return bullets;
}

function buildProofBullets(
  candidate: CandidateReviewRecord,
  outcomeSummary: PaperOutcomeSummary | null,
  outcomeSymbolSummaries: PaperOutcomeSymbolSummary[],
): string[] {
  const bullets: string[] = [];
  const symSummary = outcomeSymbolSummaries.find((s) => s.symbol === candidate.symbol);
  if (symSummary) {
    bullets.push(`${symSummary.total} tracked outcome(s) for ${candidate.symbol}`);
    if (symSummary.measurable > 0) {
      bullets.push(`Win rate: ${symSummary.measurableWinRate.toFixed(1)}% (${symSummary.wins}W / ${symSummary.losses}L / ${symSummary.flat}F)`);
    }
    if (symSummary.averageMovePct !== null) {
      bullets.push(`Average move: ${symSummary.averageMovePct.toFixed(2)}%`);
    }
    if (symSummary.pending > 0) {
      bullets.push(`${symSummary.pending} pending outcome(s) awaiting horizon`);
    }
  } else {
    bullets.push("No tracked outcomes yet for this symbol");
  }
  if (outcomeSummary && outcomeSummary.total > 0) {
    bullets.push(`Across all symbols: ${outcomeSummary.wins}W / ${outcomeSummary.losses}L / ${outcomeSummary.flat}F measurable`);
  }
  return bullets;
}

function buildMissingDataBullets(
  candidate: CandidateReviewRecord,
  latestIntegrity: MarketDataIntegrityReport | null,
  outcomeSymbolSummaries: PaperOutcomeSymbolSummary[],
): string[] {
  const bullets: string[] = [];
  const symSummary = outcomeSymbolSummaries.find((s) => s.symbol === candidate.symbol);
  if (!symSummary || symSummary.total === 0) {
    bullets.push("No forward outcome proof yet");
  }
  if (candidate.evidenceCompleteness === "missing") {
    bullets.push("No evidence sources available");
  } else if (candidate.evidenceCompleteness === "partial") {
    bullets.push("Some evidence sources missing");
  }
  if (!latestIntegrity) {
    bullets.push("No market data integrity report");
  } else if (latestIntegrity.freshnessStatus === "stale") {
    bullets.push("Market data is stale");
  }
  if (candidate.evidenceMissingFactors.length > 0) {
    bullets.push(`Missing: ${candidate.evidenceMissingFactors.slice(0, 3).join(", ")}`);
  }
  return bullets;
}

// === Core functions ===

export function buildDecisionDashboardSnapshot(
  input: DecisionDashboardInput,
): DecisionDashboardSnapshot {
  const {
    candidates,
    rankings,
    latestIntegrity,
    outcomeSummary,
    outcomeSymbolSummaries,
  } = input;

  const now = new Date().toISOString();

  if (!candidates || candidates.length === 0) {
    return {
      primary: null,
      topDecisions: [],
      totalCandidates: 0,
      hasData: false,
      generatedAt: now,
    };
  }

  // Build ranking map
  const rankingMap = new Map<string, OpportunityRankingRecord>();
  for (const r of rankings) {
    rankingMap.set(r.symbol, r);
  }

  // Build decisions
  const decisions: DecisionRecord[] = candidates
    .filter((c) => c.candidateStatus !== "DISMISSED")
    .map((candidate) => {
      const ranking = rankingMap.get(candidate.symbol);
      const action = mapDecisionAction(candidate, ranking);
      const priorityScore = computePriorityScore(candidate, action, ranking);
      const confidence = computeConfidence(candidate, action, latestIntegrity);

      return {
        symbol: candidate.symbol,
        action,
        priorityScore,
        finalScore: candidate.finalScore,
        confidenceLabel: confidence,
        reasonTitle: buildReasonTitle(action, candidate.symbol),
        reasonSummary: buildReasonSummary(candidate, action),
        evidenceBullets: buildEvidenceBullets(candidate, ranking),
        riskBullets: buildRiskBullets(candidate),
        proofBullets: buildProofBullets(candidate, outcomeSummary, outcomeSymbolSummaries),
        missingDataBullets: buildMissingDataBullets(candidate, latestIntegrity, outcomeSymbolSummaries),
        updatedAt: candidate.updatedAt,
      };
    })
    .sort((a, b) => {
      // Primary: action priority
      const actionPriority: Record<DecisionAction, number> = {
        REVIEW: 4, WATCH: 3, WAIT: 2, IGNORE: 1,
      };
      const ap = actionPriority[a.action] - actionPriority[b.action];
      if (ap !== 0) return -ap;
      // Secondary: priorityScore desc
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
      // Tertiary: finalScore desc
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      // Quaternary: symbol asc
      return a.symbol.localeCompare(b.symbol);
    })
    .slice(0, 10);

  return {
    primary: decisions[0] ?? null,
    topDecisions: decisions.slice(0, 5),
    totalCandidates: candidates.length,
    hasData: true,
    generatedAt: now,
  };
}

export function getPrimaryDecision(
  snapshot: DecisionDashboardSnapshot,
): DecisionRecord | null {
  return snapshot.primary;
}

export function getDecisionActionLabel(action: DecisionAction): string {
  if (action === "REVIEW") return "Review candidate ready";
  if (action === "WATCH") return "Worth watching";
  if (action === "WAIT") return "Waiting for conditions";
  return "Ignore for now";
}

export function getDecisionConfidenceLabel(confidence: DecisionConfidence): string {
  if (confidence === "HIGH") return "High confidence";
  if (confidence === "MEDIUM") return "Medium confidence";
  return "Low confidence";
}

export function getDecisionProofSummary(decision: DecisionRecord): string {
  if (decision.proofBullets.length === 0) return "No proof available yet.";
  const first = decision.proofBullets[0];
  return first;
}

// === Runtime loader ===

export function loadDecisionDashboardInputs(): DecisionDashboardInput {
  const candidates = loadCandidateReviewQueue().filter(
    (c) => c.candidateStatus !== "DISMISSED",
  );
  const rankings = buildOpportunityRankings(candidates);
  const sqHistory = loadSignalQualityHistory();
  const latestSignalQuality = sqHistory.length > 0 ? sqHistory[0] : null;
  const integrityHistory = loadMarketDataIntegrityHistory();
  const latestIntegrity = integrityHistory.length > 0 ? integrityHistory[0] : null;
  const outcomes = loadPaperOutcomeHistory();
  const outcomeSummary = outcomes.length > 0 ? buildPaperOutcomeSummary(outcomes) : null;
  const outcomeSymbolSummaries = buildPaperOutcomeSymbolSummary(outcomes);

  return {
    candidates,
    rankings,
    latestSignalQuality,
    latestIntegrity,
    outcomeSummary,
    outcomeSymbolSummaries,
    cycleState: null,
  };
}
