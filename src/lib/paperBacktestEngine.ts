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
}

export interface BacktestEvent {
  id: string;
  date: string;
  coinId: Exclude<BacktestCoinId, "all">;
  symbol: string;
  signal: PaperSignalLabel;
  entryPrice?: number;
  exitPrice?: number;
  pnl?: number;
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
}

interface CompletedTrade {
  pnl: number;
}

interface CoinBacktestResult {
  events: BacktestEvent[];
  trades: CompletedTrade[];
  equityCurve: number[];
}

export const BACKTEST_STORAGE_KEY = "chanter-paper-backtest-history";
export const MAX_BACKTEST_HISTORY = 5;

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
  tradeSizePercent: number,
  period: MockBacktestPeriod,
): CoinBacktestResult | null {
  const prices = MOCK_HISTORICAL_PRICES[coinId];
  const template = COINS.find((coin) => coin.id === coinId);

  if (!template || !prices || prices.length < period) return null;

  const startIndex = prices.length - period;
  const events: BacktestEvent[] = [];
  const trades: CompletedTrade[] = [];
  const equityCurve: number[] = [];
  let cash = startingBalance;
  let position: OpenPosition | null = null;

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

    if (signal.label === "BUY" && !position) {
      const equity = cash;
      const tradeValue = Math.min(cash, equity * (tradeSizePercent / 100));

      if (tradeValue > 0) {
        position = {
          quantity: tradeValue / point.close,
          entryPrice: point.close,
          cost: tradeValue,
        };
        cash -= tradeValue;
        event.entryPrice = point.close;
      }
    } else if (signal.label === "SELL" && position) {
      const entryPrice = position.entryPrice;
      const proceeds = position.quantity * point.close;
      const pnl = proceeds - position.cost;

      cash += proceeds;
      trades.push({ pnl });
      event.entryPrice = entryPrice;
      event.exitPrice = point.close;
      event.pnl = pnl;
      position = null;
    }

    events.push(event);
    equityCurve.push(cash + (position ? position.quantity * point.close : 0));
  }

  return { events, trades, equityCurve };
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
    runCoinBacktest(coinId, allocation, config.tradeSizePercent, config.period),
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
    validResults.reduce((sum, result) => sum + (result.equityCurve[index] ?? allocation), 0),
  );
  const finalEquity = combinedEquityCurve.at(-1) ?? config.startingBalance;
  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
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
        simulatedReturnPercent: config.startingBalance > 0
          ? ((finalEquity - config.startingBalance) / config.startingBalance) * 100
          : 0,
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
    typeof value.reason === "string" &&
    value.reason.trim() !== "";
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
    return parsed.filter(isValidBacktestRun).slice(0, MAX_BACKTEST_HISTORY);
  } catch {
    return [];
  }
}

export function saveBacktestHistory(history: BacktestRun[]): boolean {
  try {
    localStorage.setItem(
      BACKTEST_STORAGE_KEY,
      JSON.stringify(history.filter(isValidBacktestRun).slice(0, MAX_BACKTEST_HISTORY)),
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
