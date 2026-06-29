import type { Coin, PaperTrade } from "@/types";

export const COINS: Coin[] = [
  {
    id: "btc",
    symbol: "BTC",
    name: "Bitcoin",
    price: 97245.32,
    change24h: 2.34,
    color: "#cc9258",
    sparkline: [95000, 96200, 94800, 97100, 96500, 98100, 97245],
  },
  {
    id: "eth",
    symbol: "ETH",
    name: "Ethereum",
    price: 3876.15,
    change24h: -0.87,
    color: "#8b9dc3",
    sparkline: [3910, 3885, 3920, 3850, 3900, 3840, 3876],
  },
  {
    id: "sol",
    symbol: "SOL",
    name: "Solana",
    price: 218.47,
    change24h: 5.12,
    color: "#00ffa3",
    sparkline: [208, 212, 205, 220, 215, 225, 218],
  },
  {
    id: "ada",
    symbol: "ADA",
    name: "Cardano",
    price: 1.24,
    change24h: -1.45,
    color: "#0033ad",
    sparkline: [1.26, 1.25, 1.27, 1.22, 1.24, 1.21, 1.24],
  },
  {
    id: "avax",
    symbol: "AVAX",
    name: "Avalanche",
    price: 42.18,
    change24h: 3.67,
    color: "#e84142",
    sparkline: [40.7, 41.2, 40.5, 42.8, 41.9, 43.1, 42.18],
  },
];

export const DEFAULT_WATCHLIST = COINS.map((coin) => coin.id);

export const DEFAULT_TRADES: PaperTrade[] = [
  {
    id: "trade-1",
    coinId: "btc",
    type: "buy",
    amount: 0.15,
    price: 94500.0,
    date: "2026-06-15T10:30:00.000Z",
  },
  {
    id: "trade-2",
    coinId: "eth",
    type: "buy",
    amount: 2.5,
    price: 3800.0,
    date: "2026-06-18T14:20:00.000Z",
  },
  {
    id: "trade-3",
    coinId: "sol",
    type: "buy",
    amount: 15,
    price: 205.0,
    date: "2026-06-22T09:15:00.000Z",
  },
];

export function formatCurrency(value: number): string {
  if (value >= 1000) {
    return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return "$" + value.toFixed(4);
}

export function formatPercentage(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function getPortfolioPerformance(): number[] {
  const base = 52000;
  const points: number[] = [];
  for (let i = 0; i < 30; i++) {
    const change = (Math.sin(i * 0.4) * 2000) + (Math.cos(i * 0.7) * 1500) + (Math.random() - 0.5) * 800;
    points.push(base + change + i * 180);
  }
  return points;
}

export function getAllocationData(): { coinId: string; percentage: number }[] {
  return [
    { coinId: "btc", percentage: 52.3 },
    { coinId: "eth", percentage: 24.1 },
    { coinId: "sol", percentage: 14.8 },
    { coinId: "ada", percentage: 5.2 },
    { coinId: "avax", percentage: 3.6 },
  ];
}
