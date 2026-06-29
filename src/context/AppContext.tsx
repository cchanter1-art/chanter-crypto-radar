import { createContext, useContext, type Dispatch } from "react";
import type { AppState, AppAction, Coin, PortfolioPosition } from "@/types";

export interface AppContextType {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  coins: Coin[];
  priceStatus: "loading" | "live" | "fallback";
  priceError: string | null;
  lastPriceUpdate: string | null;
  refreshPrices: () => Promise<void>;
}

export const AppContext = createContext<AppContextType | null>(null);

export function useAppState(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppState must be used within AppProvider");
  return ctx;
}

export function usePortfolio(): {
  positions: PortfolioPosition[];
  totalInvested: number;
  totalValue: number;
  totalPL: number;
  totalPLPercent: number;
} {
  const { state, coins } = useAppState();

  const coinMap = new Map(coins.map((c: Coin) => [c.id, c]));

  const positionsMap = new Map<string, { holdings: number; invested: number; tradeCount: number }>();

  for (const trade of state.trades) {
    if (!positionsMap.has(trade.coinId)) {
      positionsMap.set(trade.coinId, { holdings: 0, invested: 0, tradeCount: 0 });
    }
    const pos = positionsMap.get(trade.coinId)!;
    if (trade.type === "buy") {
      pos.holdings += trade.amount;
      pos.invested += trade.amount * trade.price;
    } else {
      pos.holdings -= trade.amount;
      pos.invested -= trade.amount * trade.price;
    }
    pos.tradeCount++;
  }

  const positions: PortfolioPosition[] = [];
  let totalInvested = 0;
  let totalValue = 0;

  for (const [coinId, pos] of positionsMap) {
    if (pos.holdings <= 0) continue;
    const coin = coinMap.get(coinId);
    if (!coin) continue;

    const avgPrice = pos.invested / pos.holdings;
    const currentValue = pos.holdings * coin.price;
    const pl = currentValue - pos.invested;
    const plPercent = (pl / pos.invested) * 100;

    positions.push({
      coinId,
      holdings: pos.holdings,
      avgPrice,
      currentPrice: coin.price,
      currentValue,
      invested: pos.invested,
      pl,
      plPercent,
    });

    totalInvested += pos.invested;
    totalValue += currentValue;
  }

  const totalPL = totalValue - totalInvested;
  const totalPLPercent = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  return { positions, totalInvested, totalValue, totalPL, totalPLPercent };
}
