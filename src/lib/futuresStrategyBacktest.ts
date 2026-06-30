import {
  DEFAULT_FUTURES_PAPER_SETTINGS,
  SUPPORTED_FUTURES_LEVERAGE,
  SUPPORTED_FUTURES_SYMBOLS,
  evaluateFuturesPaperRisk,
  getMock15mCandles,
  isFuturesTestScenario,
  recordFuturesDailyLoss,
  type FuturesDirection,
  type FuturesLeverage,
  type FuturesMockCandle,
  type FuturesPaperSettings,
  type FuturesPaperTradeInput,
  type FuturesSymbol,
  type FuturesTestScenario,
} from "@/lib/futuresPaperEngine";
import {
  DEFAULT_PAPER_RISK_SETTINGS,
  normalizePaperRiskSettings,
  type PaperRiskSettings,
} from "@/lib/paperRiskController";
import {
  generateFuturesStrategySetupFromCandles,
  type FuturesStrategyProfile,
} from "@/lib/futuresStrategyProfiles";

export type FuturesBacktestProfile = Exclude<FuturesStrategyProfile, "Manual">;
export type FuturesBacktestExitReason =
  | "TAKE_PROFIT"
  | "STOP_LOSS"
  | "END_OF_SAMPLE"
  | "RISK_BLOCKED"
  | "WAIT";
export type FuturesBacktestCandidateStatus = "TAKEN" | "BLOCKED" | "IGNORED";
export type FuturesBacktestInterpretation =
  | "Positive test"
  | "Weak test"
  | "High drawdown"
  | "Too few trades"
  | "No actionable setup"
  | "Risk blocked";

export interface FuturesStrategyBacktestConfig {
  profile: FuturesBacktestProfile;
  scenario: FuturesTestScenario;
  symbol: FuturesSymbol;
  startingBalance: number;
  marginPerTrade: number;
  leverage: FuturesLeverage;
  feePercent: number;
  slippagePercent: number;
  riskSettings: PaperRiskSettings;
  maxDailyLossPercent: number;
}

export interface FuturesStrategyBacktestEvent {
  id: string;
  timestamp: string;
  symbol: FuturesSymbol;
  profile: FuturesBacktestProfile;
  scenario: FuturesTestScenario;
  direction: FuturesDirection | "WAIT";
  confidence: "Low" | "Medium" | "High";
  candidateStatus: FuturesBacktestCandidateStatus;
  entryPrice: number;
  exitPrice: number | null;
  leverage: FuturesLeverage;
  marginAmount: number;
  exitReason: FuturesBacktestExitReason;
  grossPnl: number;
  feesAndSlippage: number;
  netPnl: number;
  drawdownAfterTrade: number;
  riskRewardRatio: number;
  setupReason: string;
  decisionReason: string;
}

export interface FuturesStrategyBacktestMetrics {
  totalSetupsEvaluated: number;
  tradesTaken: number;
  waitCount: number;
  riskBlockedCount: number;
  winRate: number;
  grossPnl: number;
  netPnl: number;
  totalFeesAndSlippage: number;
  maxDrawdown: number;
  profitFactor: number | null;
  averageWin: number;
  averageLoss: number;
  bestTrade: number;
  worstTrade: number;
  endingBalance: number;
  returnPercent: number;
  averageRiskReward: number;
  largestLosingStreak: number;
  largestWinningStreak: number;
}

export interface FuturesStrategyBacktestRun {
  id: string;
  createdAt: string;
  sampleStart: string;
  sampleEnd: string;
  config: FuturesStrategyBacktestConfig;
  metrics: FuturesStrategyBacktestMetrics;
  interpretation: FuturesBacktestInterpretation;
  events: FuturesStrategyBacktestEvent[];
}

type FuturesStrategyBacktestResult =
  | { ok: true; value: FuturesStrategyBacktestRun }
  | { ok: false; message: string };

interface SimulatedExit {
  exitIndex: number;
  exitPrice: number;
  reason: Extract<FuturesBacktestExitReason, "TAKE_PROFIT" | "STOP_LOSS" | "END_OF_SAMPLE">;
}

export const FUTURES_STRATEGY_BACKTEST_LATEST_STORAGE_KEY =
  "chanter-futures-strategy-backtest-latest";
export const FUTURES_STRATEGY_BACKTEST_HISTORY_STORAGE_KEY =
  "chanter-futures-strategy-backtest-history";
export const MAX_FUTURES_STRATEGY_BACKTEST_HISTORY = 20;
export const FUTURES_BACKTEST_PROFILES: FuturesBacktestProfile[] = [
  "Trend Follow",
  "Breakout",
  "Mean Reversion",
];
export const DEFAULT_FUTURES_STRATEGY_BACKTEST_CONFIG: FuturesStrategyBacktestConfig = {
  profile: "Trend Follow",
  scenario: "Neutral / Current Mock",
  symbol: "BTCUSDT",
  startingBalance: 10_000,
  marginPerTrade: 500,
  leverage: 2,
  feePercent: 0.05,
  slippagePercent: 0.05,
  riskSettings: { ...DEFAULT_PAPER_RISK_SETTINGS },
  maxDailyLossPercent: DEFAULT_FUTURES_PAPER_SETTINGS.maxDailyLossPercent,
};

const PROFILE_SET = new Set<FuturesBacktestProfile>(FUTURES_BACKTEST_PROFILES);
const EXIT_REASON_SET = new Set<FuturesBacktestExitReason>([
  "TAKE_PROFIT",
  "STOP_LOSS",
  "END_OF_SAMPLE",
  "RISK_BLOCKED",
  "WAIT",
]);
const CANDIDATE_STATUS_SET = new Set<FuturesBacktestCandidateStatus>([
  "TAKEN",
  "BLOCKED",
  "IGNORED",
]);
const INTERPRETATION_SET = new Set<FuturesBacktestInterpretation>([
  "Positive test",
  "Weak test",
  "High drawdown",
  "Too few trades",
  "No actionable setup",
  "Risk blocked",
]);
const CONFIDENCE_SET = new Set(["Low", "Medium", "High"]);
const DIRECTION_SET = new Set(["LONG", "SHORT", "WAIT"]);
const MIN_PROFILE_CANDLES = 24;
const MAX_COST_ASSUMPTION_PERCENT = 10;
const NUMBER_TOLERANCE = 0.02;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isSupportedProfile(value: unknown): value is FuturesBacktestProfile {
  return typeof value === "string" && PROFILE_SET.has(value as FuturesBacktestProfile);
}

function isSupportedSymbol(value: unknown): value is FuturesSymbol {
  return typeof value === "string" && SUPPORTED_FUTURES_SYMBOLS.includes(value as FuturesSymbol);
}

function isSupportedLeverage(value: unknown): value is FuturesLeverage {
  return isFiniteNumber(value) && SUPPORTED_FUTURES_LEVERAGE.includes(value as FuturesLeverage);
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function roundPercent(value: number): number {
  return Number(value.toFixed(4));
}

function numbersMatch(left: number, right: number, tolerance = NUMBER_TOLERANCE): boolean {
  return Math.abs(left - right) <= Math.max(tolerance, Math.abs(right) * 1e-8);
}

function validateConfig(config: FuturesStrategyBacktestConfig): string | null {
  if (!isSupportedProfile(config.profile)) return "Select a supported futures strategy profile.";
  if (!isFuturesTestScenario(config.scenario)) return "Select a supported strategy test scenario.";
  if (!isSupportedSymbol(config.symbol)) return "Select a supported futures symbol.";
  if (!isFiniteNumber(config.startingBalance) || config.startingBalance <= 0) {
    return "Starting balance must be greater than zero.";
  }
  if (!isFiniteNumber(config.marginPerTrade) || config.marginPerTrade <= 0) {
    return "Margin per trade must be greater than zero.";
  }
  if (config.marginPerTrade > config.startingBalance) {
    return "Margin per trade cannot exceed the starting balance.";
  }
  if (!isSupportedLeverage(config.leverage)) {
    return "Leverage must be 1x, 2x, 3x, or 5x and cannot exceed 5x.";
  }
  if (
    !isFiniteNumber(config.feePercent) ||
    config.feePercent < 0 ||
    config.feePercent > MAX_COST_ASSUMPTION_PERCENT
  ) {
    return `Fee assumption must be between 0% and ${MAX_COST_ASSUMPTION_PERCENT}%.`;
  }
  if (
    !isFiniteNumber(config.slippagePercent) ||
    config.slippagePercent < 0 ||
    config.slippagePercent > MAX_COST_ASSUMPTION_PERCENT
  ) {
    return `Slippage assumption must be between 0% and ${MAX_COST_ASSUMPTION_PERCENT}%.`;
  }
  if (!normalizePaperRiskSettings(config.riskSettings)) {
    return "Saved Risk Controller settings are invalid.";
  }
  if (
    !isFiniteNumber(config.maxDailyLossPercent) ||
    config.maxDailyLossPercent <= 0 ||
    config.maxDailyLossPercent > 100
  ) {
    return "Maximum daily loss must be greater than 0% and no more than 100%.";
  }
  return null;
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function createRunId(config: FuturesStrategyBacktestConfig): string {
  const normalizedConfig = {
    ...config,
    riskSettings: { ...config.riskSettings },
  };
  return `futures-strategy-backtest-${hashText(JSON.stringify(normalizedConfig))}`;
}

function simulateExit(
  candles: FuturesMockCandle[],
  entryIndex: number,
  direction: FuturesDirection,
  stopLossPrice: number,
  takeProfitPrice: number,
): SimulatedExit {
  for (let index = entryIndex + 1; index < candles.length; index += 1) {
    const candle = candles[index];
    const stopHit = direction === "LONG"
      ? candle.low <= stopLossPrice
      : candle.high >= stopLossPrice;
    const targetHit = direction === "LONG"
      ? candle.high >= takeProfitPrice
      : candle.low <= takeProfitPrice;

    // If both levels occur inside one mock candle, use the adverse result. The OHLC sample
    // cannot establish intrabar order, so this avoids optimistic path assumptions.
    if (stopHit) {
      return { exitIndex: index, exitPrice: stopLossPrice, reason: "STOP_LOSS" };
    }
    if (targetHit) {
      return { exitIndex: index, exitPrice: takeProfitPrice, reason: "TAKE_PROFIT" };
    }
  }

  const finalIndex = candles.length - 1;
  return {
    exitIndex: Math.max(entryIndex, finalIndex),
    exitPrice: candles[finalIndex]?.close ?? candles[entryIndex].close,
    reason: "END_OF_SAMPLE",
  };
}

function createIgnoredEvent(
  runId: string,
  candidateIndex: number,
  config: FuturesStrategyBacktestConfig,
  timestamp: string,
  entryPrice: number,
  setupReason: string,
  decisionReason: string,
): FuturesStrategyBacktestEvent {
  return {
    id: `${runId}-candidate-${candidateIndex}`,
    timestamp,
    symbol: config.symbol,
    profile: config.profile,
    scenario: config.scenario,
    direction: "WAIT",
    confidence: "Low",
    candidateStatus: "IGNORED",
    entryPrice,
    exitPrice: null,
    leverage: config.leverage,
    marginAmount: config.marginPerTrade,
    exitReason: "WAIT",
    grossPnl: 0,
    feesAndSlippage: 0,
    netPnl: 0,
    drawdownAfterTrade: 0,
    riskRewardRatio: 0,
    setupReason,
    decisionReason,
  };
}

function getInterpretation(
  metrics: FuturesStrategyBacktestMetrics,
  drawdownWarningPercent: number,
): FuturesBacktestInterpretation {
  if (metrics.tradesTaken === 0 && metrics.riskBlockedCount > 0) return "Risk blocked";
  if (metrics.tradesTaken === 0) return "No actionable setup";
  if (metrics.tradesTaken < 3) return "Too few trades";
  if (metrics.maxDrawdown >= drawdownWarningPercent) return "High drawdown";
  if (metrics.netPnl > 0 && (metrics.profitFactor === null || metrics.profitFactor > 1)) {
    return "Positive test";
  }
  return "Weak test";
}

function calculateMetrics(
  config: FuturesStrategyBacktestConfig,
  events: FuturesStrategyBacktestEvent[],
): FuturesStrategyBacktestMetrics {
  const trades = events.filter((event) => event.candidateStatus === "TAKEN");
  const winningTrades = trades.filter((event) => event.netPnl > 0);
  const losingTrades = trades.filter((event) => event.netPnl < 0);
  const grossPnl = events.reduce((sum, event) => sum + event.grossPnl, 0);
  const netPnl = events.reduce((sum, event) => sum + event.netPnl, 0);
  const totalCosts = events.reduce((sum, event) => sum + event.feesAndSlippage, 0);
  const grossWins = winningTrades.reduce((sum, event) => sum + event.netPnl, 0);
  const grossLosses = Math.abs(losingTrades.reduce((sum, event) => sum + event.netPnl, 0));
  let currentWinningStreak = 0;
  let currentLosingStreak = 0;
  let largestWinningStreak = 0;
  let largestLosingStreak = 0;

  for (const trade of trades) {
    if (trade.netPnl > 0) {
      currentWinningStreak += 1;
      currentLosingStreak = 0;
      largestWinningStreak = Math.max(largestWinningStreak, currentWinningStreak);
    } else if (trade.netPnl < 0) {
      currentLosingStreak += 1;
      currentWinningStreak = 0;
      largestLosingStreak = Math.max(largestLosingStreak, currentLosingStreak);
    } else {
      currentWinningStreak = 0;
      currentLosingStreak = 0;
    }
  }

  const metrics: FuturesStrategyBacktestMetrics = {
    totalSetupsEvaluated: events.length,
    tradesTaken: trades.length,
    waitCount: events.filter((event) => event.exitReason === "WAIT").length,
    riskBlockedCount: events.filter((event) => event.exitReason === "RISK_BLOCKED").length,
    winRate: trades.length > 0 ? winningTrades.length / trades.length * 100 : 0,
    grossPnl: roundMoney(grossPnl),
    netPnl: roundMoney(netPnl),
    totalFeesAndSlippage: roundMoney(totalCosts),
    maxDrawdown: roundPercent(Math.max(0, ...events.map((event) => event.drawdownAfterTrade))),
    profitFactor: grossLosses > 0
      ? Number((grossWins / grossLosses).toFixed(4))
      : winningTrades.length > 0 ? null : 0,
    averageWin: winningTrades.length > 0
      ? roundMoney(grossWins / winningTrades.length)
      : 0,
    averageLoss: losingTrades.length > 0
      ? roundMoney(-grossLosses / losingTrades.length)
      : 0,
    bestTrade: trades.length > 0 ? roundMoney(Math.max(...trades.map((event) => event.netPnl))) : 0,
    worstTrade: trades.length > 0 ? roundMoney(Math.min(...trades.map((event) => event.netPnl))) : 0,
    endingBalance: roundMoney(Math.max(0, config.startingBalance + netPnl)),
    returnPercent: config.startingBalance > 0
      ? roundPercent(netPnl / config.startingBalance * 100)
      : 0,
    averageRiskReward: trades.length > 0
      ? Number((trades.reduce((sum, event) => sum + event.riskRewardRatio, 0) / trades.length).toFixed(4))
      : 0,
    largestLosingStreak,
    largestWinningStreak,
  };
  return metrics;
}

export function runFuturesStrategyBacktest(
  input: FuturesStrategyBacktestConfig,
): FuturesStrategyBacktestResult {
  const normalizedRiskSettings = normalizePaperRiskSettings(input.riskSettings);
  const config: FuturesStrategyBacktestConfig = {
    ...input,
    riskSettings: normalizedRiskSettings ?? { ...input.riskSettings },
  };
  const validationError = validateConfig(config);
  if (validationError) return { ok: false, message: validationError };

  const candles = getMock15mCandles(config.symbol, config.scenario);
  if (candles.length < MIN_PROFILE_CANDLES + 1) {
    return { ok: false, message: "The local 15m sample is too short for this profile." };
  }

  const runId = createRunId(config);
  const events: FuturesStrategyBacktestEvent[] = [];
  let balance = config.startingBalance;
  let peakBalance = config.startingBalance;
  let futuresSettings: FuturesPaperSettings = {
    ...DEFAULT_FUTURES_PAPER_SETTINGS,
    maxDailyLossPercent: config.maxDailyLossPercent,
  };

  for (let candidateIndex = MIN_PROFILE_CANDLES - 1; candidateIndex < candles.length; candidateIndex += 1) {
    const candleWindow = candles.slice(0, candidateIndex + 1);
    const candidateCandle = candles[candidateIndex];
    const setup = generateFuturesStrategySetupFromCandles(
      config.profile,
      config.symbol,
      candleWindow,
    );

    if (setup.suggestedDirection === "WAIT") {
      events.push(createIgnoredEvent(
        runId,
        candidateIndex,
        config,
        candidateCandle.timestamp,
        setup.entryReference,
        setup.strategyReason,
        "WAIT is recorded as no trade.",
      ));
      continue;
    }

    const direction = setup.suggestedDirection;
    const trade: FuturesPaperTradeInput = {
      symbol: config.symbol,
      scenario: config.scenario,
      direction,
      entryPrice: setup.entryReference,
      marginAmount: config.marginPerTrade,
      leverage: config.leverage,
      stopLossPercent: setup.stopLossPercent,
      takeProfitPercent: setup.takeProfitPercent,
      strategyReason: setup.strategyReason,
    };

    const balanceReason = balance <= 0
      ? "The simulated balance is depleted."
      : config.marginPerTrade > balance
        ? "Margin per trade exceeds the current simulated balance."
        : null;
    const preview = evaluateFuturesPaperRisk({
      trade,
      markPrice: setup.entryReference,
      openPositions: [],
      history: [],
      futuresSettings,
      riskSettings: config.riskSettings,
      paperPortfolioValue: balance,
      now: candidateCandle.timestamp,
    });

    if (balanceReason || preview.decision !== "APPROVED") {
      events.push({
        id: `${runId}-candidate-${candidateIndex}`,
        timestamp: candidateCandle.timestamp,
        symbol: config.symbol,
        profile: config.profile,
        scenario: config.scenario,
        direction,
        confidence: setup.confidence,
        candidateStatus: "BLOCKED",
        entryPrice: setup.entryReference,
        exitPrice: null,
        leverage: config.leverage,
        marginAmount: config.marginPerTrade,
        exitReason: "RISK_BLOCKED",
        grossPnl: 0,
        feesAndSlippage: 0,
        netPnl: 0,
        drawdownAfterTrade: peakBalance > 0 ? roundPercent((peakBalance - balance) / peakBalance * 100) : 0,
        riskRewardRatio: preview.riskRewardRatio,
        setupReason: setup.strategyReason,
        decisionReason: balanceReason ?? preview.reason,
      });
      continue;
    }

    const simulatedExit = simulateExit(
      candles,
      candidateIndex,
      direction,
      preview.stopLossPrice,
      preview.takeProfitPrice,
    );
    const notionalSize = config.marginPerTrade * config.leverage;
    const quantity = setup.entryReference > 0 ? notionalSize / setup.entryReference : 0;
    const directionMultiplier = direction === "LONG" ? 1 : -1;
    const grossPnl = (simulatedExit.exitPrice - setup.entryReference) * quantity * directionMultiplier;
    const exitNotional = simulatedExit.exitPrice * quantity;
    const feeEstimate = (notionalSize + exitNotional) * config.feePercent / 100;
    const slippageEstimate = (notionalSize + exitNotional) * config.slippagePercent / 100;
    const totalCosts = feeEstimate + slippageEstimate;
    const unclampedNetPnl = grossPnl - totalCosts;
    const netPnl = Math.max(-balance, unclampedNetPnl);
    balance = Math.max(0, balance + netPnl);
    peakBalance = Math.max(peakBalance, balance);
    const drawdown = peakBalance > 0 ? (peakBalance - balance) / peakBalance * 100 : 0;
    const exitTimestamp = candles[simulatedExit.exitIndex]?.timestamp ?? candidateCandle.timestamp;

    futuresSettings = recordFuturesDailyLoss(futuresSettings, netPnl, exitTimestamp);
    events.push({
      id: `${runId}-candidate-${candidateIndex}`,
      timestamp: candidateCandle.timestamp,
      symbol: config.symbol,
      profile: config.profile,
      scenario: config.scenario,
      direction,
      confidence: setup.confidence,
      candidateStatus: "TAKEN",
      entryPrice: setup.entryReference,
      exitPrice: simulatedExit.exitPrice,
      leverage: config.leverage,
      marginAmount: config.marginPerTrade,
      exitReason: simulatedExit.reason,
      grossPnl: roundMoney(grossPnl),
      feesAndSlippage: roundMoney(totalCosts),
      netPnl: roundMoney(netPnl),
      drawdownAfterTrade: roundPercent(drawdown),
      riskRewardRatio: Number(preview.riskRewardRatio.toFixed(4)),
      setupReason: setup.strategyReason,
      decisionReason: preview.reason,
    });

    candidateIndex = Math.max(candidateIndex, simulatedExit.exitIndex);
  }

  const metrics = calculateMetrics(config, events);
  const run: FuturesStrategyBacktestRun = {
    id: runId,
    createdAt: candles.at(-1)?.timestamp ?? "2026-06-30T00:00:00.000Z",
    sampleStart: candles[0].timestamp,
    sampleEnd: candles.at(-1)?.timestamp ?? candles[0].timestamp,
    config: { ...config, riskSettings: { ...config.riskSettings } },
    metrics,
    interpretation: getInterpretation(metrics, config.riskSettings.maxDrawdownWarningPercent),
    events,
  };

  return { ok: true, value: run };
}

function normalizeEvent(
  value: unknown,
  config: FuturesStrategyBacktestConfig,
): FuturesStrategyBacktestEvent | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" || value.id.trim() === "" ||
    !isValidDate(value.timestamp) ||
    value.symbol !== config.symbol ||
    value.profile !== config.profile ||
    value.scenario !== config.scenario ||
    typeof value.direction !== "string" || !DIRECTION_SET.has(value.direction) ||
    typeof value.confidence !== "string" || !CONFIDENCE_SET.has(value.confidence) ||
    typeof value.candidateStatus !== "string" || !CANDIDATE_STATUS_SET.has(value.candidateStatus as FuturesBacktestCandidateStatus) ||
    !isFiniteNumber(value.entryPrice) || value.entryPrice <= 0 ||
    !(value.exitPrice === null || (isFiniteNumber(value.exitPrice) && value.exitPrice > 0)) ||
    value.leverage !== config.leverage ||
    value.marginAmount !== config.marginPerTrade ||
    typeof value.exitReason !== "string" || !EXIT_REASON_SET.has(value.exitReason as FuturesBacktestExitReason) ||
    !isFiniteNumber(value.grossPnl) ||
    !isFiniteNumber(value.feesAndSlippage) || value.feesAndSlippage < 0 ||
    !isFiniteNumber(value.netPnl) ||
    !isFiniteNumber(value.drawdownAfterTrade) || value.drawdownAfterTrade < 0 || value.drawdownAfterTrade > 100 ||
    !isFiniteNumber(value.riskRewardRatio) || value.riskRewardRatio < 0 ||
    typeof value.setupReason !== "string" || value.setupReason.trim() === "" ||
    typeof value.decisionReason !== "string" || value.decisionReason.trim() === ""
  ) {
    return null;
  }

  const direction = value.direction as FuturesDirection | "WAIT";
  const candidateStatus = value.candidateStatus as FuturesBacktestCandidateStatus;
  const exitReason = value.exitReason as FuturesBacktestExitReason;
  const isWait = exitReason === "WAIT";
  const isBlocked = exitReason === "RISK_BLOCKED";
  const isTrade = !isWait && !isBlocked;
  if (
    (isWait && (candidateStatus !== "IGNORED" || direction !== "WAIT")) ||
    (isBlocked && (candidateStatus !== "BLOCKED" || direction === "WAIT")) ||
    (isTrade && (candidateStatus !== "TAKEN" || direction === "WAIT" || value.exitPrice === null)) ||
    (!isTrade && value.exitPrice !== null) ||
    (!isTrade && (value.grossPnl !== 0 || value.feesAndSlippage !== 0 || value.netPnl !== 0))
  ) {
    return null;
  }

  return {
    id: value.id,
    timestamp: value.timestamp,
    symbol: config.symbol,
    profile: config.profile,
    scenario: config.scenario,
    direction,
    confidence: value.confidence as "Low" | "Medium" | "High",
    candidateStatus,
    entryPrice: value.entryPrice,
    exitPrice: value.exitPrice as number | null,
    leverage: config.leverage,
    marginAmount: config.marginPerTrade,
    exitReason,
    grossPnl: value.grossPnl,
    feesAndSlippage: value.feesAndSlippage,
    netPnl: value.netPnl,
    drawdownAfterTrade: value.drawdownAfterTrade,
    riskRewardRatio: value.riskRewardRatio,
    setupReason: value.setupReason,
    decisionReason: value.decisionReason,
  };
}

function normalizeMetrics(value: unknown): FuturesStrategyBacktestMetrics | null {
  if (!isRecord(value)) return null;
  const numericKeys: Array<keyof FuturesStrategyBacktestMetrics> = [
    "totalSetupsEvaluated",
    "tradesTaken",
    "waitCount",
    "riskBlockedCount",
    "winRate",
    "grossPnl",
    "netPnl",
    "totalFeesAndSlippage",
    "maxDrawdown",
    "averageWin",
    "averageLoss",
    "bestTrade",
    "worstTrade",
    "endingBalance",
    "returnPercent",
    "averageRiskReward",
    "largestLosingStreak",
    "largestWinningStreak",
  ];
  if (numericKeys.some((key) => !isFiniteNumber(value[key]))) return null;
  if (!(value.profitFactor === null || isFiniteNumber(value.profitFactor))) return null;

  const metrics = value as unknown as FuturesStrategyBacktestMetrics;
  if (
    !Number.isInteger(metrics.totalSetupsEvaluated) || metrics.totalSetupsEvaluated < 0 ||
    !Number.isInteger(metrics.tradesTaken) || metrics.tradesTaken < 0 ||
    !Number.isInteger(metrics.waitCount) || metrics.waitCount < 0 ||
    !Number.isInteger(metrics.riskBlockedCount) || metrics.riskBlockedCount < 0 ||
    metrics.winRate < 0 || metrics.winRate > 100 ||
    metrics.totalFeesAndSlippage < 0 ||
    metrics.maxDrawdown < 0 || metrics.maxDrawdown > 100 ||
    metrics.endingBalance < 0 ||
    metrics.averageRiskReward < 0 ||
    !Number.isInteger(metrics.largestLosingStreak) || metrics.largestLosingStreak < 0 ||
    !Number.isInteger(metrics.largestWinningStreak) || metrics.largestWinningStreak < 0 ||
    (metrics.profitFactor !== null && metrics.profitFactor < 0)
  ) {
    return null;
  }
  return { ...metrics };
}

export function normalizeFuturesStrategyBacktestRun(
  value: unknown,
): FuturesStrategyBacktestRun | null {
  if (!isRecord(value) || !isRecord(value.config)) return null;
  const rawConfig = value.config;
  const riskSettings = normalizePaperRiskSettings(rawConfig.riskSettings);
  if (!riskSettings) return null;
  const config = {
    profile: rawConfig.profile,
    scenario: rawConfig.scenario,
    symbol: rawConfig.symbol,
    startingBalance: rawConfig.startingBalance,
    marginPerTrade: rawConfig.marginPerTrade,
    leverage: rawConfig.leverage,
    feePercent: rawConfig.feePercent,
    slippagePercent: rawConfig.slippagePercent,
    riskSettings,
    maxDailyLossPercent: rawConfig.maxDailyLossPercent,
  } as FuturesStrategyBacktestConfig;
  if (validateConfig(config)) return null;
  if (
    typeof value.id !== "string" || value.id.trim() === "" ||
    !isValidDate(value.createdAt) ||
    !isValidDate(value.sampleStart) ||
    !isValidDate(value.sampleEnd) ||
    Date.parse(value.sampleStart) > Date.parse(value.sampleEnd) ||
    typeof value.interpretation !== "string" ||
    !INTERPRETATION_SET.has(value.interpretation as FuturesBacktestInterpretation) ||
    !Array.isArray(value.events) || value.events.length > 96
  ) {
    return null;
  }

  const events = value.events.map((event) => normalizeEvent(event, config));
  if (events.some((event) => event === null)) return null;
  const normalizedEvents = events.filter(
    (event): event is FuturesStrategyBacktestEvent => event !== null,
  );
  if (new Set(normalizedEvents.map((event) => event.id)).size !== normalizedEvents.length) return null;

  const metrics = normalizeMetrics(value.metrics);
  if (!metrics) return null;
  const calculatedMetrics = calculateMetrics(config, normalizedEvents);
  const exactMetricKeys: Array<keyof FuturesStrategyBacktestMetrics> = [
    "totalSetupsEvaluated",
    "tradesTaken",
    "waitCount",
    "riskBlockedCount",
    "largestLosingStreak",
    "largestWinningStreak",
  ];
  const comparableMetricKeys: Array<keyof FuturesStrategyBacktestMetrics> = [
    "winRate",
    "grossPnl",
    "netPnl",
    "totalFeesAndSlippage",
    "maxDrawdown",
    "averageWin",
    "averageLoss",
    "bestTrade",
    "worstTrade",
    "endingBalance",
    "returnPercent",
    "averageRiskReward",
  ];
  if (
    exactMetricKeys.some((key) => metrics[key] !== calculatedMetrics[key]) ||
    comparableMetricKeys.some((key) => !numbersMatch(metrics[key] as number, calculatedMetrics[key] as number)) ||
    metrics.profitFactor !== calculatedMetrics.profitFactor ||
    value.interpretation !== getInterpretation(metrics, config.riskSettings.maxDrawdownWarningPercent)
  ) {
    return null;
  }

  return {
    id: value.id,
    createdAt: value.createdAt,
    sampleStart: value.sampleStart,
    sampleEnd: value.sampleEnd,
    config: { ...config, riskSettings: { ...config.riskSettings } },
    metrics,
    interpretation: value.interpretation as FuturesBacktestInterpretation,
    events: normalizedEvents,
  };
}

export function loadFuturesStrategyBacktestHistory(): FuturesStrategyBacktestRun[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(FUTURES_STRATEGY_BACKTEST_HISTORY_STORAGE_KEY) ?? "[]",
    );
    if (!Array.isArray(parsed)) return [];
    const seenIds = new Set<string>();
    return parsed
      .map(normalizeFuturesStrategyBacktestRun)
      .filter((run): run is FuturesStrategyBacktestRun => {
        if (!run || seenIds.has(run.id)) return false;
        seenIds.add(run.id);
        return true;
      })
      .slice(0, MAX_FUTURES_STRATEGY_BACKTEST_HISTORY);
  } catch {
    return [];
  }
}

export function loadLatestFuturesStrategyBacktest(): FuturesStrategyBacktestRun | null {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(FUTURES_STRATEGY_BACKTEST_LATEST_STORAGE_KEY) ?? "null",
    );
    return normalizeFuturesStrategyBacktestRun(parsed) ??
      loadFuturesStrategyBacktestHistory()[0] ?? null;
  } catch {
    return loadFuturesStrategyBacktestHistory()[0] ?? null;
  }
}

export function saveFuturesStrategyBacktestHistory(
  history: FuturesStrategyBacktestRun[],
): boolean {
  const normalized = history.map(normalizeFuturesStrategyBacktestRun);
  if (normalized.some((run) => run === null)) return false;
  const validRuns = normalized.filter((run): run is FuturesStrategyBacktestRun => run !== null);
  if (new Set(validRuns.map((run) => run.id)).size !== validRuns.length) return false;
  const cappedHistory = validRuns.slice(0, MAX_FUTURES_STRATEGY_BACKTEST_HISTORY);

  try {
    localStorage.setItem(
      FUTURES_STRATEGY_BACKTEST_HISTORY_STORAGE_KEY,
      JSON.stringify(cappedHistory),
    );
    if (cappedHistory[0]) {
      localStorage.setItem(
        FUTURES_STRATEGY_BACKTEST_LATEST_STORAGE_KEY,
        JSON.stringify(cappedHistory[0]),
      );
    } else {
      localStorage.removeItem(FUTURES_STRATEGY_BACKTEST_LATEST_STORAGE_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

export function clearFuturesStrategyBacktestHistory(): boolean {
  try {
    localStorage.removeItem(FUTURES_STRATEGY_BACKTEST_HISTORY_STORAGE_KEY);
    localStorage.removeItem(FUTURES_STRATEGY_BACKTEST_LATEST_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
