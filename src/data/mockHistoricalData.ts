import { COINS } from "@/data/mockData";

export interface MockHistoricalPrice {
  date: string;
  close: number;
}

interface MockSeriesConfig {
  coinId: string;
  startPrice: number;
  trend: number;
  volatility: number;
  phase: number;
  shocks?: Record<number, number>;
}

export const MOCK_BACKTEST_PERIODS = [30, 60, 90, 120] as const;
export type MockBacktestPeriod = typeof MOCK_BACKTEST_PERIODS[number];

const HISTORY_LENGTH = 120;
const END_DATE_UTC = Date.UTC(2026, 5, 29);

const SERIES_CONFIGS: MockSeriesConfig[] = [
  { coinId: "btc", startPrice: 68_000, trend: 0.0022, volatility: 0.018, phase: 0.3 },
  { coinId: "eth", startPrice: 2_850, trend: 0.0018, volatility: 0.026, phase: 1.1 },
  {
    coinId: "sol",
    startPrice: 142,
    trend: 0.0026,
    volatility: 0.042,
    phase: 2.2,
    shocks: { 37: -0.112 },
  },
  { coinId: "ada", startPrice: 0.68, trend: 0.0014, volatility: 0.034, phase: 3.0 },
  {
    coinId: "avax",
    startPrice: 31,
    trend: 0.0019,
    volatility: 0.039,
    phase: 4.1,
    shocks: { 82: 0.108 },
  },
];

function toDateString(dayIndex: number): string {
  const offset = HISTORY_LENGTH - 1 - dayIndex;
  return new Date(END_DATE_UTC - offset * 86_400_000).toISOString().slice(0, 10);
}

function createMockSeries(config: MockSeriesConfig): MockHistoricalPrice[] {
  let price = config.startPrice;

  return Array.from({ length: HISTORY_LENGTH }, (_, index) => {
    if (index > 0) {
      const wave = Math.sin(index * 0.37 + config.phase) * config.volatility;
      const counterWave = Math.cos(index * 0.19 + config.phase * 0.7) * config.volatility * 0.45;
      const jitterSeed = ((index * 37 + Math.round(config.phase * 100)) % 101) / 100 - 0.5;
      const jitter = jitterSeed * config.volatility * 1.2;
      const shock = config.shocks?.[index] ?? 0;
      price *= 1 + config.trend + wave + counterWave + jitter + shock;
    }

    return {
      date: toDateString(index),
      close: Number(price.toFixed(price >= 10 ? 2 : 4)),
    };
  });
}

export const MOCK_HISTORICAL_PRICES: Record<string, MockHistoricalPrice[]> = Object.fromEntries(
  SERIES_CONFIGS
    .filter((config) => COINS.some((coin) => coin.id === config.coinId))
    .map((config) => [config.coinId, createMockSeries(config)]),
);
