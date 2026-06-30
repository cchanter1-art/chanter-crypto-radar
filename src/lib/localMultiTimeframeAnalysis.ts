import {
  getMock15mCandles,
  type FuturesMockCandle,
  type FuturesSymbol,
  type FuturesTestScenario,
} from "@/lib/futuresPaperEngine";

export type AnalysisTimeframe = "15m" | "1h" | "4h";
export type LocalTrendState = "bullish" | "bearish" | "neutral";
export type MomentumState = "positive" | "negative" | "neutral" | "unavailable";
export type RsiZone = "overbought" | "oversold" | "neutral" | "unavailable";

export interface LocalTimeframeSnapshot {
  timeframe: AnalysisTimeframe;
  trend: LocalTrendState;
  rsi: number | null;
  rsiZone: RsiZone;
  macd: MomentumState;
  emaStructure: string;
  volumeAnomaly: "unavailable";
}

export interface LocalCoinTimeframeAnalysis {
  coinId: string;
  symbol: string;
  futuresSymbol: FuturesSymbol;
  source: "local/mock";
  timeframes: LocalTimeframeSnapshot[];
}

export const FUTURES_SYMBOL_BY_COIN_ID: Record<string, FuturesSymbol> = {
  btc: "BTCUSDT",
  eth: "ETHUSDT",
  sol: "SOLUSDT",
  ada: "ADAUSDT",
  avax: "AVAXUSDT",
};

const TIMEFRAME_BUCKETS: Array<{ timeframe: AnalysisTimeframe; size: number }> = [
  { timeframe: "15m", size: 1 },
  { timeframe: "1h", size: 4 },
  { timeframe: "4h", size: 16 },
];

function aggregateCandles(candles: FuturesMockCandle[], bucketSize: number): FuturesMockCandle[] {
  if (bucketSize === 1) return candles;

  const aggregated: FuturesMockCandle[] = [];
  for (let index = 0; index + bucketSize <= candles.length; index += bucketSize) {
    const bucket = candles.slice(index, index + bucketSize);
    aggregated.push({
      timestamp: bucket.at(-1)?.timestamp ?? bucket[0].timestamp,
      open: bucket[0].open,
      high: Math.max(...bucket.map((candle) => candle.high)),
      low: Math.min(...bucket.map((candle) => candle.low)),
      close: bucket.at(-1)?.close ?? bucket[0].close,
    });
  }
  return aggregated;
}

function calculateEma(values: number[], period: number): number | null {
  if (values.length < period) return null;

  let ema = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  const multiplier = 2 / (period + 1);
  for (const value of values.slice(period)) {
    ema = (value - ema) * multiplier + ema;
  }
  return ema;
}

function calculateRsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;

  const changes = values.slice(1).map((value, index) => value - values[index]);
  let averageGain = 0;
  let averageLoss = 0;

  for (const change of changes.slice(0, period)) {
    averageGain += Math.max(change, 0) / period;
    averageLoss += Math.max(-change, 0) / period;
  }

  for (const change of changes.slice(period)) {
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
  }

  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
  const relativeStrength = averageGain / averageLoss;
  return 100 - 100 / (1 + relativeStrength);
}

function getRsiZone(rsi: number | null): RsiZone {
  if (rsi === null) return "unavailable";
  if (rsi >= 70) return "overbought";
  if (rsi <= 30) return "oversold";
  return "neutral";
}

function getTrend(closes: number[]): LocalTrendState {
  if (closes.length < 2) return "neutral";

  const fastEma = calculateEma(closes, 9);
  const slowEma = calculateEma(closes, 21);
  if (fastEma !== null && slowEma !== null && slowEma > 0) {
    const spreadPercent = ((fastEma - slowEma) / slowEma) * 100;
    if (spreadPercent >= 0.15) return "bullish";
    if (spreadPercent <= -0.15) return "bearish";
    return "neutral";
  }

  const firstClose = closes[0];
  const lastClose = closes.at(-1) ?? firstClose;
  const changePercent = firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0;
  if (changePercent >= 0.5) return "bullish";
  if (changePercent <= -0.5) return "bearish";
  return "neutral";
}

function getMacd(closes: number[]): MomentumState {
  const fastEma = calculateEma(closes, 12);
  const slowEma = calculateEma(closes, 26);
  const lastClose = closes.at(-1) ?? 0;
  if (fastEma === null || slowEma === null || lastClose <= 0) return "unavailable";

  const spreadPercent = ((fastEma - slowEma) / lastClose) * 100;
  if (spreadPercent >= 0.05) return "positive";
  if (spreadPercent <= -0.05) return "negative";
  return "neutral";
}

function getEmaStructure(closes: number[]): string {
  const fastEma = calculateEma(closes, 9);
  const slowEma = calculateEma(closes, 21);
  if (fastEma === null || slowEma === null) return "Unavailable (limited sample)";
  if (fastEma > slowEma) return "EMA 9 above EMA 21";
  if (fastEma < slowEma) return "EMA 9 below EMA 21";
  return "EMA 9 aligned with EMA 21";
}

function analyzeTimeframe(
  candles: FuturesMockCandle[],
  timeframe: AnalysisTimeframe,
): LocalTimeframeSnapshot {
  const closes = candles.map((candle) => candle.close);
  const rsi = calculateRsi(closes);

  return {
    timeframe,
    trend: getTrend(closes),
    rsi: rsi === null ? null : Number(rsi.toFixed(1)),
    rsiZone: getRsiZone(rsi),
    macd: getMacd(closes),
    emaStructure: getEmaStructure(closes),
    volumeAnomaly: "unavailable",
  };
}

export function analyzeLocalTimeframes(
  coinId: string,
  symbol: string,
  scenario: FuturesTestScenario,
): LocalCoinTimeframeAnalysis | null {
  const futuresSymbol = FUTURES_SYMBOL_BY_COIN_ID[coinId];
  if (!futuresSymbol) return null;

  const baseCandles = getMock15mCandles(futuresSymbol, scenario);
  return {
    coinId,
    symbol,
    futuresSymbol,
    source: "local/mock",
    timeframes: TIMEFRAME_BUCKETS.map(({ timeframe, size }) =>
      analyzeTimeframe(aggregateCandles(baseCandles, size), timeframe),
    ),
  };
}
