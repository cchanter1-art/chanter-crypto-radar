import { DEFAULT_WATCHLIST } from "@/data/mockData";
import type { PaperTrade } from "@/types";

export function createPaperTradeId(): string {
  return `trade-${crypto.randomUUID()}`;
}

export function isSupportedPaperCoin(coinId: string): boolean {
  return DEFAULT_WATCHLIST.includes(coinId);
}

export function getPaperHoldings(trades: PaperTrade[], coinId: string): number {
  let holdings = 0;

  for (const trade of trades) {
    if (trade.coinId !== coinId || !Number.isFinite(trade.amount) || trade.amount <= 0) {
      continue;
    }

    holdings += trade.type === "buy" ? trade.amount : -trade.amount;
  }

  return Math.max(0, holdings);
}

export function isValidPaperTrade(trade: PaperTrade): boolean {
  return (
    isSupportedPaperCoin(trade.coinId) &&
    (trade.type === "buy" || trade.type === "sell") &&
    Number.isFinite(trade.amount) &&
    trade.amount > 0 &&
    Number.isFinite(trade.price) &&
    trade.price > 0 &&
    typeof trade.date === "string" &&
    !Number.isNaN(Date.parse(trade.date))
  );
}
