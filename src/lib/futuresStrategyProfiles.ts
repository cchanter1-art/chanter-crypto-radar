import {
  getMock15mCandles,
  type FuturesDirection,
  type FuturesLeverage,
  type FuturesMockCandle,
  type FuturesSymbol,
} from "@/lib/futuresPaperEngine";

export type FuturesStrategyProfile =
  | "Manual"
  | "Trend Follow"
  | "Breakout"
  | "Mean Reversion";
export type FuturesStrategyDirection = FuturesDirection | "WAIT";
export type FuturesStrategyConfidence = "Low" | "Medium" | "High";

export interface FuturesStrategySetup {
  profile: Exclude<FuturesStrategyProfile, "Manual">;
  symbol: FuturesSymbol;
  suggestedDirection: FuturesStrategyDirection;
  confidence: FuturesStrategyConfidence;
  entryReference: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  leverageSuggestion: FuturesLeverage;
  strategyReason: string;
  invalidationNote: string;
  riskNote: string;
}

export const FUTURES_STRATEGY_PROFILE_STORAGE_KEY = "chanter-futures-strategy-profile";
export const DEFAULT_FUTURES_STRATEGY_PROFILE: FuturesStrategyProfile = "Manual";
export const FUTURES_STRATEGY_PROFILES: FuturesStrategyProfile[] = [
  "Manual",
  "Trend Follow",
  "Breakout",
  "Mean Reversion",
];

const PROFILE_SET = new Set<FuturesStrategyProfile>(FUTURES_STRATEGY_PROFILES);

function average(values: number[]): number {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function percentChange(current: number, previous: number): number {
  return previous > 0 ? (current - previous) / previous * 100 : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundPercent(value: number): number {
  return Number(value.toFixed(2));
}

function getAverageRangePercent(candles: FuturesMockCandle[], count = 20): number {
  const recent = candles.slice(-count);
  return average(
    recent.map((candle) =>
      candle.open > 0 ? (candle.high - candle.low) / candle.open * 100 : 0,
    ),
  );
}

function getLeverageSuggestion(
  profile: Exclude<FuturesStrategyProfile, "Manual">,
  confidence: FuturesStrategyConfidence,
): FuturesLeverage {
  if (confidence === "Low") return 1;
  if (confidence === "High") return profile === "Breakout" ? 5 : 3;
  return 2;
}

function createWaitSetup(
  profile: Exclude<FuturesStrategyProfile, "Manual">,
  symbol: FuturesSymbol,
  entryReference: number,
  stopLossPercent: number,
  takeProfitPercent: number,
  reason: string,
  invalidationNote: string,
  riskNote: string,
): FuturesStrategySetup {
  return {
    profile,
    symbol,
    suggestedDirection: "WAIT",
    confidence: "Low",
    entryReference,
    stopLossPercent,
    takeProfitPercent,
    leverageSuggestion: 1,
    strategyReason: reason,
    invalidationNote,
    riskNote,
  };
}

function generateTrendFollow(
  symbol: FuturesSymbol,
  candles: FuturesMockCandle[],
): FuturesStrategySetup {
  const profile = "Trend Follow" as const;
  const closes = candles.map((candle) => candle.close);
  const entryReference = closes.at(-1) ?? 0;
  const fastAverage = average(closes.slice(-8));
  const slowAverage = average(closes.slice(-24));
  const momentumReference = closes.at(-9) ?? entryReference;
  const spreadPercent = percentChange(fastAverage, slowAverage);
  const momentumPercent = percentChange(entryReference, momentumReference);
  const averageRange = getAverageRangePercent(candles);
  const stopLossPercent = roundPercent(clamp(averageRange * 2, 1.5, 12));
  const takeProfitPercent = roundPercent(clamp(stopLossPercent * 2, 3, 24));
  const isLong = spreadPercent >= 0.15 && momentumPercent > 0;
  const isShort = spreadPercent <= -0.15 && momentumPercent < 0;

  if (!isLong && !isShort) {
    return createWaitSetup(
      profile,
      symbol,
      entryReference,
      stopLossPercent,
      takeProfitPercent,
      `Trend Follow is waiting because the local 8-candle and 24-candle trend measures are not aligned with recent momentum.`,
      "A directional setup remains invalid until the short local average and momentum point the same way.",
      "Trend alignment can reverse quickly in short mock samples. Keep the Futures Risk Preview gate active.",
    );
  }

  const direction: FuturesDirection = isLong ? "LONG" : "SHORT";
  const strength = Math.abs(spreadPercent) + Math.abs(momentumPercent) * 0.5;
  const confidence: FuturesStrategyConfidence = strength >= 1.2 ? "High" : "Medium";

  return {
    profile,
    symbol,
    suggestedDirection: direction,
    confidence,
    entryReference,
    stopLossPercent,
    takeProfitPercent,
    leverageSuggestion: getLeverageSuggestion(profile, confidence),
    strategyReason: `${profile} ${direction}: the local 8-candle average is ${Math.abs(spreadPercent).toFixed(2)}% ${spreadPercent >= 0 ? "above" : "below"} the 24-candle average and momentum is ${momentumPercent >= 0 ? "+" : ""}${momentumPercent.toFixed(2)}%.`,
    invalidationNote: `Invalidate if the 8-candle average crosses back through the 24-candle average or momentum changes sign.`,
    riskNote: "Short-window trends can whipsaw. This local setup still requires Futures Risk Preview approval.",
  };
}

function generateBreakout(
  symbol: FuturesSymbol,
  candles: FuturesMockCandle[],
): FuturesStrategySetup {
  const profile = "Breakout" as const;
  const current = candles.at(-1);
  const lookback = candles.slice(-21, -1);
  const entryReference = current?.close ?? 0;
  const rangeHigh = Math.max(...lookback.map((candle) => candle.high));
  const rangeLow = Math.min(...lookback.map((candle) => candle.low));
  const averageRange = getAverageRangePercent(candles);
  const stopLossPercent = roundPercent(clamp(averageRange * 1.5, 1.2, 10));
  const takeProfitPercent = roundPercent(clamp(stopLossPercent * 2, 2.4, 20));
  const upsideBreakPercent = percentChange(entryReference, rangeHigh);
  const downsideBreakPercent = percentChange(rangeLow, entryReference);
  const isLong = entryReference > rangeHigh;
  const isShort = entryReference < rangeLow;

  if (!current || lookback.length < 20 || (!isLong && !isShort)) {
    return createWaitSetup(
      profile,
      symbol,
      entryReference,
      stopLossPercent,
      takeProfitPercent,
      "Breakout is waiting because the latest local close remains inside the previous 20-candle mock range.",
      "A setup remains invalid until a local candle closes outside the prior 20-candle high or low.",
      "Range boundaries are derived from mock candles and may not represent executable market levels.",
    );
  }

  const direction: FuturesDirection = isLong ? "LONG" : "SHORT";
  const breakoutPercent = isLong ? upsideBreakPercent : downsideBreakPercent;
  const highConfidenceThreshold = Math.max(0.4, averageRange * 0.75);
  const confidence: FuturesStrategyConfidence = breakoutPercent >= highConfidenceThreshold
    ? "High"
    : "Medium";

  return {
    profile,
    symbol,
    suggestedDirection: direction,
    confidence,
    entryReference,
    stopLossPercent,
    takeProfitPercent,
    leverageSuggestion: getLeverageSuggestion(profile, confidence),
    strategyReason: `${profile} ${direction}: the latest local close is ${breakoutPercent.toFixed(2)}% beyond the previous 20-candle ${isLong ? "high" : "low"}.`,
    invalidationNote: `Invalidate if a local close returns inside the prior 20-candle range.`,
    riskNote: "Mock breakouts can fail immediately. A 5x suggestion is limited to High confidence and remains subject to every futures risk gate.",
  };
}

function generateMeanReversion(
  symbol: FuturesSymbol,
  candles: FuturesMockCandle[],
): FuturesStrategySetup {
  const profile = "Mean Reversion" as const;
  const closes = candles.map((candle) => candle.close);
  const entryReference = closes.at(-1) ?? 0;
  const mean = average(closes.slice(-20));
  const deviationPercent = percentChange(entryReference, mean);
  const averageRange = getAverageRangePercent(candles);
  const triggerPercent = Math.max(0.6, averageRange * 0.75);
  const stopLossPercent = roundPercent(clamp(averageRange * 1.25, 1, 8));
  const takeProfitPercent = roundPercent(clamp(stopLossPercent * 1.5, 1.5, 12));
  const isLong = deviationPercent <= -triggerPercent;
  const isShort = deviationPercent >= triggerPercent;

  if (!isLong && !isShort) {
    return createWaitSetup(
      profile,
      symbol,
      entryReference,
      stopLossPercent,
      takeProfitPercent,
      `Mean Reversion is waiting because the local close is only ${Math.abs(deviationPercent).toFixed(2)}% from its 20-candle mean.`,
      `A setup remains invalid until deviation exceeds the ${triggerPercent.toFixed(2)}% local threshold.`,
      "Price can continue moving away from a short-window mean. The setup does not predict a reversal.",
    );
  }

  const direction: FuturesDirection = isLong ? "LONG" : "SHORT";
  const confidence: FuturesStrategyConfidence = Math.abs(deviationPercent) >= triggerPercent * 2.5
    ? "High"
    : "Medium";

  return {
    profile,
    symbol,
    suggestedDirection: direction,
    confidence,
    entryReference,
    stopLossPercent,
    takeProfitPercent,
    leverageSuggestion: getLeverageSuggestion(profile, confidence),
    strategyReason: `${profile} ${direction}: the local close is ${Math.abs(deviationPercent).toFixed(2)}% ${deviationPercent >= 0 ? "above" : "below"} its 20-candle mean.`,
    invalidationNote: "Invalidate if deviation expands through the stop before the local mean is retested.",
    riskNote: "Mean reversion can fail during persistent trends. This setup remains paper-only and risk-gated.",
  };
}

export function generateFuturesStrategySetup(
  profile: Exclude<FuturesStrategyProfile, "Manual">,
  symbol: FuturesSymbol,
): FuturesStrategySetup {
  const candles = getMock15mCandles(symbol);
  if (profile === "Trend Follow") return generateTrendFollow(symbol, candles);
  if (profile === "Breakout") return generateBreakout(symbol, candles);
  return generateMeanReversion(symbol, candles);
}

export function isFuturesStrategyProfile(value: unknown): value is FuturesStrategyProfile {
  return typeof value === "string" && PROFILE_SET.has(value as FuturesStrategyProfile);
}

export function loadFuturesStrategyProfile(): FuturesStrategyProfile {
  try {
    const stored = localStorage.getItem(FUTURES_STRATEGY_PROFILE_STORAGE_KEY);
    return isFuturesStrategyProfile(stored) ? stored : DEFAULT_FUTURES_STRATEGY_PROFILE;
  } catch {
    return DEFAULT_FUTURES_STRATEGY_PROFILE;
  }
}

export function saveFuturesStrategyProfile(profile: FuturesStrategyProfile): boolean {
  if (!isFuturesStrategyProfile(profile)) return false;
  try {
    localStorage.setItem(FUTURES_STRATEGY_PROFILE_STORAGE_KEY, profile);
    return true;
  } catch {
    return false;
  }
}

export function clearFuturesStrategyProfile(): boolean {
  try {
    localStorage.removeItem(FUTURES_STRATEGY_PROFILE_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
