import {
  MOCK_BACKTEST_PERIODS,
  MOCK_HISTORICAL_PRICES,
  type MockBacktestPeriod,
  type MockHistoricalPrice,
} from "@/data/mockHistoricalData";
import { COINS } from "@/data/mockData";
import {
  generatePaperSignals,
  type PaperSignalLabel,
} from "@/lib/paperSignalEngine";
import type { Coin, PortfolioPosition } from "@/types";

export type BacktestCoinId = "all" | "btc" | "eth" | "sol" | "ada" | "avax";

export interface BacktestConfig {
  startingBalance: number;
  tradeSizePercent: number;
  coinId: BacktestCoinId;
  period: MockBacktestPeriod;
  tradingFeePercent: number;
  slippagePercent: number;
  spreadPercent: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  maxTradeSizePercent: number;
  maxDrawdownStopPercent: number;
}

export type BacktestExitReason =
  | "signal exit"
  | "stop-loss"
  | "take-profit"
  | "drawdown stop"
  | "end of period";

export interface BacktestEvent {
  id: string;
  date: string;
  coinId: Exclude<BacktestCoinId, "all">;
  symbol: string;
  signal: PaperSignalLabel;
  entryPrice?: number;
  exitPrice?: number;
  pnl?: number;
  exitReason?: BacktestExitReason;
  reason: string;
}

export interface BacktestMetrics {
  totalTrades: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number | null;
  maxDrawdown: number;
  simulatedReturnPercent: number;
  grossReturnPercent: number;
  netReturnPercent: number;
  totalFeesPaid: number;
  stopLossExits: number;
  takeProfitExits: number;
  finalEquity: number;
}

export interface BacktestRun {
  id: string;
  createdAt: string;
  periodStart: string;
  periodEnd: string;
  config: BacktestConfig;
  metrics: BacktestMetrics;
  signalCounts: Record<PaperSignalLabel, number>;
  events: BacktestEvent[];
}

type BacktestResult =
  | { ok: true; value: BacktestRun }
  | { ok: false; message: string };

interface OpenPosition {
  quantity: number;
  entryPrice: number;
  cost: number;
  referenceEntryPrice: number;
  referenceQuantity: number;
  entryFee: number;
}

interface CompletedTrade {
  pnl: number;
  grossPnl: number;
}

interface CoinBacktestResult {
  events: BacktestEvent[];
  trades: CompletedTrade[];
  equityCurve: number[];
  totalFeesPaid: number;
  stopLossExits: number;
  takeProfitExits: number;
}

export const BACKTEST_STORAGE_KEY = "chanter-paper-backtest-history";
export const MAX_BACKTEST_HISTORY = 5;
export const DEFAULT_BACKTEST_ASSUMPTIONS = {
  tradingFeePercent: 0.1,
  slippagePercent: 0.05,
  spreadPercent: 0.02,
  stopLossPercent: 5,
  takeProfitPercent: 10,
  maxTradeSizePercent: 25,
  maxDrawdownStopPercent: 15,
} as const;

const SUPPORTED_COIN_IDS = ["btc", "eth", "sol", "ada", "avax"] as const;
const SUPPORTED_COIN_SET = new Set<string>(SUPPORTED_COIN_IDS);
const SUPPORTED_SYMBOLS_BY_ID = new Map([
  ["btc", "BTC"],
  ["eth", "ETH"],
  ["sol", "SOL"],
  ["ada", "ADA"],
  ["avax", "AVAX"],
]);
const SIGNAL_LABELS = new Set<PaperSignalLabel>(["BUY", "SELL", "HOLD", "AVOID"]);
const EXIT_REASONS = new Set<BacktestExitReason>([
  "signal exit",
  "stop-loss",
  "take-profit",
  "drawdown stop",
  "end of period",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function createPosition(
  coinId: string,
  position: OpenPosition,
  currentPrice: number,
): PortfolioPosition {
  const currentValue = position.quantity * currentPrice;
  const pl = currentValue - position.cost;

  return {
    coinId,
    holdings: position.quantity,
    avgPrice: position.entryPrice,
    currentPrice,
    currentValue,
    invested: position.cost,
    pl,
    plPercent: position.cost > 0 ? (pl / position.cost) * 100 : 0,
  };
}

function createSignalCoin(
  template: Coin,
  prices: MockHistoricalPrice[],
  index: number,
): Coin {
  const current = prices[index];
  const previous = prices[index - 1] ?? current;
  const change24h = previous.close > 0
    ? ((current.close - previous.close) / previous.close) * 100
    : 0;
  const recentPrices = prices
    .slice(Math.max(0, index - 6), index + 1)
    .map((point) => point.close);

  if (recentPrices.length === 1) recentPrices.unshift(recentPrices[0]);

  return {
    ...template,
    price: current.close,
    change24h,
    sparkline: recentPrices,
  };
}

function runCoinBacktest(
  coinId: typeof SUPPORTED_COIN_IDS[number],
  startingBalance: number,
  config: BacktestConfig,
): CoinBacktestResult | null {
  const prices = MOCK_HISTORICAL_PRICES[coinId];
  const template = COINS.find((coin) => coin.id === coinId);

  if (!template || !prices || prices.length < config.period) return null;

  const startIndex = prices.length - config.period;
  const events: BacktestEvent[] = [];
  const trades: CompletedTrade[] = [];
  const equityCurve: number[] = [];
  const feeRate = config.tradingFeePercent / 100;
  const entryAdjustment = 1 + (config.slippagePercent + config.spreadPercent / 2) / 100;
  const exitAdjustment = 1 - (config.slippagePercent + config.spreadPercent / 2) / 100;
  const effectiveTradeSizePercent = Math.min(
    config.tradeSizePercent,
    config.maxTradeSizePercent,
  );
  let cash = startingBalance;
  let position: OpenPosition | null = null;
  let totalFeesPaid = 0;
  let stopLossExits = 0;
  let takeProfitExits = 0;
  let peakEquity = startingBalance;

  const closeCurrentPosition = (
    event: BacktestEvent,
    point: MockHistoricalPrice,
    exitReason: BacktestExitReason,
  ) => {
    if (!position) return;

    const exitPrice = point.close * exitAdjustment;
    const grossProceeds = position.quantity * exitPrice;
    const exitFee = grossProceeds * feeRate;
    const netProceeds = grossProceeds - exitFee;
    const pnl = netProceeds - position.cost;
    const grossPnl = position.referenceQuantity * (point.close - position.referenceEntryPrice);

    cash += netProceeds;
    totalFeesPaid += exitFee;
    trades.push({ pnl, grossPnl });
    event.entryPrice = position.entryPrice;
    event.exitPrice = exitPrice;
    event.pnl = pnl;
    event.exitReason = exitReason;
    position = null;

    if (exitReason === "stop-loss") stopLossExits += 1;
    if (exitReason === "take-profit") takeProfitExits += 1;
  };

  for (let index = startIndex; index < prices.length; index += 1) {
    const point = prices[index];
    const signalCoin = createSignalCoin(template, prices, index);
    const portfolioPosition = position
      ? createPosition(coinId, position, point.close)
      : undefined;
    const positionValue = portfolioPosition?.currentValue ?? 0;
    const signal = generatePaperSignals({
      coins: [signalCoin],
      positions: portfolioPosition ? [portfolioPosition] : [],
      alerts: [],
      priceStatus: "live",
      totalValue: positionValue,
      totalPLPercent: portfolioPosition?.plPercent ?? 0,
      timestamp: `${point.date}T00:00:00.000Z`,
    })[0];

    if (!signal) continue;

    const event: BacktestEvent = {
      id: `backtest-event-${coinId}-${point.date}`,
      date: point.date,
      coinId,
      symbol: template.symbol,
      signal: signal.label,
      reason: signal.reason,
    };

    if (position && config.stopLossPercent > 0) {
      const positionChangePercent =
        ((point.close - position.entryPrice) / position.entryPrice) * 100;
      if (positionChangePercent <= -config.stopLossPercent) {
        closeCurrentPosition(event, point, "stop-loss");
        event.reason += ` Stop-loss threshold reached at ${positionChangePercent.toFixed(2)}%.`;
      }
    }

    if (position && config.takeProfitPercent > 0) {
      const positionChangePercent =
        ((point.close - position.entryPrice) / position.entryPrice) * 100;
      if (positionChangePercent >= config.takeProfitPercent) {
        closeCurrentPosition(event, point, "take-profit");
        event.reason += ` Take-profit threshold reached at +${positionChangePercent.toFixed(2)}%.`;
      }
    }

    if (signal.label === "BUY" && !position && event.exitReason === undefined) {
      const equity = cash;
      const requestedNotional = equity * (effectiveTradeSizePercent / 100);
      const tradeValue = Math.min(requestedNotional, cash / (1 + feeRate));

      if (tradeValue > 0) {
        const entryPrice = point.close * entryAdjustment;
        const entryFee = tradeValue * feeRate;
        position = {
          quantity: tradeValue / entryPrice,
          entryPrice,
          cost: tradeValue + entryFee,
          referenceEntryPrice: point.close,
          referenceQuantity: tradeValue / point.close,
          entryFee,
        };
        cash -= tradeValue + entryFee;
        totalFeesPaid += entryFee;
        event.entryPrice = entryPrice;
      }
    } else if (signal.label === "SELL" && position) {
      closeCurrentPosition(event, point, "signal exit");
    }

    let equity = cash + (position ? position.quantity * point.close : 0);
    peakEquity = Math.max(peakEquity, equity);
    const drawdownPercent = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;

    if (
      config.maxDrawdownStopPercent > 0 &&
      drawdownPercent >= config.maxDrawdownStopPercent
    ) {
      if (position) {
        closeCurrentPosition(event, point, "drawdown stop");
        equity = cash;
      }
      event.reason += ` Max drawdown stop reached at ${drawdownPercent.toFixed(2)}%.`;
      events.push(event);
      equityCurve.push(equity);
      break;
    }

    events.push(event);
    equityCurve.push(equity);
  }

  if (position) {
    const finalPoint = prices.at(-1);
    if (finalPoint) {
      const finalEvent: BacktestEvent = {
        id: `backtest-event-${coinId}-${finalPoint.date}-end`,
        date: finalPoint.date,
        coinId,
        symbol: template.symbol,
        signal: "HOLD",
        reason: "Open paper position closed at the final mock price for end-of-period accounting.",
      };
      closeCurrentPosition(finalEvent, finalPoint, "end of period");
      events.push(finalEvent);
      if (equityCurve.length > 0) equityCurve[equityCurve.length - 1] = cash;
      else equityCurve.push(cash);
    }
  }

  return {
    events,
    trades,
    equityCurve,
    totalFeesPaid,
    stopLossExits,
    takeProfitExits,
  };
}

function getMaxDrawdown(equityCurve: number[]): number {
  let peak = equityCurve[0] ?? 0;
  let maxDrawdown = 0;

  for (const equity of equityCurve) {
    if (equity > peak) peak = equity;
    if (peak <= 0) continue;
    maxDrawdown = Math.max(maxDrawdown, ((peak - equity) / peak) * 100);
  }

  return maxDrawdown;
}

export function validateBacktestConfig(config: BacktestConfig): string | null {
  if (!Number.isFinite(config.startingBalance) || config.startingBalance < 100) {
    return "Starting balance must be at least $100.";
  }
  if (config.startingBalance > 1_000_000_000) {
    return "Starting balance must not exceed $1,000,000,000.";
  }
  if (
    !Number.isFinite(config.tradeSizePercent) ||
    config.tradeSizePercent < 1 ||
    config.tradeSizePercent > 100
  ) {
    return "Trade size must be between 1% and 100%.";
  }
  if (config.coinId !== "all" && !SUPPORTED_COIN_SET.has(config.coinId)) {
    return "Select a supported mock-data coin.";
  }
  if (!MOCK_BACKTEST_PERIODS.includes(config.period)) {
    return "Select an available mock-data period.";
  }
  if (
    !Number.isFinite(config.tradingFeePercent) ||
    config.tradingFeePercent < 0 ||
    config.tradingFeePercent > 10
  ) {
    return "Trading fee must be between 0% and 10%.";
  }
  if (
    !Number.isFinite(config.slippagePercent) ||
    config.slippagePercent < 0 ||
    config.slippagePercent > 10
  ) {
    return "Slippage must be between 0% and 10%.";
  }
  if (
    !Number.isFinite(config.spreadPercent) ||
    config.spreadPercent < 0 ||
    config.spreadPercent > 10
  ) {
    return "Spread must be between 0% and 10%.";
  }
  if (
    !Number.isFinite(config.stopLossPercent) ||
    config.stopLossPercent < 0 ||
    config.stopLossPercent > 100
  ) {
    return "Stop-loss must be between 0% and 100%.";
  }
  if (
    !Number.isFinite(config.takeProfitPercent) ||
    config.takeProfitPercent < 0 ||
    config.takeProfitPercent > 1_000
  ) {
    return "Take-profit must be between 0% and 1,000%.";
  }
  if (
    !Number.isFinite(config.maxTradeSizePercent) ||
    config.maxTradeSizePercent < 1 ||
    config.maxTradeSizePercent > 100
  ) {
    return "Maximum trade size must be between 1% and 100%.";
  }
  if (
    !Number.isFinite(config.maxDrawdownStopPercent) ||
    config.maxDrawdownStopPercent < 0 ||
    config.maxDrawdownStopPercent > 100
  ) {
    return "Maximum drawdown stop must be between 0% and 100%.";
  }
  return null;
}

export function runPaperBacktest(config: BacktestConfig): BacktestResult {
  const configError = validateBacktestConfig(config);
  if (configError) return { ok: false, message: configError };

  const selectedCoinIds = config.coinId === "all"
    ? [...SUPPORTED_COIN_IDS]
    : [config.coinId];
  const allocation = config.startingBalance / selectedCoinIds.length;
  const coinResults = selectedCoinIds.map((coinId) =>
    runCoinBacktest(coinId, allocation, config),
  );

  if (coinResults.some((result) => result === null)) {
    return {
      ok: false,
      message: "No complete mock historical data exists for the selected configuration.",
    };
  }

  const validResults = coinResults.filter((result): result is CoinBacktestResult => result !== null);
  const events = validResults
    .flatMap((result) => result.events)
    .sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
  const trades = validResults.flatMap((result) => result.trades);
  const combinedEquityCurve = Array.from({ length: config.period }, (_, index) =>
    validResults.reduce(
      (sum, result) =>
        sum + (result.equityCurve[index] ?? result.equityCurve.at(-1) ?? allocation),
      0,
    ),
  );
  const finalEquity = combinedEquityCurve.at(-1) ?? config.startingBalance;
  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
  const totalGrossPnl = trades.reduce((sum, trade) => sum + trade.grossPnl, 0);
  const totalFeesPaid = validResults.reduce((sum, result) => sum + result.totalFeesPaid, 0);
  const stopLossExits = validResults.reduce((sum, result) => sum + result.stopLossExits, 0);
  const takeProfitExits = validResults.reduce((sum, result) => sum + result.takeProfitExits, 0);
  const netReturnPercent = config.startingBalance > 0
    ? ((finalEquity - config.startingBalance) / config.startingBalance) * 100
    : 0;
  const createdAt = new Date().toISOString();
  const signalCounts: Record<PaperSignalLabel, number> = {
    BUY: 0,
    SELL: 0,
    HOLD: 0,
    AVOID: 0,
  };

  for (const event of events) signalCounts[event.signal] += 1;

  return {
    ok: true,
    value: {
      id: `backtest-${createdAt}`,
      createdAt,
      periodStart: events[0]?.date ?? "",
      periodEnd: events.at(-1)?.date ?? "",
      config: { ...config },
      metrics: {
        totalTrades: trades.length,
        winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
        averageWin: wins.length > 0 ? grossProfit / wins.length : 0,
        averageLoss: losses.length > 0 ? -grossLoss / losses.length : 0,
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
        maxDrawdown: getMaxDrawdown(combinedEquityCurve),
        simulatedReturnPercent: netReturnPercent,
        grossReturnPercent: config.startingBalance > 0
          ? (totalGrossPnl / config.startingBalance) * 100
          : 0,
        netReturnPercent,
        totalFeesPaid,
        stopLossExits,
        takeProfitExits,
        finalEquity,
      },
      signalCounts,
      events,
    },
  };
}

function isValidBacktestEvent(value: unknown): value is BacktestEvent {
  return isRecord(value) &&
    typeof value.id === "string" &&
    value.id.trim() !== "" &&
    isValidDate(value.date) &&
    typeof value.coinId === "string" &&
    SUPPORTED_COIN_SET.has(value.coinId) &&
    typeof value.symbol === "string" &&
    value.symbol === SUPPORTED_SYMBOLS_BY_ID.get(value.coinId) &&
    typeof value.signal === "string" &&
    SIGNAL_LABELS.has(value.signal as PaperSignalLabel) &&
    (value.entryPrice === undefined || (isFiniteNumber(value.entryPrice) && value.entryPrice > 0)) &&
    (value.exitPrice === undefined || (isFiniteNumber(value.exitPrice) && value.exitPrice > 0)) &&
    (value.pnl === undefined || isFiniteNumber(value.pnl)) &&
    (value.exitReason === undefined ||
      (typeof value.exitReason === "string" &&
        EXIT_REASONS.has(value.exitReason as BacktestExitReason))) &&
    (value.exitReason === undefined ||
      (value.entryPrice !== undefined && value.exitPrice !== undefined && value.pnl !== undefined)) &&
    typeof value.reason === "string" &&
    value.reason.trim() !== "";
}

export function normalizeBacktestRun(value: unknown): BacktestRun | null {
  if (
    !isRecord(value) ||
    !isRecord(value.config) ||
    !isRecord(value.metrics) ||
    !isRecord(value.signalCounts) ||
    !Array.isArray(value.events)
  ) {
    return null;
  }

  const rawConfig = value.config;
  const rawMetrics = value.metrics;
  const tradeSizePercent = rawConfig.tradeSizePercent;
  const simulatedReturnPercent = rawMetrics.simulatedReturnPercent;

  if (!isFiniteNumber(tradeSizePercent) || !isFiniteNumber(simulatedReturnPercent)) {
    return null;
  }

  const normalizedConfig: BacktestConfig = {
    startingBalance: rawConfig.startingBalance as number,
    tradeSizePercent,
    coinId: rawConfig.coinId as BacktestCoinId,
    period: rawConfig.period as MockBacktestPeriod,
    tradingFeePercent: isFiniteNumber(rawConfig.tradingFeePercent)
      ? rawConfig.tradingFeePercent
      : 0,
    slippagePercent: isFiniteNumber(rawConfig.slippagePercent)
      ? rawConfig.slippagePercent
      : 0,
    spreadPercent: isFiniteNumber(rawConfig.spreadPercent) ? rawConfig.spreadPercent : 0,
    stopLossPercent: isFiniteNumber(rawConfig.stopLossPercent)
      ? rawConfig.stopLossPercent
      : 0,
    takeProfitPercent: isFiniteNumber(rawConfig.takeProfitPercent)
      ? rawConfig.takeProfitPercent
      : 0,
    maxTradeSizePercent: isFiniteNumber(rawConfig.maxTradeSizePercent)
      ? rawConfig.maxTradeSizePercent
      : tradeSizePercent,
    maxDrawdownStopPercent: isFiniteNumber(rawConfig.maxDrawdownStopPercent)
      ? rawConfig.maxDrawdownStopPercent
      : 0,
  };
  const normalizedMetrics: BacktestMetrics = {
    totalTrades: rawMetrics.totalTrades as number,
    winRate: rawMetrics.winRate as number,
    averageWin: rawMetrics.averageWin as number,
    averageLoss: rawMetrics.averageLoss as number,
    profitFactor: rawMetrics.profitFactor as number | null,
    maxDrawdown: rawMetrics.maxDrawdown as number,
    simulatedReturnPercent,
    grossReturnPercent: isFiniteNumber(rawMetrics.grossReturnPercent)
      ? rawMetrics.grossReturnPercent
      : simulatedReturnPercent,
    netReturnPercent: isFiniteNumber(rawMetrics.netReturnPercent)
      ? rawMetrics.netReturnPercent
      : simulatedReturnPercent,
    totalFeesPaid: isFiniteNumber(rawMetrics.totalFeesPaid) ? rawMetrics.totalFeesPaid : 0,
    stopLossExits: isFiniteNumber(rawMetrics.stopLossExits) ? rawMetrics.stopLossExits : 0,
    takeProfitExits: isFiniteNumber(rawMetrics.takeProfitExits)
      ? rawMetrics.takeProfitExits
      : 0,
    finalEquity: rawMetrics.finalEquity as number,
  };
  const normalizedEvents = value.events.map((event) => {
    if (!isRecord(event)) return event;
    return {
      ...event,
      exitReason: event.exitReason ?? (event.exitPrice !== undefined ? "signal exit" : undefined),
    };
  });
  const normalized: BacktestRun = {
    id: value.id as string,
    createdAt: value.createdAt as string,
    periodStart: value.periodStart as string,
    periodEnd: value.periodEnd as string,
    config: normalizedConfig,
    metrics: normalizedMetrics,
    signalCounts: value.signalCounts as Record<PaperSignalLabel, number>,
    events: normalizedEvents as BacktestEvent[],
  };

  return isValidBacktestRun(normalized) ? normalized : null;
}

export function isValidBacktestRun(value: unknown): value is BacktestRun {
  if (!isRecord(value) || !isRecord(value.config) || !isRecord(value.metrics)) return false;

  const config = value.config as unknown as BacktestConfig;
  const metrics = value.metrics;
  const signalCounts = value.signalCounts;

  if (
    typeof value.id !== "string" ||
    value.id.trim() === "" ||
    !isValidDate(value.createdAt) ||
    !isValidDate(value.periodStart) ||
    !isValidDate(value.periodEnd) ||
    Date.parse(value.periodStart) > Date.parse(value.periodEnd) ||
    validateBacktestConfig(config) !== null ||
    !Number.isInteger(metrics.totalTrades) ||
    (metrics.totalTrades as number) < 0 ||
    !isFiniteNumber(metrics.winRate) ||
    metrics.winRate < 0 ||
    metrics.winRate > 100 ||
    !isFiniteNumber(metrics.averageWin) ||
    metrics.averageWin < 0 ||
    !isFiniteNumber(metrics.averageLoss) ||
    metrics.averageLoss > 0 ||
    (metrics.profitFactor !== null &&
      (!isFiniteNumber(metrics.profitFactor) || metrics.profitFactor < 0)) ||
    !isFiniteNumber(metrics.maxDrawdown) ||
    metrics.maxDrawdown < 0 ||
    !isFiniteNumber(metrics.simulatedReturnPercent) ||
    !isFiniteNumber(metrics.grossReturnPercent) ||
    !isFiniteNumber(metrics.netReturnPercent) ||
    Math.abs(metrics.netReturnPercent - metrics.simulatedReturnPercent) > 0.000001 ||
    !isFiniteNumber(metrics.totalFeesPaid) ||
    metrics.totalFeesPaid < 0 ||
    !Number.isInteger(metrics.stopLossExits) ||
    (metrics.stopLossExits as number) < 0 ||
    !Number.isInteger(metrics.takeProfitExits) ||
    (metrics.takeProfitExits as number) < 0 ||
    !isFiniteNumber(metrics.finalEquity) ||
    metrics.finalEquity < 0 ||
    !isRecord(signalCounts) ||
    ![...SIGNAL_LABELS].every(
      (label) => Number.isInteger(signalCounts[label]) && (signalCounts[label] as number) >= 0,
    ) ||
    !Array.isArray(value.events) ||
    !value.events.every(isValidBacktestEvent)
  ) {
    return false;
  }

  const eventIds = new Set(value.events.map((event) => event.id));
  const signalCountTotal = [...SIGNAL_LABELS].reduce(
    (total, label) => total + (signalCounts[label] as number),
    0,
  );

  return eventIds.size === value.events.length &&
    signalCountTotal === value.events.length &&
    (metrics.totalTrades as number) <= value.events.length;
}

export function loadBacktestHistory(): BacktestRun[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(BACKTEST_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeBacktestRun)
      .filter((run): run is BacktestRun => run !== null)
      .slice(0, MAX_BACKTEST_HISTORY);
  } catch {
    return [];
  }
}

export function saveBacktestHistory(history: BacktestRun[]): boolean {
  try {
    const normalizedHistory = history
      .map(normalizeBacktestRun)
      .filter((run): run is BacktestRun => run !== null)
      .slice(0, MAX_BACKTEST_HISTORY);
    localStorage.setItem(
      BACKTEST_STORAGE_KEY,
      JSON.stringify(normalizedHistory),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearBacktestHistory(): boolean {
  try {
    localStorage.removeItem(BACKTEST_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
