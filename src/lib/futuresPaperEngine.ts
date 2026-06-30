import type { PaperRiskSettings } from "@/lib/paperRiskController";

export type FuturesSymbol = "BTCUSDT" | "ETHUSDT" | "SOLUSDT" | "ADAUSDT" | "AVAXUSDT";
export type FuturesTestScenario =
  | "Neutral / Current Mock"
  | "Trending Up"
  | "Trending Down"
  | "Breakout Up"
  | "Breakout Down"
  | "Mean Reversion Oversold"
  | "Mean Reversion Overbought"
  | "Choppy / No Trade";
export type FuturesDirection = "LONG" | "SHORT";
export type FuturesPositionState = FuturesDirection | "FLAT";
export type FuturesLeverage = 1 | 2 | 3 | 5;
export type FuturesRiskDecisionType = "APPROVED" | "BLOCKED" | "WAIT";

export interface FuturesMockCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface FuturesPaperSettings {
  timeframe: "15m";
  marginMode: "isolated";
  maxDailyLossPercent: number;
  dailyLossDate: string | null;
  realizedLossToday: number;
}

export interface FuturesPaperTradeInput {
  symbol: FuturesSymbol;
  scenario: FuturesTestScenario;
  direction: FuturesDirection;
  entryPrice: number;
  marginAmount: number;
  leverage: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  strategyReason: string;
}

export interface FuturesPaperPosition extends FuturesPaperTradeInput {
  id: string;
  leverage: FuturesLeverage;
  timeframe: "15m";
  marginMode: "isolated";
  openedAt: string;
}

export interface FuturesPaperHistoryRecord extends FuturesPaperPosition {
  recordId: string;
  positionId: string;
  action: "OPEN" | "CLOSE";
  timestamp: string;
  markPrice: number;
  realizedPnl: number;
  leveragedReturnPercent: number;
}

export interface FuturesRiskPreview {
  symbol: FuturesSymbol;
  direction: FuturesDirection;
  leverage: number;
  marginAmount: number;
  notionalSize: number;
  liquidationPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  estimatedLossAtStop: number;
  estimatedGainAtTarget: number;
  riskRewardRatio: number;
  unrealizedPnl: number;
  leveragedReturnPercent: number;
  decision: FuturesRiskDecisionType;
  reason: string;
}

interface EvaluateFuturesRiskInput {
  trade: FuturesPaperTradeInput;
  markPrice: number;
  openPositions: FuturesPaperPosition[];
  history: FuturesPaperHistoryRecord[];
  futuresSettings: FuturesPaperSettings;
  riskSettings: PaperRiskSettings;
  paperPortfolioValue: number;
  now?: string;
}

export const FUTURES_PAPER_SETTINGS_STORAGE_KEY = "chanter-futures-paper-settings";
export const FUTURES_PAPER_POSITIONS_STORAGE_KEY = "chanter-futures-paper-positions";
export const FUTURES_PAPER_HISTORY_STORAGE_KEY = "chanter-futures-paper-history";
export const FUTURES_TEST_SCENARIO_STORAGE_KEY = "chanter-futures-test-scenario";
export const MAX_FUTURES_PAPER_HISTORY = 100;
export const SUPPORTED_FUTURES_SYMBOLS: FuturesSymbol[] = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "ADAUSDT",
  "AVAXUSDT",
];
export const SUPPORTED_FUTURES_LEVERAGE: FuturesLeverage[] = [1, 2, 3, 5];
export const SUPPORTED_FUTURES_TEST_SCENARIOS: FuturesTestScenario[] = [
  "Neutral / Current Mock",
  "Trending Up",
  "Trending Down",
  "Breakout Up",
  "Breakout Down",
  "Mean Reversion Oversold",
  "Mean Reversion Overbought",
  "Choppy / No Trade",
];
export const DEFAULT_FUTURES_TEST_SCENARIO: FuturesTestScenario = "Neutral / Current Mock";
export const DEFAULT_FUTURES_PAPER_SETTINGS: FuturesPaperSettings = {
  timeframe: "15m",
  marginMode: "isolated",
  maxDailyLossPercent: 5,
  dailyLossDate: null,
  realizedLossToday: 0,
};

const SUPPORTED_SYMBOL_SET = new Set<string>(SUPPORTED_FUTURES_SYMBOLS);
const SUPPORTED_LEVERAGE_SET = new Set<number>(SUPPORTED_FUTURES_LEVERAGE);
const DIRECTIONS = new Set<FuturesDirection>(["LONG", "SHORT"]);
const FUTURES_TEST_SCENARIO_SET = new Set<FuturesTestScenario>(
  SUPPORTED_FUTURES_TEST_SCENARIOS,
);
const MOCK_CANDLE_COUNT = 96;
const MOCK_CANDLE_END_UTC = Date.UTC(2026, 5, 30, 0, 0, 0);
const MIN_LIQUIDATION_STOP_BUFFER_PERCENT = 1;
const MOCK_BASE_PRICES: Record<FuturesSymbol, number> = {
  BTCUSDT: 97_245.32,
  ETHUSDT: 3_876.15,
  SOLUSDT: 218.47,
  ADAUSDT: 1.24,
  AVAXUSDT: 42.18,
};
const MOCK_VOLATILITY: Record<FuturesSymbol, number> = {
  BTCUSDT: 0.0025,
  ETHUSDT: 0.0032,
  SOLUSDT: 0.0048,
  ADAUSDT: 0.0042,
  AVAXUSDT: 0.0046,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isValidUtcDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isFuturesSymbol(value: unknown): value is FuturesSymbol {
  return typeof value === "string" && SUPPORTED_SYMBOL_SET.has(value);
}

function isFuturesDirection(value: unknown): value is FuturesDirection {
  return typeof value === "string" && DIRECTIONS.has(value as FuturesDirection);
}

function isFuturesLeverage(value: unknown): value is FuturesLeverage {
  return isFiniteNumber(value) && SUPPORTED_LEVERAGE_SET.has(value);
}

export function isFuturesTestScenario(value: unknown): value is FuturesTestScenario {
  return typeof value === "string" &&
    FUTURES_TEST_SCENARIO_SET.has(value as FuturesTestScenario);
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function roundPrice(value: number): number {
  if (value >= 1_000) return Number(value.toFixed(2));
  if (value >= 10) return Number(value.toFixed(4));
  return Number(value.toFixed(6));
}

function getNeutralMock15mCandles(symbol: FuturesSymbol): FuturesMockCandle[] {
  const basePrice = MOCK_BASE_PRICES[symbol];
  const volatility = MOCK_VOLATILITY[symbol];
  const symbolOffset = SUPPORTED_FUTURES_SYMBOLS.indexOf(symbol) + 1;
  let previousClose = basePrice * (1 - volatility * 2);

  return Array.from({ length: MOCK_CANDLE_COUNT }, (_, index) => {
    const wave = Math.sin(index * 0.41 + symbolOffset) * volatility;
    const counterWave = Math.cos(index * 0.17 + symbolOffset * 0.7) * volatility * 0.55;
    const drift = volatility * 0.025;
    const open = previousClose;
    const close = Math.max(0.000001, open * (1 + wave + counterWave + drift));
    const wick = Math.max(Math.abs(close - open) * 0.4, open * volatility * 0.35);
    const timestamp = new Date(
      MOCK_CANDLE_END_UTC - (MOCK_CANDLE_COUNT - 1 - index) * 15 * 60 * 1000,
    ).toISOString();

    previousClose = close;
    return {
      timestamp,
      open: roundPrice(open),
      high: roundPrice(Math.max(open, close) + wick),
      low: roundPrice(Math.max(0.000001, Math.min(open, close) - wick)),
      close: roundPrice(close),
    };
  });
}

function buildScenarioCandles(
  symbol: FuturesSymbol,
  neutralCandles: FuturesMockCandle[],
  scenario: FuturesTestScenario,
): FuturesMockCandle[] {
  if (scenario === DEFAULT_FUTURES_TEST_SCENARIO) return neutralCandles;

  const basePrice = MOCK_BASE_PRICES[symbol];
  const volatility = MOCK_VOLATILITY[symbol];
  const closes = neutralCandles.map((candle) => candle.close);

  if (scenario === "Trending Up" || scenario === "Trending Down") {
    const direction = scenario === "Trending Up" ? 1 : -1;
    for (let index = 0; index < closes.length; index += 1) {
      const progress = index / (closes.length - 1);
      const wave = Math.sin(index * 0.55) * volatility * 0.25;
      closes[index] = basePrice * (1 + direction * progress * 0.12 + wave);
    }
  } else if (scenario === "Breakout Up" || scenario === "Breakout Down") {
    const direction = scenario === "Breakout Up" ? 1 : -1;
    for (let index = 0; index < closes.length - 1; index += 1) {
      closes[index] = basePrice * (
        1 + Math.sin(index * 0.62) * volatility * 0.7 +
        Math.cos(index * 0.21) * volatility * 0.3
      );
    }
    const priorCloses = closes.slice(0, -1);
    closes[closes.length - 1] = direction > 0
      ? Math.max(...priorCloses) * 1.025
      : Math.min(...priorCloses) * 0.975;
  } else if (
    scenario === "Mean Reversion Oversold" ||
    scenario === "Mean Reversion Overbought"
  ) {
    const direction = scenario === "Mean Reversion Oversold" ? -1 : 1;
    for (let index = 0; index < closes.length; index += 1) {
      const tailProgress = index >= closes.length - 8
        ? (index - (closes.length - 8) + 1) / 8
        : 0;
      closes[index] = basePrice * (
        1 + Math.sin(index * 0.43) * volatility * 0.5 + direction * tailProgress * 0.06
      );
    }
  } else {
    for (let index = 0; index < closes.length; index += 1) {
      closes[index] = basePrice * (
        1 + Math.sin(index * 1.7) * volatility * 0.35 +
        Math.cos(index * 2.3) * volatility * 0.2
      );
    }
  }

  return neutralCandles.map((candle, index) => {
    const open = index === 0 ? closes[0] : closes[index - 1];
    const close = Math.max(0.000001, closes[index]);
    const wick = Math.max(Math.abs(close - open) * 0.25, basePrice * volatility * 0.18);
    return {
      timestamp: candle.timestamp,
      open: roundPrice(open),
      high: roundPrice(Math.max(open, close) + wick),
      low: roundPrice(Math.max(0.000001, Math.min(open, close) - wick)),
      close: roundPrice(close),
    };
  });
}

export function getMock15mCandles(
  symbol: FuturesSymbol,
  scenario: FuturesTestScenario = DEFAULT_FUTURES_TEST_SCENARIO,
): FuturesMockCandle[] {
  const neutralCandles = getNeutralMock15mCandles(symbol);
  return buildScenarioCandles(
    symbol,
    neutralCandles,
    isFuturesTestScenario(scenario) ? scenario : DEFAULT_FUTURES_TEST_SCENARIO,
  );
}

export function getFuturesMockMarkPrice(
  symbol: FuturesSymbol,
  scenario: FuturesTestScenario = DEFAULT_FUTURES_TEST_SCENARIO,
): number {
  return getMock15mCandles(symbol, scenario).at(-1)?.close ?? MOCK_BASE_PRICES[symbol];
}

function calculateMetrics(
  trade: FuturesPaperTradeInput,
  markPrice: number,
): Omit<FuturesRiskPreview, "decision" | "reason"> {
  const notionalSize = trade.marginAmount * trade.leverage;
  const quantity = trade.entryPrice > 0 ? notionalSize / trade.entryPrice : 0;
  const directionMultiplier = trade.direction === "LONG" ? 1 : -1;
  const stopLossPrice = trade.direction === "LONG"
    ? trade.entryPrice * (1 - trade.stopLossPercent / 100)
    : trade.entryPrice * (1 + trade.stopLossPercent / 100);
  const takeProfitPrice = trade.direction === "LONG"
    ? trade.entryPrice * (1 + trade.takeProfitPercent / 100)
    : trade.entryPrice * (1 - trade.takeProfitPercent / 100);
  const liquidationPrice = trade.direction === "LONG"
    ? trade.entryPrice * Math.max(0, 1 - 1 / Math.max(trade.leverage, 1) + 0.005)
    : trade.entryPrice * (1 + 1 / Math.max(trade.leverage, 1) - 0.005);
  const estimatedLossAtStop = Math.abs(stopLossPrice - trade.entryPrice) * quantity;
  const estimatedGainAtTarget = Math.abs(takeProfitPrice - trade.entryPrice) * quantity;
  const unrealizedPnl = (markPrice - trade.entryPrice) * quantity * directionMultiplier;

  return {
    symbol: trade.symbol,
    direction: trade.direction,
    leverage: trade.leverage,
    marginAmount: trade.marginAmount,
    notionalSize,
    liquidationPrice: Math.max(0, liquidationPrice),
    stopLossPrice: Math.max(0, stopLossPrice),
    takeProfitPrice: Math.max(0, takeProfitPrice),
    estimatedLossAtStop,
    estimatedGainAtTarget,
    riskRewardRatio: estimatedLossAtStop > 0
      ? estimatedGainAtTarget / estimatedLossAtStop
      : 0,
    unrealizedPnl,
    leveragedReturnPercent: trade.marginAmount > 0
      ? unrealizedPnl / trade.marginAmount * 100
      : 0,
  };
}

function createPreview(
  trade: FuturesPaperTradeInput,
  markPrice: number,
  decision: FuturesRiskDecisionType,
  reason: string,
): FuturesRiskPreview {
  return {
    ...calculateMetrics(trade, markPrice),
    decision,
    reason,
  };
}

function getUtcDay(timestamp: string): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function getFuturesDailyRealizedLoss(
  history: FuturesPaperHistoryRecord[],
  now = new Date().toISOString(),
  settings?: FuturesPaperSettings,
): number {
  const currentDay = getUtcDay(now);
  const historyLoss = history
    .filter(
      (record) =>
        record.action === "CLOSE" &&
        getUtcDay(record.timestamp) === currentDay &&
        record.realizedPnl < 0,
    )
    .reduce((loss, record) => loss + Math.abs(record.realizedPnl), 0);
  const trackedLoss = settings?.dailyLossDate === currentDay
    ? settings.realizedLossToday
    : 0;
  return Math.max(historyLoss, trackedLoss);
}

export function recordFuturesDailyLoss(
  settings: FuturesPaperSettings,
  realizedPnl: number,
  timestamp = new Date().toISOString(),
): FuturesPaperSettings {
  if (!Number.isFinite(realizedPnl) || realizedPnl >= 0) return settings;
  const lossDate = getUtcDay(timestamp);
  return {
    ...settings,
    dailyLossDate: lossDate,
    realizedLossToday: settings.dailyLossDate === lossDate
      ? settings.realizedLossToday + Math.abs(realizedPnl)
      : Math.abs(realizedPnl),
  };
}

export function evaluateFuturesPaperRisk({
  trade,
  markPrice,
  openPositions,
  history,
  futuresSettings,
  riskSettings,
  paperPortfolioValue,
  now = new Date().toISOString(),
}: EvaluateFuturesRiskInput): FuturesRiskPreview {
  if (!isFuturesSymbol(trade.symbol) || !Number.isFinite(trade.entryPrice) || trade.entryPrice <= 0) {
    return createPreview(trade, markPrice, "WAIT", "Enter a supported symbol and valid entry price.");
  }
  if (!Number.isFinite(markPrice) || markPrice <= 0) {
    return createPreview(trade, 0, "WAIT", "Local 15m mock mark data is unavailable.");
  }
  if (!isFuturesDirection(trade.direction)) {
    return createPreview(trade, markPrice, "BLOCKED", "Select LONG or SHORT direction.");
  }
  if (!isFuturesLeverage(trade.leverage)) {
    return createPreview(trade, markPrice, "BLOCKED", "Leverage must be 1x, 2x, 3x, or 5x and cannot exceed 5x.");
  }
  if (!Number.isFinite(trade.marginAmount) || trade.marginAmount <= 0) {
    return createPreview(trade, markPrice, "BLOCKED", "Margin amount must be greater than zero.");
  }
  if (!Number.isFinite(trade.stopLossPercent) || trade.stopLossPercent <= 0) {
    return createPreview(trade, markPrice, "BLOCKED", "A stop-loss greater than 0% is required.");
  }
  if (trade.stopLossPercent >= 100) {
    return createPreview(trade, markPrice, "BLOCKED", "Stop-loss must be below 100%.");
  }
  if (!Number.isFinite(trade.takeProfitPercent) || trade.takeProfitPercent <= 0) {
    return createPreview(trade, markPrice, "BLOCKED", "Take-profit must be greater than 0%.");
  }
  if (!trade.strategyReason.trim()) {
    return createPreview(trade, markPrice, "BLOCKED", "A strategy reason is required.");
  }
  if (openPositions.some((position) => position.symbol === trade.symbol)) {
    return createPreview(trade, markPrice, "BLOCKED", `Close the existing ${trade.symbol} paper position first.`);
  }

  const metrics = calculateMetrics(trade, markPrice);
  const sizingCapital = paperPortfolioValue > 0
    ? paperPortfolioValue
    : riskSettings.defaultPaperCapital;
  const maxTradeNotional = sizingCapital * riskSettings.maxTradeSizePercent / 100;
  const maxSymbolNotional = sizingCapital * riskSettings.maxAllocationPerCoinPercent / 100;
  const currentSymbolNotional = openPositions
    .filter((position) => position.symbol === trade.symbol)
    .reduce((total, position) => total + position.marginAmount * position.leverage, 0);
  const dailyLoss = getFuturesDailyRealizedLoss(history, now, futuresSettings);
  const dailyLossLimit = sizingCapital * futuresSettings.maxDailyLossPercent / 100;
  const liquidationStopBufferPercent = trade.direction === "LONG"
    ? (metrics.stopLossPrice - metrics.liquidationPrice) / trade.entryPrice * 100
    : (metrics.liquidationPrice - metrics.stopLossPrice) / trade.entryPrice * 100;

  if (dailyLoss >= dailyLossLimit && dailyLoss > 0) {
    return { ...metrics, decision: "BLOCKED", reason: `Maximum daily paper loss of $${dailyLossLimit.toFixed(2)} has been reached.` };
  }
  if (metrics.notionalSize > maxTradeNotional + 0.01) {
    return { ...metrics, decision: "BLOCKED", reason: `Notional size exceeds the Risk Controller trade-size limit of $${maxTradeNotional.toFixed(2)}.` };
  }
  if (currentSymbolNotional + metrics.notionalSize > maxSymbolNotional + 0.01) {
    return { ...metrics, decision: "BLOCKED", reason: `${trade.symbol} exposure exceeds the Risk Controller allocation limit of $${maxSymbolNotional.toFixed(2)}.` };
  }
  if (liquidationStopBufferPercent <= MIN_LIQUIDATION_STOP_BUFFER_PERCENT) {
    return {
      ...metrics,
      decision: "BLOCKED",
      reason: `Estimated liquidation is too close to the stop-loss; keep more than ${MIN_LIQUIDATION_STOP_BUFFER_PERCENT}% entry-price distance.`,
    };
  }

  return {
    ...metrics,
    decision: "APPROVED",
    reason: "Paper setup passes isolated-margin, stop-loss, daily-loss, allocation, and trade-size gates.",
  };
}

export function getFuturesPositionState(
  symbol: FuturesSymbol,
  positions: FuturesPaperPosition[],
): FuturesPositionState {
  return positions.find((position) => position.symbol === symbol)?.direction ?? "FLAT";
}

export function createFuturesPaperPosition(
  trade: FuturesPaperTradeInput,
  preview: FuturesRiskPreview,
  openedAt = new Date().toISOString(),
): FuturesPaperPosition | null {
  if (preview.decision !== "APPROVED" || !isFuturesLeverage(trade.leverage)) return null;

  return {
    ...trade,
    id: createId("futures-position"),
    leverage: trade.leverage,
    strategyReason: trade.strategyReason.trim(),
    timeframe: "15m",
    marginMode: "isolated",
    openedAt,
  };
}

export function createFuturesHistoryRecord(
  position: FuturesPaperPosition,
  action: "OPEN" | "CLOSE",
  markPrice: number,
  timestamp = new Date().toISOString(),
): FuturesPaperHistoryRecord {
  const metrics = calculateMetrics(position, markPrice);
  return {
    ...position,
    recordId: createId("futures-record"),
    positionId: position.id,
    action,
    timestamp,
    markPrice,
    realizedPnl: action === "CLOSE" ? metrics.unrealizedPnl : 0,
    leveragedReturnPercent: action === "CLOSE" ? metrics.leveragedReturnPercent : 0,
  };
}

export function getFuturesPositionMetrics(
  position: FuturesPaperPosition,
  markPrice: number,
): Omit<FuturesRiskPreview, "decision" | "reason"> {
  return calculateMetrics(position, markPrice);
}

export function normalizeFuturesPaperSettings(value: unknown): FuturesPaperSettings | null {
  if (!isRecord(value)) return null;
  if (
    value.timeframe !== "15m" ||
    value.marginMode !== "isolated" ||
    !isFiniteNumber(value.maxDailyLossPercent) ||
    value.maxDailyLossPercent <= 0 ||
    value.maxDailyLossPercent > 100 ||
    (value.dailyLossDate !== undefined &&
      value.dailyLossDate !== null &&
      !isValidUtcDay(value.dailyLossDate)) ||
    (value.realizedLossToday !== undefined &&
      (!isFiniteNumber(value.realizedLossToday) || value.realizedLossToday < 0)) ||
    ((value.dailyLossDate === undefined || value.dailyLossDate === null) &&
      isFiniteNumber(value.realizedLossToday) &&
      value.realizedLossToday > 0)
  ) {
    return null;
  }
  return {
    timeframe: "15m",
    marginMode: "isolated",
    maxDailyLossPercent: value.maxDailyLossPercent,
    dailyLossDate: typeof value.dailyLossDate === "string" ? value.dailyLossDate : null,
    realizedLossToday: isFiniteNumber(value.realizedLossToday) ? value.realizedLossToday : 0,
  };
}

function normalizeTradeFields(value: Record<string, unknown>): FuturesPaperTradeInput | null {
  if (
    !isFuturesSymbol(value.symbol) ||
    (value.scenario !== undefined && !isFuturesTestScenario(value.scenario)) ||
    !isFuturesDirection(value.direction) ||
    !isFiniteNumber(value.entryPrice) ||
    value.entryPrice <= 0 ||
    !isFiniteNumber(value.marginAmount) ||
    value.marginAmount <= 0 ||
    !isFuturesLeverage(value.leverage) ||
    !isFiniteNumber(value.stopLossPercent) ||
    value.stopLossPercent <= 0 ||
    value.stopLossPercent >= 100 ||
    !isFiniteNumber(value.takeProfitPercent) ||
    value.takeProfitPercent <= 0 ||
    typeof value.strategyReason !== "string" ||
    value.strategyReason.trim() === ""
  ) {
    return null;
  }

  return {
    symbol: value.symbol,
    scenario: isFuturesTestScenario(value.scenario)
      ? value.scenario
      : DEFAULT_FUTURES_TEST_SCENARIO,
    direction: value.direction,
    entryPrice: value.entryPrice,
    marginAmount: value.marginAmount,
    leverage: value.leverage,
    stopLossPercent: value.stopLossPercent,
    takeProfitPercent: value.takeProfitPercent,
    strategyReason: value.strategyReason.trim(),
  };
}

export function normalizeFuturesPaperPosition(value: unknown): FuturesPaperPosition | null {
  if (!isRecord(value)) return null;
  const trade = normalizeTradeFields(value);
  if (
    !trade ||
    typeof value.id !== "string" ||
    value.id.trim() === "" ||
    value.timeframe !== "15m" ||
    value.marginMode !== "isolated" ||
    !isValidDate(value.openedAt)
  ) {
    return null;
  }
  return {
    ...trade,
    id: value.id,
    leverage: trade.leverage as FuturesLeverage,
    timeframe: "15m",
    marginMode: "isolated",
    openedAt: value.openedAt,
  };
}

export function normalizeFuturesHistoryRecord(
  value: unknown,
): FuturesPaperHistoryRecord | null {
  if (!isRecord(value)) return null;
  const position = normalizeFuturesPaperPosition(value);
  if (
    !position ||
    typeof value.recordId !== "string" ||
    value.recordId.trim() === "" ||
    typeof value.positionId !== "string" ||
    value.positionId !== position.id ||
    (value.action !== "OPEN" && value.action !== "CLOSE") ||
    !isValidDate(value.timestamp) ||
    !isFiniteNumber(value.markPrice) ||
    value.markPrice <= 0 ||
    !isFiniteNumber(value.realizedPnl) ||
    !isFiniteNumber(value.leveragedReturnPercent) ||
    (value.action === "OPEN" &&
      (value.realizedPnl !== 0 || value.leveragedReturnPercent !== 0))
  ) {
    return null;
  }
  const metrics = calculateMetrics(position, value.markPrice);
  const expectedPnl = value.action === "CLOSE" ? metrics.unrealizedPnl : 0;
  const expectedReturn = value.action === "CLOSE" ? metrics.leveragedReturnPercent : 0;
  const pnlTolerance = Math.max(0.01, Math.abs(expectedPnl) * 1e-8);
  const returnTolerance = Math.max(0.0001, Math.abs(expectedReturn) * 1e-8);
  if (
    Math.abs(value.realizedPnl - expectedPnl) > pnlTolerance ||
    Math.abs(value.leveragedReturnPercent - expectedReturn) > returnTolerance
  ) {
    return null;
  }
  return {
    ...position,
    recordId: value.recordId,
    positionId: value.positionId,
    action: value.action,
    timestamp: value.timestamp,
    markPrice: value.markPrice,
    realizedPnl: value.realizedPnl,
    leveragedReturnPercent: value.leveragedReturnPercent,
  };
}

export function loadFuturesPaperSettings(): FuturesPaperSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(FUTURES_PAPER_SETTINGS_STORAGE_KEY) ?? "null");
    return normalizeFuturesPaperSettings(parsed) ?? { ...DEFAULT_FUTURES_PAPER_SETTINGS };
  } catch {
    return { ...DEFAULT_FUTURES_PAPER_SETTINGS };
  }
}

export function saveFuturesPaperSettings(settings: FuturesPaperSettings): boolean {
  const normalized = normalizeFuturesPaperSettings(settings);
  if (!normalized) return false;
  try {
    localStorage.setItem(FUTURES_PAPER_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function loadFuturesPaperPositions(): FuturesPaperPosition[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(FUTURES_PAPER_POSITIONS_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const seenSymbols = new Set<FuturesSymbol>();
    return parsed
      .map(normalizeFuturesPaperPosition)
      .filter((position): position is FuturesPaperPosition => {
        if (!position || seenSymbols.has(position.symbol)) return false;
        seenSymbols.add(position.symbol);
        return true;
      })
      .slice(0, SUPPORTED_FUTURES_SYMBOLS.length);
  } catch {
    return [];
  }
}

export function saveFuturesPaperPositions(positions: FuturesPaperPosition[]): boolean {
  const normalized = positions.map(normalizeFuturesPaperPosition);
  if (normalized.some((position) => position === null)) return false;
  const validPositions = normalized.filter(
    (position): position is FuturesPaperPosition => position !== null,
  );
  if (new Set(validPositions.map((position) => position.symbol)).size !== validPositions.length) {
    return false;
  }
  try {
    localStorage.setItem(FUTURES_PAPER_POSITIONS_STORAGE_KEY, JSON.stringify(validPositions));
    return true;
  } catch {
    return false;
  }
}

export function loadFuturesPaperHistory(): FuturesPaperHistoryRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(FUTURES_PAPER_HISTORY_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeFuturesHistoryRecord)
      .filter((record): record is FuturesPaperHistoryRecord => record !== null)
      .slice(0, MAX_FUTURES_PAPER_HISTORY);
  } catch {
    return [];
  }
}

export function saveFuturesPaperHistory(history: FuturesPaperHistoryRecord[]): boolean {
  const normalized = history.map(normalizeFuturesHistoryRecord);
  if (normalized.some((record) => record === null)) return false;
  try {
    localStorage.setItem(
      FUTURES_PAPER_HISTORY_STORAGE_KEY,
      JSON.stringify(normalized.slice(0, MAX_FUTURES_PAPER_HISTORY)),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearFuturesPaperHistory(): boolean {
  try {
    localStorage.removeItem(FUTURES_PAPER_HISTORY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function loadFuturesTestScenario(): FuturesTestScenario {
  try {
    const stored = localStorage.getItem(FUTURES_TEST_SCENARIO_STORAGE_KEY);
    return isFuturesTestScenario(stored) ? stored : DEFAULT_FUTURES_TEST_SCENARIO;
  } catch {
    return DEFAULT_FUTURES_TEST_SCENARIO;
  }
}

export function saveFuturesTestScenario(scenario: FuturesTestScenario): boolean {
  if (!isFuturesTestScenario(scenario)) return false;
  try {
    localStorage.setItem(FUTURES_TEST_SCENARIO_STORAGE_KEY, scenario);
    return true;
  } catch {
    return false;
  }
}

export function clearFuturesTestScenario(): boolean {
  try {
    localStorage.removeItem(FUTURES_TEST_SCENARIO_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function clearFuturesPaperData(): boolean {
  try {
    localStorage.removeItem(FUTURES_PAPER_SETTINGS_STORAGE_KEY);
    localStorage.removeItem(FUTURES_PAPER_POSITIONS_STORAGE_KEY);
    localStorage.removeItem(FUTURES_PAPER_HISTORY_STORAGE_KEY);
    localStorage.removeItem(FUTURES_TEST_SCENARIO_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
