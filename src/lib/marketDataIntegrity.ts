import {
  getMock15mCandles,
  type FuturesMockCandle,
  type FuturesSymbol,
  type FuturesTestScenario,
} from "@/lib/futuresPaperEngine";

export type CandleTimeframe = "15m";
export type MarketDataSource = "LIVE_READ_ONLY" | "MOCK_LOCAL" | "SYNTHETIC_TEST";
export type DataFreshnessStatus = "current" | "delayed" | "stale" | "unknown";
export type DataReadinessStatus = "ready" | "ready_with_warnings" | "blocked";
export type CandleAnomalyType =
  | "zero_price"
  | "negative_price"
  | "impossible_wick"
  | "extreme_move"
  | "flatline"
  | "missing_volume";

export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  source: MarketDataSource;
  symbol: string;
  timeframe: CandleTimeframe;
}

export interface CandleGap {
  expectedTimestamp: string;
  previousTimestamp: string;
  gapDurationMs: number;
}

export interface CandleAnomaly {
  type: CandleAnomalyType;
  candleIndex: number;
  timestamp: string;
  description: string;
}

export interface ReadinessFlags {
  basicSignal: boolean;
  ema: boolean;
  rsi: boolean;
  backtest: boolean;
  multiTimeframe: boolean;
}

export interface IntegrityChecks {
  shapeValid: boolean;
  ohlcConsistent: boolean;
  timestampOrdered: boolean;
  intervalValid: boolean;
  freshnessOk: boolean;
  sampleSizeOk: boolean;
}

export interface MarketDataIntegrityReport {
  id: string;
  createdAt: string;
  symbol: string;
  timeframe: CandleTimeframe;
  source: MarketDataSource;
  candleCount: number;
  latestCandleTime: string | null;
  latestCandleAgeMs: number | null;
  freshnessStatus: DataFreshnessStatus;
  gapCount: number;
  gaps: CandleGap[];
  anomalyCount: number;
  anomalies: CandleAnomaly[];
  integrityScore: number;
  readinessStatus: DataReadinessStatus;
  readinessFlags: ReadinessFlags;
  warnings: string[];
  checks: IntegrityChecks;
}

export interface MarketDataIntegrityFactor {
  id: string;
  factor: string;
  effect: "positive" | "negative" | "neutral";
  pointsImpact: number;
  reason: string;
}

export const MARKET_DATA_INTEGRITY_LATEST_STORAGE_KEY = "chanter-market-data-integrity-latest";
export const MARKET_DATA_INTEGRITY_HISTORY_STORAGE_KEY = "chanter-market-data-integrity-history";
export const MAX_MARKET_DATA_INTEGRITY_HISTORY = 100;

const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const FRESHNESS_CURRENT_MS = 5 * 60 * 1000;
const FRESHNESS_DELAYED_MS = 15 * 60 * 1000;
const MIN_SAMPLE_BASIC_SIGNAL = 10;
const MIN_SAMPLE_EMA = 26;
const MIN_SAMPLE_RSI = 14;
const MIN_SAMPLE_BACKTEST = 48;
const MIN_SAMPLE_MULTI_TIMEFRAME = 96;
const EXTREME_MOVE_THRESHOLD_PERCENT = 15;

const SUPPORTED_TIMEFRAMES = new Set<string>(["15m"]);
const SUPPORTED_SOURCES = new Set<string>(["LIVE_READ_ONLY", "MOCK_LOCAL", "SYNTHETIC_TEST"]);
const SUPPORTED_FRESHNESS = new Set<string>(["current", "delayed", "stale", "unknown"]);
const SUPPORTED_READINESS = new Set<string>(["ready", "ready_with_warnings", "blocked"]);
const SUPPORTED_ANOMALY_TYPES = new Set<string>([
  "zero_price", "negative_price", "impossible_wick",
  "extreme_move", "flatline", "missing_volume",
]);
const SUPPORTED_SYMBOLS = new Set<string>(["BTCUSDT", "ETHUSDT", "SOLUSDT", "ADAUSDT", "AVAXUSDT"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function isCandleTimeframe(value: unknown): value is CandleTimeframe {
  return typeof value === "string" && SUPPORTED_TIMEFRAMES.has(value);
}

export function isMarketDataSource(value: unknown): value is MarketDataSource {
  return typeof value === "string" && SUPPORTED_SOURCES.has(value as MarketDataSource);
}

export function isSupportedSymbol(value: unknown): value is string {
  return typeof value === "string" && SUPPORTED_SYMBOLS.has(value);
}

export function wrapMockCandles(
  candles: FuturesMockCandle[],
  symbol: string,
  source: MarketDataSource = "MOCK_LOCAL",
  timeframe: CandleTimeframe = "15m",
): Candle[] {
  return candles.map((candle) => ({
    timestamp: candle.timestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    source,
    symbol,
    timeframe,
  }));
}

interface EvaluateInput {
  candles: Candle[];
  symbol: string;
  timeframe: CandleTimeframe;
  source: MarketDataSource;
  now?: string;
}

function validateCandleShape(candles: Candle[]): boolean {
  return candles.every((candle) =>
    typeof candle.timestamp === "string" && candle.timestamp.trim() !== "" &&
    isFiniteNumber(candle.open) &&
    isFiniteNumber(candle.high) &&
    isFiniteNumber(candle.low) &&
    isFiniteNumber(candle.close) &&
    typeof candle.source === "string" &&
    typeof candle.symbol === "string" &&
    typeof candle.timeframe === "string" &&
    (candle.volume === undefined || isFiniteNumber(candle.volume)),
  );
}

function validateOhlcConsistency(candles: Candle[]): { valid: boolean; anomalies: CandleAnomaly[] } {
  const anomalies: CandleAnomaly[] = [];
  let valid = true;

  for (let i = 0; i < candles.length; i += 1) {
    const c = candles[i];
    if (c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0) {
      valid = false;
      anomalies.push({
        type: c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0 ? "zero_price" : "negative_price",
        candleIndex: i,
        timestamp: c.timestamp,
        description: `Candle ${i} has a non-positive price (O:${c.open} H:${c.high} L:${c.low} C:${c.close}).`,
      });
      continue;
    }
    if (c.high < c.open || c.high < c.close || c.high < c.low) {
      valid = false;
      anomalies.push({
        type: "impossible_wick",
        candleIndex: i,
        timestamp: c.timestamp,
        description: `Candle ${i} high (${c.high}) is below open, close, or low.`,
      });
    }
    if (c.low > c.open || c.low > c.close || c.low > c.high) {
      valid = false;
      anomalies.push({
        type: "impossible_wick",
        candleIndex: i,
        timestamp: c.timestamp,
        description: `Candle ${i} low (${c.low}) is above open, close, or high.`,
      });
    }
  }

  return { valid, anomalies };
}

function validateTimestampOrdering(candles: Candle[]): { ordered: boolean; duplicates: number; backward: number } {
  let ordered = true;
  let duplicates = 0;
  let backward = 0;

  for (let i = 1; i < candles.length; i += 1) {
    const prev = Date.parse(candles[i - 1].timestamp);
    const curr = Date.parse(candles[i].timestamp);
    if (Number.isNaN(prev) || Number.isNaN(curr)) {
      ordered = false;
      continue;
    }
    if (curr === prev) {
      duplicates += 1;
      ordered = false;
    }
    if (curr < prev) {
      backward += 1;
      ordered = false;
    }
  }

  return { ordered, duplicates, backward };
}

function detectGaps(candles: Candle[], timeframe: CandleTimeframe): CandleGap[] {
  if (timeframe !== "15m" || candles.length < 2) return [];
  const gaps: CandleGap[] = [];

  for (let i = 1; i < candles.length; i += 1) {
    const prev = Date.parse(candles[i - 1].timestamp);
    const curr = Date.parse(candles[i].timestamp);
    if (Number.isNaN(prev) || Number.isNaN(curr)) continue;

    const diff = curr - prev;
    if (diff > FIFTEEN_MIN_MS + 1000) {
      const missingCount = Math.round(diff / FIFTEEN_MIN_MS) - 1;
      for (let g = 1; g <= missingCount; g += 1) {
        const expectedTs = new Date(prev + g * FIFTEEN_MIN_MS).toISOString();
        gaps.push({
          expectedTimestamp: expectedTs,
          previousTimestamp: candles[i - 1].timestamp,
          gapDurationMs: diff,
        });
      }
    }
  }

  return gaps;
}

function checkFreshness(
  latestCandleTime: string | null,
  now: number,
): { status: DataFreshnessStatus; ageMs: number | null; ok: boolean } {
  if (!latestCandleTime) {
    return { status: "unknown", ageMs: null, ok: false };
  }
  const candleMs = Date.parse(latestCandleTime);
  if (Number.isNaN(candleMs)) {
    return { status: "unknown", ageMs: null, ok: false };
  }
  const ageMs = now - candleMs;
  if (ageMs < 0) {
    return { status: "unknown", ageMs: null, ok: false };
  }
  if (ageMs <= FRESHNESS_CURRENT_MS) {
    return { status: "current", ageMs, ok: true };
  }
  if (ageMs <= FRESHNESS_DELAYED_MS) {
    return { status: "delayed", ageMs, ok: true };
  }
  return { status: "stale", ageMs, ok: false };
}

function checkSampleSize(count: number): ReadinessFlags {
  return {
    basicSignal: count >= MIN_SAMPLE_BASIC_SIGNAL,
    ema: count >= MIN_SAMPLE_EMA,
    rsi: count >= MIN_SAMPLE_RSI,
    backtest: count >= MIN_SAMPLE_BACKTEST,
    multiTimeframe: count >= MIN_SAMPLE_MULTI_TIMEFRAME,
  };
}

function detectAnomalies(candles: Candle[]): CandleAnomaly[] {
  const anomalies: CandleAnomaly[] = [];

  for (let i = 0; i < candles.length; i += 1) {
    const c = candles[i];

    if (c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0) {
      const hasZero = c.open === 0 || c.high === 0 || c.low === 0 || c.close === 0;
      anomalies.push({
        type: hasZero ? "zero_price" : "negative_price",
        candleIndex: i,
        timestamp: c.timestamp,
        description: `Candle ${i} has a ${hasZero ? "zero" : "negative"} price value.`,
      });
      continue;
    }

    if (c.high < Math.max(c.open, c.close, c.low) || c.low > Math.min(c.open, c.close, c.high)) {
      anomalies.push({
        type: "impossible_wick",
        candleIndex: i,
        timestamp: c.timestamp,
        description: `Candle ${i} has an impossible wick: O:${c.open} H:${c.high} L:${c.low} C:${c.close}.`,
      });
    }

    if (i > 0) {
      const prev = candles[i - 1];
      const changePercent = prev.close > 0
        ? Math.abs((c.close - prev.close) / prev.close) * 100
        : 0;
      if (changePercent > EXTREME_MOVE_THRESHOLD_PERCENT) {
        anomalies.push({
          type: "extreme_move",
          candleIndex: i,
          timestamp: c.timestamp,
        description: `Candle ${i} moved ${changePercent.toFixed(2)}% from the previous close (${prev.close} to ${c.close}).`,
        });
      }
    }

    if (c.open === c.high && c.high === c.low && c.low === c.close && c.open > 0) {
      anomalies.push({
        type: "flatline",
        candleIndex: i,
        timestamp: c.timestamp,
        description: `Candle ${i} is flatlined at ${c.open} (OHLC identical).`,
      });
    }

    if (c.volume !== undefined && c.volume === 0) {
      anomalies.push({
        type: "missing_volume",
        candleIndex: i,
        timestamp: c.timestamp,
        description: `Candle ${i} has zero volume where volume was expected.`,
      });
    }
  }

  return anomalies;
}

function calculateIntegrityScore(
  checks: IntegrityChecks,
  anomalyCount: number,
  gapCount: number,
  freshness: DataFreshnessStatus,
  source: MarketDataSource,
): number {
  let score = 100;

  if (!checks.shapeValid) score -= 30;
  if (!checks.ohlcConsistent) score -= 25;
  if (!checks.timestampOrdered) score -= 15;
  if (!checks.intervalValid) score -= 10;

  score -= Math.min(25, gapCount * 5);
  score -= Math.min(30, anomalyCount * 10);

  if (freshness === "stale") score -= 15;
  else if (freshness === "delayed") score -= 8;
  else if (freshness === "unknown") score -= 10;

  if (source === "MOCK_LOCAL") score -= 10;
  else if (source === "SYNTHETIC_TEST") score -= 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function getReadinessStatus(
  score: number,
  checks: IntegrityChecks,
  source: MarketDataSource,
): DataReadinessStatus {
  if (!checks.ohlcConsistent || !checks.shapeValid) return "blocked";
  if (score < 50) return "blocked";
  if (score < 70) return "ready_with_warnings";
  if (source === "MOCK_LOCAL" || source === "SYNTHETIC_TEST") return "ready_with_warnings";
  return "ready";
}

export function evaluateMarketDataIntegrity(input: EvaluateInput): MarketDataIntegrityReport {
  const { candles, symbol, timeframe, source } = input;
  const now = input.now ? Date.parse(input.now) : Date.now();

  const shapeValid = validateCandleShape(candles);
  const ohlcResult = validateOhlcConsistency(candles);
  const timestampResult = validateTimestampOrdering(candles);
  const gaps = detectGaps(candles, timeframe);
  const anomalies = detectAnomalies(candles);

  const sortedCandles = [...candles].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );
  const latestCandleTime = sortedCandles.length > 0
    ? sortedCandles[sortedCandles.length - 1].timestamp
    : null;
  const freshness = checkFreshness(latestCandleTime, now);
  const readinessFlags = checkSampleSize(candles.length);

  const checks: IntegrityChecks = {
    shapeValid,
    ohlcConsistent: ohlcResult.valid,
    timestampOrdered: timestampResult.ordered,
    intervalValid: gaps.length === 0,
    freshnessOk: freshness.ok,
    sampleSizeOk: readinessFlags.backtest,
  };

  const allAnomalies = [...ohlcResult.anomalies, ...anomalies];
  const integrityScore = calculateIntegrityScore(
    checks,
    allAnomalies.length,
    gaps.length,
    freshness.status,
    source,
  );
  const readinessStatus = getReadinessStatus(integrityScore, checks, source);

  const warnings: string[] = [];
  if (source === "MOCK_LOCAL") {
    warnings.push("Data source is local mock. Not market-grade. Simulation only.");
  }
  if (source === "SYNTHETIC_TEST") {
    warnings.push("Data source is synthetic test data. Not market-grade.");
  }
  if (freshness.status === "stale") {
    warnings.push("Latest candle is stale. Do not label as live-read-only.");
  }
  if (freshness.status === "unknown") {
    warnings.push("Candle freshness could not be determined.");
  }
  if (gaps.length > 0) {
    warnings.push(`${gaps.length} gap(s) detected in the 15m candle sequence.`);
  }
  if (allAnomalies.length > 0) {
    warnings.push(`${allAnomalies.length} anomaly/anomalies detected.`);
  }
  if (!readinessFlags.backtest) {
    warnings.push(`Insufficient samples for backtest (need ${MIN_SAMPLE_BACKTEST}, have ${candles.length}).`);
  }
  if (!readinessFlags.multiTimeframe) {
    warnings.push(`Insufficient samples for multi-timeframe analysis (need ${MIN_SAMPLE_MULTI_TIMEFRAME}, have ${candles.length}).`);
  }

  const configHash = hashText(
    `${symbol}|${timeframe}|${source}|${candles.length}|${latestCandleTime ?? "none"}|${input.now ?? now}`,
  );

  return {
    id: `integrity-${configHash}`,
    createdAt: new Date(now).toISOString(),
    symbol,
    timeframe,
    source,
    candleCount: candles.length,
    latestCandleTime,
    latestCandleAgeMs: freshness.ageMs,
    freshnessStatus: freshness.status,
    gapCount: gaps.length,
    gaps: gaps.slice(0, 20),
    anomalyCount: allAnomalies.length,
    anomalies: allAnomalies.slice(0, 20),
    integrityScore,
    readinessStatus,
    readinessFlags,
    warnings,
    checks,
  };
}

export function getMarketDataIntegrityFactors(
  report: MarketDataIntegrityReport | null,
): MarketDataIntegrityFactor[] {
  if (!report) return [];
  const factors: MarketDataIntegrityFactor[] = [];

  factors.push({
    id: "data-integrity-score",
    factor: "Data Integrity Score",
    effect: report.integrityScore >= 70 ? "positive" : report.integrityScore >= 50 ? "neutral" : "negative",
    pointsImpact: report.integrityScore >= 70 ? 5 : report.integrityScore >= 50 ? 0 : -15,
    reason: `Integrity score is ${report.integrityScore}/100 (${report.readinessStatus}).`,
  });

  factors.push({
    id: "data-freshness",
    factor: "Data Freshness",
    effect: report.freshnessStatus === "current" ? "positive" : report.freshnessStatus === "stale" ? "negative" : "neutral",
    pointsImpact: report.freshnessStatus === "current" ? 3 : report.freshnessStatus === "stale" ? -8 : 0,
    reason: `Latest candle freshness: ${report.freshnessStatus}.`,
  });

  if (report.source === "MOCK_LOCAL" || report.source === "SYNTHETIC_TEST") {
    factors.push({
      id: "mock-local-warning",
      factor: "Mock / Local Data",
      effect: "negative",
      pointsImpact: -5,
      reason: `Data source is ${report.source}. Not market-grade.`,
    });
  }

  if (report.gapCount > 0) {
    factors.push({
      id: "gap-penalty",
      factor: "Candle Gaps",
      effect: "negative",
      pointsImpact: -Math.min(10, report.gapCount * 2),
      reason: `${report.gapCount} gap(s) detected in candle sequence.`,
    });
  }

  if (report.anomalyCount > 0) {
    factors.push({
      id: "anomaly-penalty",
      factor: "Candle Anomalies",
      effect: "negative",
      pointsImpact: -Math.min(10, report.anomalyCount * 3),
      reason: `${report.anomalyCount} anomaly/anomalies found.`,
    });
  }

  return factors;
}

export function runIntegrityCheckForMock(
  symbol: FuturesSymbol,
  scenario: FuturesTestScenario,
  now?: string,
): MarketDataIntegrityReport {
  const mockCandles = getMock15mCandles(symbol, scenario);
  const candles = wrapMockCandles(mockCandles, symbol, "MOCK_LOCAL", "15m");
  return evaluateMarketDataIntegrity({
    candles,
    symbol,
    timeframe: "15m",
    source: "MOCK_LOCAL",
    now,
  });
}

function normalizeCandleGap(value: unknown): CandleGap | null {
  if (!isRecord(value)) return null;
  if (
    !isValidDate(value.expectedTimestamp) ||
    !isValidDate(value.previousTimestamp) ||
    !isFiniteNumber(value.gapDurationMs) ||
    value.gapDurationMs <= 0
  ) {
    return null;
  }
  return {
    expectedTimestamp: value.expectedTimestamp as string,
    previousTimestamp: value.previousTimestamp as string,
    gapDurationMs: value.gapDurationMs as number,
  };
}

function normalizeCandleAnomaly(value: unknown): CandleAnomaly | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.type !== "string" ||
    !SUPPORTED_ANOMALY_TYPES.has(value.type) ||
    !isFiniteNumber(value.candleIndex) ||
    value.candleIndex < 0 ||
    !isValidDate(value.timestamp) ||
    typeof value.description !== "string" ||
    value.description.trim() === ""
  ) {
    return null;
  }
  return {
    type: value.type as CandleAnomalyType,
    candleIndex: value.candleIndex as number,
    timestamp: value.timestamp as string,
    description: value.description as string,
  };
}

export function normalizeMarketDataIntegrityReport(value: unknown): MarketDataIntegrityReport | null {
  if (!isRecord(value) || !isValidDate(value.createdAt)) return null;

  if (
    typeof value.id !== "string" || value.id.trim() === "" ||
    typeof value.symbol !== "string" || !SUPPORTED_SYMBOLS.has(value.symbol) ||
    typeof value.timeframe !== "string" || !SUPPORTED_TIMEFRAMES.has(value.timeframe) ||
    typeof value.source !== "string" || !SUPPORTED_SOURCES.has(value.source) ||
    !isFiniteNumber(value.candleCount) || value.candleCount < 0 ||
    !(value.latestCandleTime === null || isValidDate(value.latestCandleTime)) ||
    !(value.latestCandleAgeMs === null || (isFiniteNumber(value.latestCandleAgeMs) && value.latestCandleAgeMs >= 0)) ||
    typeof value.freshnessStatus !== "string" || !SUPPORTED_FRESHNESS.has(value.freshnessStatus) ||
    !isFiniteNumber(value.gapCount) || value.gapCount < 0 ||
    !Array.isArray(value.gaps) ||
    !isFiniteNumber(value.anomalyCount) || value.anomalyCount < 0 ||
    !Array.isArray(value.anomalies) ||
    !isFiniteNumber(value.integrityScore) || value.integrityScore < 0 || value.integrityScore > 100 ||
    typeof value.readinessStatus !== "string" || !SUPPORTED_READINESS.has(value.readinessStatus) ||
    !isRecord(value.readinessFlags) ||
    typeof value.readinessFlags.basicSignal !== "boolean" ||
    typeof value.readinessFlags.ema !== "boolean" ||
    typeof value.readinessFlags.rsi !== "boolean" ||
    typeof value.readinessFlags.backtest !== "boolean" ||
    typeof value.readinessFlags.multiTimeframe !== "boolean" ||
    !Array.isArray(value.warnings) ||
    !value.warnings.every((w: unknown) => typeof w === "string") ||
    !isRecord(value.checks) ||
    typeof value.checks.shapeValid !== "boolean" ||
    typeof value.checks.ohlcConsistent !== "boolean" ||
    typeof value.checks.timestampOrdered !== "boolean" ||
    typeof value.checks.intervalValid !== "boolean" ||
    typeof value.checks.freshnessOk !== "boolean" ||
    typeof value.checks.sampleSizeOk !== "boolean"
  ) {
    return null;
  }

  const gaps = value.gaps.map(normalizeCandleGap);
  if (gaps.some((g: CandleGap | null) => g === null)) return null;
  const anomalies = value.anomalies.map(normalizeCandleAnomaly);
  if (anomalies.some((a: CandleAnomaly | null) => a === null)) return null;

  const report: MarketDataIntegrityReport = {
    id: value.id as string,
    createdAt: value.createdAt as string,
    symbol: value.symbol as string,
    timeframe: value.timeframe as CandleTimeframe,
    source: value.source as MarketDataSource,
    candleCount: value.candleCount as number,
    latestCandleTime: value.latestCandleTime as string | null,
    latestCandleAgeMs: value.latestCandleAgeMs as number | null,
    freshnessStatus: value.freshnessStatus as DataFreshnessStatus,
    gapCount: value.gapCount as number,
    gaps: gaps as CandleGap[],
    anomalyCount: value.anomalyCount as number,
    anomalies: anomalies as CandleAnomaly[],
    integrityScore: value.integrityScore as number,
    readinessStatus: value.readinessStatus as DataReadinessStatus,
    readinessFlags: {
      basicSignal: value.readinessFlags.basicSignal as boolean,
      ema: value.readinessFlags.ema as boolean,
      rsi: value.readinessFlags.rsi as boolean,
      backtest: value.readinessFlags.backtest as boolean,
      multiTimeframe: value.readinessFlags.multiTimeframe as boolean,
    },
    warnings: value.warnings as string[],
    checks: {
      shapeValid: value.checks.shapeValid as boolean,
      ohlcConsistent: value.checks.ohlcConsistent as boolean,
      timestampOrdered: value.checks.timestampOrdered as boolean,
      intervalValid: value.checks.intervalValid as boolean,
      freshnessOk: value.checks.freshnessOk as boolean,
      sampleSizeOk: value.checks.sampleSizeOk as boolean,
    },
  };

  const expectedGapLength = Math.min(report.gapCount, 20);
  const expectedAnomalyLength = Math.min(report.anomalyCount, 20);
  if (report.gaps.length !== expectedGapLength) {
    return null;
  }
  if (report.anomalies.length !== expectedAnomalyLength) {
    return null;
  }

  return report;
}

export function loadMarketDataIntegrityHistory(): MarketDataIntegrityReport[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(MARKET_DATA_INTEGRITY_HISTORY_STORAGE_KEY) ?? "[]",
    );
    if (!Array.isArray(parsed)) return [];
    const seenIds = new Set<string>();
    return parsed
      .map(normalizeMarketDataIntegrityReport)
      .filter((report): report is MarketDataIntegrityReport => {
        if (!report || seenIds.has(report.id)) return false;
        seenIds.add(report.id);
        return true;
      })
      .slice(0, MAX_MARKET_DATA_INTEGRITY_HISTORY);
  } catch {
    return [];
  }
}

export function loadLatestMarketDataIntegrity(): MarketDataIntegrityReport | null {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(MARKET_DATA_INTEGRITY_LATEST_STORAGE_KEY) ?? "null",
    );
    return normalizeMarketDataIntegrityReport(parsed) ??
      loadMarketDataIntegrityHistory()[0] ?? null;
  } catch {
    return loadMarketDataIntegrityHistory()[0] ?? null;
  }
}

export function saveMarketDataIntegrityHistory(
  history: MarketDataIntegrityReport[],
): boolean {
  const normalized = history.map(normalizeMarketDataIntegrityReport);
  if (normalized.some((r) => r === null)) return false;
  const reports = normalized.filter(
    (r): r is MarketDataIntegrityReport => r !== null,
  );
  if (new Set(reports.map((r) => r.id)).size !== reports.length) return false;
  const capped = reports.slice(0, MAX_MARKET_DATA_INTEGRITY_HISTORY);
  try {
    localStorage.setItem(
      MARKET_DATA_INTEGRITY_HISTORY_STORAGE_KEY,
      JSON.stringify(capped),
    );
    if (capped[0]) {
      localStorage.setItem(
        MARKET_DATA_INTEGRITY_LATEST_STORAGE_KEY,
        JSON.stringify(capped[0]),
      );
    } else {
      localStorage.removeItem(MARKET_DATA_INTEGRITY_LATEST_STORAGE_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

export function clearMarketDataIntegrityHistory(): boolean {
  try {
    localStorage.removeItem(MARKET_DATA_INTEGRITY_HISTORY_STORAGE_KEY);
    localStorage.removeItem(MARKET_DATA_INTEGRITY_LATEST_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}