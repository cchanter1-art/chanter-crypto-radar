import {
  SUPPORTED_FUTURES_LEVERAGE,
  SUPPORTED_FUTURES_SYMBOLS,
  isFuturesTestScenario,
  type FuturesLeverage,
  type FuturesSymbol,
  type FuturesTestScenario,
} from "@/lib/futuresPaperEngine";
import type {
  FuturesStrategyBacktestRun,
} from "@/lib/futuresStrategyBacktest";
import type {
  ForwardTestData,
  ForwardTestDirection,
  ForwardTestRiskStatus,
} from "@/lib/forwardTestSession";
import type {
  FuturesStrategyConfidence,
  FuturesStrategyProfile,
} from "@/lib/futuresStrategyProfiles";

export type SignalQualityProfile = Exclude<FuturesStrategyProfile, "Manual">;
export type SignalQualityLabel =
  | "Poor"
  | "Weak"
  | "Watch"
  | "Strong"
  | "High Conviction Paper Candidate";
export type SignalQualityFactorEffect = "positive" | "negative" | "neutral";
export type SignalQualityDataFreshness = "fresh" | "stale" | "fallback" | "unknown";
export type SignalQualityBacktestStatus = "positive" | "weak" | "none";
export type SignalQualityForwardStatus = "consistent" | "mixed" | "weak" | "none";
export type SignalQualityEvidenceStatus = "backtest + forward" | "backtest" | "forward" | "none";

export type EvidenceCompleteness = "complete" | "partial" | "missing";

export interface EvidenceStackSnapshot {
  hasMarketIntegrity: boolean;
  integrityScore: number | null;
  integritySource: string | null;
  integrityFreshness: string | null;
  integrityReadiness: string | null;
  hasAutoObservations: boolean;
  autoObsCount: number;
  autoObsLatestSymbol: string | null;
  autoObsLatestScore: number | null;
  hasForwardTest: boolean;
  forwardObsCount: number;
  forwardLatestDirection: string | null;
  hasBacktest: boolean;
  backtestReturn: number | null;
  backtestWinRate: number | null;
  hasRiskGate: boolean;
  riskGateStatus: string | null;
  completeness: EvidenceCompleteness;
  positiveFactors: string[];
  negativeFactors: string[];
  missingFactors: string[];
}

export interface SignalQualityBacktestEvidence {
  status: SignalQualityBacktestStatus;
  runId: string | null;
  tradesTaken: number;
  winRate: number;
  netPnl: number;
  maxDrawdown: number;
  profitFactor: number | null;
}

export interface SignalQualityForwardEvidence {
  status: SignalQualityForwardStatus;
  observationCount: number;
  actionableCount: number;
  approvedCount: number;
  blockedCount: number;
  waitCount: number;
  directionConsistencyPercent: number;
}

export interface SignalQualityInput {
  profile: SignalQualityProfile;
  scenario: FuturesTestScenario;
  symbol: FuturesSymbol;
  leverage: FuturesLeverage;
  direction: ForwardTestDirection;
  confidence: FuturesStrategyConfidence;
  stopLossPercent: number;
  takeProfitPercent: number;
  riskStatus: ForwardTestRiskStatus;
  riskReason: string;
  riskRewardRatio: number;
  backtestEvidence: SignalQualityBacktestEvidence;
  forwardEvidence: SignalQualityForwardEvidence;
  dataFreshness: SignalQualityDataFreshness;
  localMockOnly: boolean;
}

export interface SignalQualityFactor {
  id: string;
  factor: string;
  effect: SignalQualityFactorEffect;
  pointsImpact: number;
  reason: string;
}

export interface SignalQualityEvaluation {
  score: number;
  label: SignalQualityLabel;
  factors: SignalQualityFactor[];
  topPositiveFactors: SignalQualityFactor[];
  topNegativeFactors: SignalQualityFactor[];
  riskNotes: string[];
  backtestEvidenceSummary: string;
  forwardEvidenceSummary: string;
  evidenceStatus: SignalQualityEvidenceStatus;
  interpretation: string;
}

export interface SignalQualityRecord extends SignalQualityEvaluation {
  id: string;
  createdAt: string;
  input: SignalQualityInput;
  // Optional evidence snapshot fields (v1 persistence)
  baseScore?: number;
  evidenceModifier?: number;
  finalScore?: number;
  evidenceCompleteness?: EvidenceCompleteness;
  evidencePositiveFactors?: string[];
  evidenceNegativeFactors?: string[];
  evidenceMissingFactors?: string[];
  evidenceCapsApplied?: string[];
  evidenceSnapshotAt?: string;
  evidenceSourceSummary?: string;
}

export const SIGNAL_QUALITY_LATEST_STORAGE_KEY = "chanter-signal-quality-latest";
export const SIGNAL_QUALITY_HISTORY_STORAGE_KEY = "chanter-signal-quality-history";
export const MAX_SIGNAL_QUALITY_HISTORY = 100;
export const SIGNAL_QUALITY_PROFILES: SignalQualityProfile[] = [
  "Trend Follow",
  "Breakout",
  "Mean Reversion",
];

const PROFILE_SET = new Set<SignalQualityProfile>(SIGNAL_QUALITY_PROFILES);
const DIRECTION_SET = new Set<ForwardTestDirection>(["LONG", "SHORT", "WAIT"]);
const CONFIDENCE_SET = new Set<FuturesStrategyConfidence>(["Low", "Medium", "High"]);
const RISK_STATUS_SET = new Set<ForwardTestRiskStatus>([
  "APPROVED",
  "BLOCKED",
  "WAIT",
  "REDUCED",
]);
const FRESHNESS_SET = new Set<SignalQualityDataFreshness>([
  "fresh",
  "stale",
  "fallback",
  "unknown",
]);
const BACKTEST_STATUS_SET = new Set<SignalQualityBacktestStatus>([
  "positive",
  "weak",
  "none",
]);
const FORWARD_STATUS_SET = new Set<SignalQualityForwardStatus>([
  "consistent",
  "mixed",
  "weak",
  "none",
]);
const STRONG_SCENARIOS_BY_PROFILE: Record<SignalQualityProfile, FuturesTestScenario[]> = {
  "Trend Follow": ["Trending Up", "Trending Down"],
  Breakout: ["Breakout Up", "Breakout Down"],
  "Mean Reversion": ["Mean Reversion Oversold", "Mean Reversion Overbought"],
};
const FRESH_DATA_WINDOW_MS = 5 * 60 * 1_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, decimals = 2): number {
  return Number(value.toFixed(decimals));
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableJsonValue(value[key])]),
    );
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableJsonValue(value));
}

function factor(
  id: string,
  name: string,
  pointsImpact: number,
  reason: string,
): SignalQualityFactor {
  return {
    id,
    factor: name,
    effect: pointsImpact > 0 ? "positive" : pointsImpact < 0 ? "negative" : "neutral",
    pointsImpact,
    reason,
  };
}

function getQualityLabel(score: number): SignalQualityLabel {
  if (score <= 24) return "Poor";
  if (score <= 49) return "Weak";
  if (score <= 69) return "Watch";
  if (score <= 84) return "Strong";
  return "High Conviction Paper Candidate";
}

function getEvidenceStatus(input: SignalQualityInput): SignalQualityEvidenceStatus {
  const hasBacktest = input.backtestEvidence.status !== "none";
  const hasForward = input.forwardEvidence.status !== "none";
  if (hasBacktest && hasForward) return "backtest + forward";
  if (hasBacktest) return "backtest";
  if (hasForward) return "forward";
  return "none";
}

function getBacktestSummary(evidence: SignalQualityBacktestEvidence): string {
  if (evidence.status === "none") return "No matching saved futures strategy backtest evidence.";
  const profitFactor = evidence.profitFactor === null ? "∞" : evidence.profitFactor.toFixed(2);
  return `${evidence.status === "positive" ? "Positive" : "Weak"} matching backtest: ${evidence.tradesTaken} trades, ${evidence.winRate.toFixed(2)}% win rate, $${evidence.netPnl.toFixed(2)} net P/L, ${evidence.maxDrawdown.toFixed(2)}% max drawdown, ${profitFactor} profit factor.`;
}

function getForwardSummary(evidence: SignalQualityForwardEvidence): string {
  if (evidence.status === "none") return "No matching browser-local forward-test observations.";
  return `${evidence.status.charAt(0).toUpperCase()}${evidence.status.slice(1)} forward evidence: ${evidence.observationCount} observations, ${evidence.approvedCount} approved, ${evidence.blockedCount} blocked, ${evidence.waitCount} WAIT, ${evidence.directionConsistencyPercent.toFixed(2)}% direction consistency.`;
}

function getInterpretation(score: number, label: SignalQualityLabel, input: SignalQualityInput): string {
  if (input.riskStatus === "BLOCKED") {
    return `Score ${score}/100 (${label}). The Risk Engine blocked this paper candidate; evidence cannot override that decision.`;
  }
  if (input.direction === "WAIT" || input.riskStatus === "WAIT") {
    return `Score ${score}/100 (${label}). The setup remains WAIT and is not an actionable paper candidate.`;
  }
  return `Score ${score}/100 (${label}). This is a transparent local paper-quality classification, not a prediction or trade recommendation.`;
}

function normalizeBacktestEvidence(value: unknown): SignalQualityBacktestEvidence | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.status !== "string" || !BACKTEST_STATUS_SET.has(value.status as SignalQualityBacktestStatus) ||
    !(value.runId === null || (typeof value.runId === "string" && value.runId.trim() !== "")) ||
    !isFiniteNumber(value.tradesTaken) || !Number.isInteger(value.tradesTaken) || value.tradesTaken < 0 ||
    !isFiniteNumber(value.winRate) || value.winRate < 0 || value.winRate > 100 ||
    !isFiniteNumber(value.netPnl) ||
    !isFiniteNumber(value.maxDrawdown) || value.maxDrawdown < 0 || value.maxDrawdown > 100 ||
    !(value.profitFactor === null || (isFiniteNumber(value.profitFactor) && value.profitFactor >= 0))
  ) {
    return null;
  }
  if (
    (value.status === "none" && (
      value.runId !== null || value.tradesTaken !== 0 || value.winRate !== 0 ||
      value.netPnl !== 0 || value.maxDrawdown !== 0 || value.profitFactor !== null
    )) ||
    (value.status !== "none" && value.runId === null)
  ) {
    return null;
  }
  return {
    status: value.status as SignalQualityBacktestStatus,
    runId: value.runId as string | null,
    tradesTaken: value.tradesTaken,
    winRate: value.winRate,
    netPnl: value.netPnl,
    maxDrawdown: value.maxDrawdown,
    profitFactor: value.profitFactor as number | null,
  };
}

function normalizeForwardEvidence(value: unknown): SignalQualityForwardEvidence | null {
  if (!isRecord(value)) return null;
  const countKeys = [
    "observationCount",
    "actionableCount",
    "approvedCount",
    "blockedCount",
    "waitCount",
  ] as const;
  if (
    typeof value.status !== "string" || !FORWARD_STATUS_SET.has(value.status as SignalQualityForwardStatus) ||
    countKeys.some((key) => !isFiniteNumber(value[key]) || !Number.isInteger(value[key]) || (value[key] as number) < 0) ||
    !isFiniteNumber(value.directionConsistencyPercent) ||
    value.directionConsistencyPercent < 0 || value.directionConsistencyPercent > 100
  ) {
    return null;
  }
  if (
    (value.actionableCount as number) > (value.observationCount as number) ||
    (value.approvedCount as number) > (value.observationCount as number) ||
    (value.blockedCount as number) > (value.observationCount as number) ||
    (value.waitCount as number) > (value.observationCount as number) ||
    (value.approvedCount as number) > (value.actionableCount as number) ||
    (value.blockedCount as number) > (value.actionableCount as number) ||
    (value.approvedCount as number) + (value.blockedCount as number) +
      (value.waitCount as number) > (value.observationCount as number) ||
    (value.status === "consistent" && (value.actionableCount as number) < 3) ||
    (value.status === "none" && value.observationCount !== 0)
  ) {
    return null;
  }
  return {
    status: value.status as SignalQualityForwardStatus,
    observationCount: value.observationCount as number,
    actionableCount: value.actionableCount as number,
    approvedCount: value.approvedCount as number,
    blockedCount: value.blockedCount as number,
    waitCount: value.waitCount as number,
    directionConsistencyPercent: value.directionConsistencyPercent,
  };
}

function normalizeInput(value: unknown): SignalQualityInput | null {
  if (!isRecord(value)) return null;
  const backtestEvidence = normalizeBacktestEvidence(value.backtestEvidence);
  const forwardEvidence = normalizeForwardEvidence(value.forwardEvidence);
  if (
    typeof value.profile !== "string" || !PROFILE_SET.has(value.profile as SignalQualityProfile) ||
    !isFuturesTestScenario(value.scenario) ||
    typeof value.symbol !== "string" || !SUPPORTED_FUTURES_SYMBOLS.includes(value.symbol as FuturesSymbol) ||
    !isFiniteNumber(value.leverage) || !SUPPORTED_FUTURES_LEVERAGE.includes(value.leverage as FuturesLeverage) ||
    typeof value.direction !== "string" || !DIRECTION_SET.has(value.direction as ForwardTestDirection) ||
    typeof value.confidence !== "string" || !CONFIDENCE_SET.has(value.confidence as FuturesStrategyConfidence) ||
    !isFiniteNumber(value.stopLossPercent) || value.stopLossPercent < 0 || value.stopLossPercent >= 100 ||
    !isFiniteNumber(value.takeProfitPercent) || value.takeProfitPercent < 0 ||
    typeof value.riskStatus !== "string" || !RISK_STATUS_SET.has(value.riskStatus as ForwardTestRiskStatus) ||
    typeof value.riskReason !== "string" || value.riskReason.trim() === "" ||
    !isFiniteNumber(value.riskRewardRatio) || value.riskRewardRatio < 0 ||
    !backtestEvidence || !forwardEvidence ||
    typeof value.dataFreshness !== "string" || !FRESHNESS_SET.has(value.dataFreshness as SignalQualityDataFreshness) ||
    typeof value.localMockOnly !== "boolean"
  ) {
    return null;
  }
  if (value.direction === "WAIT" && value.riskStatus !== "WAIT") return null;
  return {
    profile: value.profile as SignalQualityProfile,
    scenario: value.scenario,
    symbol: value.symbol as FuturesSymbol,
    leverage: value.leverage as FuturesLeverage,
    direction: value.direction as ForwardTestDirection,
    confidence: value.confidence as FuturesStrategyConfidence,
    stopLossPercent: value.stopLossPercent,
    takeProfitPercent: value.takeProfitPercent,
    riskStatus: value.riskStatus as ForwardTestRiskStatus,
    riskReason: value.riskReason,
    riskRewardRatio: value.riskRewardRatio,
    backtestEvidence,
    forwardEvidence,
    dataFreshness: value.dataFreshness as SignalQualityDataFreshness,
    localMockOnly: value.localMockOnly,
  };
}

export function getSignalQualityDataFreshness(
  priceStatus: "loading" | "live" | "fallback",
  lastPriceUpdate: string | null,
  evaluatedAt: string,
): SignalQualityDataFreshness {
  if (priceStatus === "fallback") return "fallback";
  if (priceStatus !== "live" || !lastPriceUpdate || !isValidDate(evaluatedAt) || !isValidDate(lastPriceUpdate)) {
    return "unknown";
  }
  return Date.parse(evaluatedAt) - Date.parse(lastPriceUpdate) <= FRESH_DATA_WINDOW_MS
    ? "fresh"
    : "stale";
}

export function getSignalQualityBacktestEvidence(
  history: FuturesStrategyBacktestRun[],
  profile: SignalQualityProfile,
  scenario: FuturesTestScenario,
  symbol: FuturesSymbol,
  leverage: FuturesLeverage,
): SignalQualityBacktestEvidence {
  const run = history.find((item) =>
    item.config.profile === profile &&
    item.config.scenario === scenario &&
    item.config.symbol === symbol &&
    item.config.leverage === leverage);
  if (!run) {
    return {
      status: "none",
      runId: null,
      tradesTaken: 0,
      winRate: 0,
      netPnl: 0,
      maxDrawdown: 0,
      profitFactor: null,
    };
  }
  const isPositive = run.metrics.tradesTaken >= 3 &&
    run.metrics.netPnl > 0 &&
    run.metrics.maxDrawdown < run.config.riskSettings.maxDrawdownWarningPercent &&
    (run.metrics.profitFactor === null || run.metrics.profitFactor > 1);
  return {
    status: isPositive ? "positive" : "weak",
    runId: run.id,
    tradesTaken: run.metrics.tradesTaken,
    winRate: run.metrics.winRate,
    netPnl: run.metrics.netPnl,
    maxDrawdown: run.metrics.maxDrawdown,
    profitFactor: run.metrics.profitFactor,
  };
}

export function getSignalQualityForwardEvidence(
  data: ForwardTestData,
  profile: SignalQualityProfile,
  scenario: FuturesTestScenario,
  symbol: FuturesSymbol,
  leverage: FuturesLeverage,
  direction: ForwardTestDirection,
): SignalQualityForwardEvidence {
  const observations = [
    ...(data.activeSession?.observations ?? []),
    ...data.completedSessions.flatMap((session) => session.observations),
  ].filter((observation) =>
    observation.profile === profile &&
    observation.scenario === scenario &&
    observation.symbol === symbol &&
    observation.leverage === leverage);
  if (observations.length === 0) {
    return {
      status: "none",
      observationCount: 0,
      actionableCount: 0,
      approvedCount: 0,
      blockedCount: 0,
      waitCount: 0,
      directionConsistencyPercent: 0,
    };
  }
  const actionable = observations.filter((observation) => observation.direction !== "WAIT");
  const directionMatches = direction === "WAIT"
    ? observations.filter((observation) => observation.direction === "WAIT").length
    : actionable.filter((observation) => observation.direction === direction).length;
  const consistencyBase = direction === "WAIT" ? observations.length : actionable.length;
  const directionConsistencyPercent = consistencyBase > 0
    ? directionMatches / consistencyBase * 100
    : 0;
  const approvedCount = observations.filter((observation) => observation.riskStatus === "APPROVED").length;
  const blockedCount = observations.filter((observation) => observation.riskStatus === "BLOCKED").length;
  const waitCount = observations.filter((observation) => observation.riskStatus === "WAIT").length;
  const approvalRate = actionable.length > 0 ? approvedCount / actionable.length * 100 : 0;
  const status: SignalQualityForwardStatus = actionable.length >= 3 &&
    approvalRate >= 60 &&
    directionConsistencyPercent >= 60
    ? "consistent"
    : actionable.length > 0 ? "mixed" : "weak";
  return {
    status,
    observationCount: observations.length,
    actionableCount: actionable.length,
    approvedCount,
    blockedCount,
    waitCount,
    directionConsistencyPercent: round(directionConsistencyPercent),
  };
}

export function buildEvidenceStack(opts: {
  integrity?: { integrityScore: number; source: string; freshnessStatus: string; readinessStatus: string } | null;
  autoObs?: { autoObservations: unknown[]; observationsCreated: number; lastSymbol: string | null; lastScore: number | null } | null;
  forwardTest?: { observations: unknown[]; latestDirection: string | null } | null;
  backtest?: { returnPercent: number; winRate: number } | null;
  riskGate?: { riskStatus: string } | null;
}): EvidenceStackSnapshot {
  const integrity = opts.integrity ?? null;
  const autoObs = opts.autoObs ?? null;
  const forwardTest = opts.forwardTest ?? null;
  const backtest = opts.backtest ?? null;
  const riskGate = opts.riskGate ?? null;

  const hasMarketIntegrity = integrity !== null;
  const hasAutoObservations = autoObs !== null && Array.isArray(autoObs.autoObservations) && autoObs.autoObservations.length > 0;
  const hasForwardTest = forwardTest !== null && Array.isArray(forwardTest.observations) && forwardTest.observations.length > 0;
  const hasBacktest = backtest !== null;
  const hasRiskGate = riskGate !== null;

  const positiveFactors: string[] = [];
  const negativeFactors: string[] = [];
  const missingFactors: string[] = [];

  if (hasMarketIntegrity && integrity) {
    if (integrity.integrityScore >= 70) {
      positiveFactors.push("Market data integrity score " + integrity.integrityScore + "/100 (good)");
    } else if (integrity.integrityScore < 50) {
      negativeFactors.push("Market data integrity score " + integrity.integrityScore + "/100 (low)");
    }
    if (integrity.freshnessStatus === "stale" || integrity.freshnessStatus === "delayed") {
      negativeFactors.push("Market data freshness: " + integrity.freshnessStatus);
    }
    if (integrity.readinessStatus === "blocked") {
      negativeFactors.push("Market data readiness: blocked");
    }
    if (integrity.source !== "LIVE_READ_ONLY") {
      negativeFactors.push("Data source is " + integrity.source.replace(/_/g, " ") + " (not live)");
    }
  } else {
    missingFactors.push("Market data integrity report");
  }

  if (hasAutoObservations && autoObs) {
    positiveFactors.push("Auto Intelligence observations: " + autoObs.autoObservations.length + " recorded");
  } else {
    missingFactors.push("Auto Intelligence observations");
  }

  if (hasForwardTest && forwardTest) {
    positiveFactors.push("Forward test observations: " + forwardTest.observations.length + " recorded");
  } else {
    missingFactors.push("Forward test observations");
  }

  if (hasBacktest && backtest) {
    if (backtest.returnPercent > 0) {
      positiveFactors.push("Backtest return: " + backtest.returnPercent.toFixed(2) + "%");
    } else {
      negativeFactors.push("Backtest return: " + backtest.returnPercent.toFixed(2) + "% (negative)");
    }
  } else {
    missingFactors.push("Futures strategy backtest");
  }

  if (hasRiskGate && riskGate) {
    positiveFactors.push("Risk gate status: " + riskGate.riskStatus);
  } else {
    missingFactors.push("Risk gate evaluation");
  }

  const presentCount = [hasMarketIntegrity, hasAutoObservations, hasForwardTest, hasBacktest, hasRiskGate].filter(Boolean).length;
  const completeness = presentCount >= 4 ? "complete" : presentCount >= 1 ? "partial" : "missing";

  return {
    hasMarketIntegrity,
    integrityScore: integrity ? integrity.integrityScore : null,
    integritySource: integrity ? integrity.source : null,
    integrityFreshness: integrity ? integrity.freshnessStatus : null,
    integrityReadiness: integrity ? integrity.readinessStatus : null,
    hasAutoObservations,
    autoObsCount: autoObs ? (Array.isArray(autoObs.autoObservations) ? autoObs.autoObservations.length : 0) : 0,
    autoObsLatestSymbol: autoObs ? autoObs.lastSymbol : null,
    autoObsLatestScore: autoObs ? autoObs.lastScore : null,
    hasForwardTest,
    forwardObsCount: forwardTest ? (Array.isArray(forwardTest.observations) ? forwardTest.observations.length : 0) : 0,
    forwardLatestDirection: forwardTest ? forwardTest.latestDirection : null,
    hasBacktest,
    backtestReturn: backtest ? backtest.returnPercent : null,
    backtestWinRate: backtest ? backtest.winRate : null,
    hasRiskGate,
    riskGateStatus: riskGate ? riskGate.riskStatus : null,
    completeness,
    positiveFactors,
    negativeFactors,
    missingFactors,
  };
}

export interface EvidenceAdjustedScore {
  baseScore: number;
  evidenceModifier: number;
  finalScore: number;
  label: SignalQualityLabel;
  capsApplied: string[];
  evidenceFactors: SignalQualityFactor[];
}

/**
 * Compute evidence modifier from an EvidenceStackSnapshot.
 * Returns modifier points and list of cap reasons.
 * Modifier is bounded: max +8, min -20.
 */
export function applyEvidenceModifier(
  evaluation: SignalQualityEvaluation,
  stack: EvidenceStackSnapshot,
): EvidenceAdjustedScore {
  const capsApplied: string[] = [];
  const evidenceFactors: SignalQualityFactor[] = [];
  let modifier = 0;

  // Market Data Integrity
  if (stack.hasMarketIntegrity && stack.integrityScore !== null) {
    const score = stack.integrityScore;
    const readiness = stack.integrityReadiness ?? "";
    const freshness = stack.integrityFreshness ?? "";
    if (score >= 90 && (readiness === "ready" || readiness === "clean")) {
      modifier += 4;
      evidenceFactors.push(factor("evidence-integrity", "Market integrity (high)", 4, `Integrity score ${score}/100 with ${readiness} readiness.`));
    } else if (score >= 70 && (readiness === "ready" || readiness === "ready_with_warnings")) {
      modifier += 2;
      evidenceFactors.push(factor("evidence-integrity", "Market integrity (good)", 2, `Integrity score ${score}/100 with ${readiness} readiness.`));
    } else if (score < 50 || readiness === "blocked") {
      modifier -= 12;
      evidenceFactors.push(factor("evidence-integrity", "Market integrity (blocked/low)", -12, `Integrity score ${score}/100 with ${readiness} readiness. Data quality is compromised.`));
      capsApplied.push("Market data integrity blocked/invalid: final score capped at 49");
    } else {
      // score 50-69 or warning/stale
      modifier -= 5;
      evidenceFactors.push(factor("evidence-integrity", "Market integrity (warning)", -5, `Integrity score ${score}/100, freshness: ${freshness}, readiness: ${readiness}.`));
      if (freshness === "stale" || freshness === "delayed") {
        capsApplied.push("Market data stale: final score capped at 69");
      }
    }
  }

  // Auto Intelligence Observations
  if (stack.hasAutoObservations) {
    modifier += 2;
    evidenceFactors.push(factor("evidence-auto", "Auto Intelligence observations", 2, `${stack.autoObsCount} auto observations recorded.`));
  } else {
    // missing = 0, no penalty
  }

  // Forward Test Evidence
  if (stack.hasForwardTest) {
    modifier += 2;
    evidenceFactors.push(factor("evidence-forward", "Forward-test evidence", 2, `${stack.forwardObsCount} forward-test observations.`));
  } else if (stack.forwardLatestDirection === "BLOCKED") {
    modifier -= 3;
    evidenceFactors.push(factor("evidence-forward", "Forward-test blocked", -3, "Forward-test observations show blocked state."));
  }

  // Backtest Evidence (conservative - mock data may overfit)
  if (stack.hasBacktest && stack.backtestReturn !== null) {
    if (stack.backtestReturn > 0) {
      modifier += 1;
      evidenceFactors.push(factor("evidence-backtest", "Backtest result (positive)", 1, `Backtest return: ${stack.backtestReturn.toFixed(2)}%. Capped at +1 to avoid overfitting bias.`));
    } else {
      modifier -= 3;
      evidenceFactors.push(factor("evidence-backtest", "Backtest result (negative)", -3, `Backtest return: ${stack.backtestReturn.toFixed(2)}%.`));
    }
  }

  // Risk Gate
  if (stack.hasRiskGate && stack.riskGateStatus) {
    if (stack.riskGateStatus === "APPROVED") {
      modifier += 1;
      evidenceFactors.push(factor("evidence-risk", "Risk gate approved", 1, "Risk gate status: APPROVED."));
    } else if (stack.riskGateStatus === "REDUCED") {
      capsApplied.push("Risk gate REDUCED: final score capped at 69");
    } else if (stack.riskGateStatus === "WAIT") {
      capsApplied.push("Risk gate WAIT: final score capped at 59");
    } else if (stack.riskGateStatus === "BLOCKED") {
      capsApplied.push("Risk gate BLOCKED: final score capped at 49");
    }
  }

  // Hard cap: evidence modifier max +8, min -20
  if (modifier > 8) {
    capsApplied.push(`Evidence modifier capped at +8 (was ${modifier})`);
    modifier = 8;
  }
  if (modifier < -20) {
    capsApplied.push(`Evidence modifier floored at -20 (was ${modifier})`);
    modifier = -20;
  }

  // Completeness cap
  if (stack.completeness === "missing") {
    capsApplied.push("Evidence stack missing: final score capped at 79");
  }

  let finalScore = evaluation.score + modifier;

  // Apply caps
  if (stack.completeness === "missing") finalScore = Math.min(finalScore, 79);
  if (stack.hasMarketIntegrity && stack.integrityScore !== null && stack.integrityScore < 50) {
    finalScore = Math.min(finalScore, 49);
  }
  if (stack.integrityReadiness === "blocked") {
    finalScore = Math.min(finalScore, 49);
  }
  if (stack.integrityFreshness === "stale" || stack.integrityFreshness === "delayed") {
    finalScore = Math.min(finalScore, 69);
  }
  if (stack.hasRiskGate && stack.riskGateStatus) {
    if (stack.riskGateStatus === "BLOCKED") finalScore = Math.min(finalScore, 49);
    if (stack.riskGateStatus === "WAIT") finalScore = Math.min(finalScore, 59);
    if (stack.riskGateStatus === "REDUCED") finalScore = Math.min(finalScore, 69);
  }

  finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));
  const label = getQualityLabel(finalScore);

  return {
    baseScore: evaluation.score,
    evidenceModifier: modifier,
    finalScore,
    label,
    capsApplied,
    evidenceFactors,
  };
}

export function evaluateSignalQuality(inputValue: SignalQualityInput): SignalQualityEvaluation {
  const input = normalizeInput(inputValue);
  if (!input) throw new Error("Signal quality input is invalid.");
  const factors: SignalQualityFactor[] = [
    factor("baseline", "Transparent baseline", 50, "Scoring starts from a neutral 50-point local baseline."),
  ];

  const confidencePoints = input.confidence === "High" ? 14 : input.confidence === "Medium" ? 9 : -4;
  factors.push(factor(
    "setup-confidence",
    "Setup confidence",
    confidencePoints,
    `${input.confidence} confidence comes from the existing deterministic strategy profile.`,
  ));

  const aligned = STRONG_SCENARIOS_BY_PROFILE[input.profile].includes(input.scenario);
  const alignmentPoints = aligned ? 12 : input.scenario === "Choppy / No Trade" ? -8 : 0;
  factors.push(factor(
    "strategy-scenario-alignment",
    "Strategy / scenario alignment",
    alignmentPoints,
    aligned
      ? `${input.profile} is aligned with the selected ${input.scenario} mock scenario.`
      : input.scenario === "Choppy / No Trade"
        ? "The choppy mock scenario reduces setup quality."
        : "No explicit profile/scenario alignment adjustment applies.",
  ));

  const riskPoints = input.riskStatus === "APPROVED"
    ? 18
    : input.riskStatus === "REDUCED" ? 8 : input.riskStatus === "WAIT" ? -15 : -30;
  factors.push(factor(
    "risk-status",
    "Risk status",
    riskPoints,
    `${input.riskStatus}: ${input.riskReason}`,
  ));

  const riskRewardPoints = input.riskRewardRatio >= 2
    ? 10
    : input.riskRewardRatio >= 1.5 ? 6 : input.riskRewardRatio >= 1 ? 2 : input.riskRewardRatio > 0 ? -8 : 0;
  factors.push(factor(
    "risk-reward",
    "Risk / reward",
    riskRewardPoints,
    input.riskRewardRatio > 0
      ? `${input.riskRewardRatio.toFixed(2)} estimated reward units per risk unit.`
      : "Risk/reward is unavailable for a non-actionable setup.",
  ));

  factors.push(factor(
    "stop-loss",
    "Stop-loss presence",
    input.stopLossPercent > 0 ? 8 : -30,
    input.stopLossPercent > 0
      ? `A ${input.stopLossPercent.toFixed(2)}% paper stop-loss is present.`
      : "No stop-loss is present; this severely reduces quality.",
  ));

  const hasStrongEvidence = input.backtestEvidence.status === "positive" &&
    input.forwardEvidence.status === "consistent";
  const leveragePoints = input.leverage === 1
    ? 4
    : input.leverage === 2 ? 2 : input.leverage === 3 ? -3 : hasStrongEvidence ? -5 : -12;
  factors.push(factor(
    "leverage",
    "Leverage penalty",
    leveragePoints,
    input.leverage === 5
      ? hasStrongEvidence
        ? "5x retains a penalty even with positive backtest and consistent forward evidence."
        : "5x applies the full high-risk quality penalty."
      : `${input.leverage}x applies the configured conservative leverage adjustment.`,
  ));

  const backtestPoints = input.backtestEvidence.status === "positive"
    ? 10
    : input.backtestEvidence.status === "weak" ? -3 : 0;
  factors.push(factor(
    "backtest-support",
    "Backtest support",
    backtestPoints,
    getBacktestSummary(input.backtestEvidence),
  ));

  const forwardPoints = input.forwardEvidence.status === "consistent"
    ? 10
    : input.forwardEvidence.status === "mixed" ? 2 : input.forwardEvidence.status === "weak" ? -4 : 0;
  factors.push(factor(
    "forward-consistency",
    "Forward-test consistency",
    forwardPoints,
    getForwardSummary(input.forwardEvidence),
  ));

  const drawdownPoints = input.backtestEvidence.status === "none"
    ? 0
    : input.backtestEvidence.maxDrawdown >= 20
      ? -15
      : input.backtestEvidence.maxDrawdown >= 10 ? -8 : input.backtestEvidence.maxDrawdown >= 5 ? -4 : 0;
  factors.push(factor(
    "drawdown",
    "Drawdown penalty",
    drawdownPoints,
    input.backtestEvidence.status === "none"
      ? "No matching drawdown evidence is available."
      : `${input.backtestEvidence.maxDrawdown.toFixed(2)}% matching backtest max drawdown.`,
  ));

  const actionabilityPoints = input.direction === "WAIT"
    ? -20
    : input.riskStatus === "BLOCKED" ? -20 : 0;
  factors.push(factor(
    "wait-blocked",
    "WAIT / BLOCKED constraint",
    actionabilityPoints,
    input.direction === "WAIT"
      ? "WAIT is non-actionable and receives a hard score cap."
      : input.riskStatus === "BLOCKED"
        ? "Risk-blocked candidates receive a hard score cap."
        : "No WAIT or BLOCKED actionability penalty applies.",
  ));

  const freshnessPoints = input.dataFreshness === "fresh"
    ? 4
    : input.dataFreshness === "stale" ? -6 : input.dataFreshness === "fallback" ? -8 : -4;
  factors.push(factor(
    "data-freshness",
    "Data freshness",
    freshnessPoints,
    input.dataFreshness === "fresh"
      ? "The supporting live price availability timestamp is within five minutes."
      : `Supporting price-data state is ${input.dataFreshness}; the strategy setup still uses mock candles.`,
  ));

  factors.push(factor(
    "local-mock-warning",
    "Local/mock data warning",
    input.localMockOnly ? -6 : 0,
    input.localMockOnly
      ? "Strategy candles and evidence are local/mock or browser-local and are not market-grade."
      : "No local/mock warning was provided.",
  ));

  let score = clamp(
    factors.reduce((sum, item) => sum + item.pointsImpact, 0),
    0,
    100,
  );
  if (input.direction === "WAIT" || input.riskStatus === "WAIT") score = Math.min(score, 45);
  if (input.riskStatus === "BLOCKED") score = Math.min(score, 35);
  if (input.stopLossPercent <= 0) score = Math.min(score, 50);
  score = Math.round(score);
  const label = getQualityLabel(score);
  const topPositiveFactors = factors
    .filter((item) => item.effect === "positive" && item.id !== "baseline")
    .sort((left, right) => right.pointsImpact - left.pointsImpact || left.factor.localeCompare(right.factor))
    .slice(0, 3);
  const topNegativeFactors = factors
    .filter((item) => item.effect === "negative")
    .sort((left, right) => left.pointsImpact - right.pointsImpact || left.factor.localeCompare(right.factor))
    .slice(0, 3);
  const riskNotes = [
    input.riskReason,
    input.localMockOnly
      ? "Score uses local/mock strategy data and browser-local paper evidence."
      : "Review the source of every evidence input.",
    input.riskStatus === "BLOCKED"
      ? "Risk Engine remains the final gate; this candidate is blocked."
      : "Risk Engine remains the final gate for any paper action.",
  ];

  return {
    score,
    label,
    factors,
    topPositiveFactors,
    topNegativeFactors,
    riskNotes,
    backtestEvidenceSummary: getBacktestSummary(input.backtestEvidence),
    forwardEvidenceSummary: getForwardSummary(input.forwardEvidence),
    evidenceStatus: getEvidenceStatus(input),
    interpretation: getInterpretation(score, label, input),
  };
}

export function createSignalQualityRecord(
  inputValue: SignalQualityInput,
  createdAt: string,
  evidenceSnapshot?: {
    adjusted: EvidenceAdjustedScore;
    stack: EvidenceStackSnapshot;
  },
): SignalQualityRecord | null {
  const input = normalizeInput(inputValue);
  if (!input || !isValidDate(createdAt)) return null;
  const evaluation = evaluateSignalQuality(input);
  const base: SignalQualityRecord = {
    id: `signal-quality-${hashText(`${createdAt}|${JSON.stringify(input)}`)}`,
    createdAt,
    input,
    ...evaluation,
  };
  if (evidenceSnapshot) {
    const { adjusted, stack } = evidenceSnapshot;
    base.baseScore = adjusted.baseScore;
    base.evidenceModifier = adjusted.evidenceModifier;
    base.finalScore = adjusted.finalScore;
    base.evidenceCompleteness = stack.completeness;
    base.evidencePositiveFactors = stack.positiveFactors;
    base.evidenceNegativeFactors = stack.negativeFactors;
    base.evidenceMissingFactors = stack.missingFactors;
    base.evidenceCapsApplied = adjusted.capsApplied;
    base.evidenceSnapshotAt = createdAt;
    base.evidenceSourceSummary = stack.hasMarketIntegrity ? `Integrity ${stack.integrityScore}/100, ${stack.autoObsCount} auto obs, ${stack.forwardObsCount} forward obs` : undefined;
  }
  return base;
}

export function normalizeSignalQualityRecord(value: unknown): SignalQualityRecord | null {
  if (!isRecord(value) || !isValidDate(value.createdAt)) return null;
  const input = normalizeInput(value.input);
  if (!input) return null;
  // Check if the value has evidence snapshot fields
  const hasEvidenceFields = value.baseScore !== undefined || value.finalScore !== undefined;
  let expected: SignalQualityRecord | null;
  if (hasEvidenceFields) {
    // New record with evidence snapshot - normalize the evidence fields
    const baseScore = typeof value.baseScore === "number" && Number.isFinite(value.baseScore) ? value.baseScore : undefined;
    const evidenceModifier = typeof value.evidenceModifier === "number" && Number.isFinite(value.evidenceModifier) ? value.evidenceModifier : undefined;
    const finalScore = typeof value.finalScore === "number" && Number.isFinite(value.finalScore) ? value.finalScore : undefined;
    const evidenceCompleteness = (value.evidenceCompleteness === "complete" || value.evidenceCompleteness === "partial" || value.evidenceCompleteness === "missing") ? value.evidenceCompleteness : undefined;
    const evidencePositiveFactors = Array.isArray(value.evidencePositiveFactors) ? value.evidencePositiveFactors.filter((f: unknown) => typeof f === "string") : undefined;
    const evidenceNegativeFactors = Array.isArray(value.evidenceNegativeFactors) ? value.evidenceNegativeFactors.filter((f: unknown) => typeof f === "string") : undefined;
    const evidenceMissingFactors = Array.isArray(value.evidenceMissingFactors) ? value.evidenceMissingFactors.filter((f: unknown) => typeof f === "string") : undefined;
    const evidenceCapsApplied = Array.isArray(value.evidenceCapsApplied) ? value.evidenceCapsApplied.filter((f: unknown) => typeof f === "string") : undefined;
    const evidenceSnapshotAt = typeof value.evidenceSnapshotAt === "string" && isValidDate(value.evidenceSnapshotAt) ? value.evidenceSnapshotAt : undefined;
    const evidenceSourceSummary = typeof value.evidenceSourceSummary === "string" ? value.evidenceSourceSummary : undefined;
    // Build expected record with evidence fields
    expected = createSignalQualityRecord(input, value.createdAt);
    if (expected) {
      if (baseScore !== undefined) expected.baseScore = baseScore;
      if (evidenceModifier !== undefined) expected.evidenceModifier = evidenceModifier;
      if (finalScore !== undefined) expected.finalScore = finalScore;
      if (evidenceCompleteness !== undefined) expected.evidenceCompleteness = evidenceCompleteness;
      if (evidencePositiveFactors !== undefined) expected.evidencePositiveFactors = evidencePositiveFactors;
      if (evidenceNegativeFactors !== undefined) expected.evidenceNegativeFactors = evidenceNegativeFactors;
      if (evidenceMissingFactors !== undefined) expected.evidenceMissingFactors = evidenceMissingFactors;
      if (evidenceCapsApplied !== undefined) expected.evidenceCapsApplied = evidenceCapsApplied;
      if (evidenceSnapshotAt !== undefined) expected.evidenceSnapshotAt = evidenceSnapshotAt;
      if (evidenceSourceSummary !== undefined) expected.evidenceSourceSummary = evidenceSourceSummary;
    }
  } else {
    // Old record without evidence fields
    expected = createSignalQualityRecord(input, value.createdAt);
  }
  if (!expected || stableStringify(value) !== stableStringify(expected)) return null;
  return expected;
}

export function loadSignalQualityHistory(): SignalQualityRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SIGNAL_QUALITY_HISTORY_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const seenIds = new Set<string>();
    return parsed
      .map(normalizeSignalQualityRecord)
      .filter((record): record is SignalQualityRecord => {
        if (!record || seenIds.has(record.id)) return false;
        seenIds.add(record.id);
        return true;
      })
      .slice(0, MAX_SIGNAL_QUALITY_HISTORY);
  } catch {
    return [];
  }
}

export function loadLatestSignalQualityScore(): SignalQualityRecord | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(SIGNAL_QUALITY_LATEST_STORAGE_KEY) ?? "null");
    return normalizeSignalQualityRecord(parsed) ?? loadSignalQualityHistory()[0] ?? null;
  } catch {
    return loadSignalQualityHistory()[0] ?? null;
  }
}

export function saveSignalQualityHistory(history: SignalQualityRecord[]): boolean {
  const normalized = history.map(normalizeSignalQualityRecord);
  if (normalized.some((record) => record === null)) return false;
  const records = normalized.filter((record): record is SignalQualityRecord => record !== null);
  if (new Set(records.map((record) => record.id)).size !== records.length) return false;
  const capped = records.slice(0, MAX_SIGNAL_QUALITY_HISTORY);
  try {
    localStorage.setItem(SIGNAL_QUALITY_HISTORY_STORAGE_KEY, JSON.stringify(capped));
    if (capped[0]) {
      localStorage.setItem(SIGNAL_QUALITY_LATEST_STORAGE_KEY, JSON.stringify(capped[0]));
    } else {
      localStorage.removeItem(SIGNAL_QUALITY_LATEST_STORAGE_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

export function clearSignalQualityHistory(): boolean {
  try {
    localStorage.removeItem(SIGNAL_QUALITY_HISTORY_STORAGE_KEY);
    localStorage.removeItem(SIGNAL_QUALITY_LATEST_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
