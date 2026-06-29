import { createContext, useContext, useReducer, useEffect, type ReactNode } from "react";
import type { AppState, AppAction, AppSettings, Coin, PortfolioPosition } from "@/types";
import { DEFAULT_TRADES, COINS } from "@/data/mockData";

const STORAGE_KEYS = {
  watchlist: "chanter-watchlist",
  trades: "chanter-trades",
  settings: "chanter-settings",
};

const DEFAULT_SETTINGS: AppSettings = {
  displayName: "",
  email: "",
  priceAlerts: true,
  autoRefresh: false,
};

function loadState(): AppState {
  try {
    const watchlistRaw = localStorage.getItem(STORAGE_KEYS.watchlist);
    const tradesRaw = localStorage.getItem(STORAGE_KEYS.trades);
    const settingsRaw = localStorage.getItem(STORAGE_KEYS.settings);

    const watchlist = watchlistRaw ? JSON.parse(watchlistRaw) : ["btc", "eth", "sol", "ada", "avax"];
    const trades = tradesRaw ? JSON.parse(tradesRaw) : DEFAULT_TRADES;
    const settings = settingsRaw ? JSON.parse(settingsRaw) : DEFAULT_SETTINGS;

    return { watchlist, trades, settings };
  } catch {
    return {
      watchlist: ["btc", "eth", "sol", "ada", "avax"],
      trades: DEFAULT_TRADES,
      settings: DEFAULT_SETTINGS,
    };
  }
}

function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEYS.watchlist, JSON.stringify(state.watchlist));
    localStorage.setItem(STORAGE_KEYS.trades, JSON.stringify(state.trades));
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
  } catch {
    // silently fail
  }
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "ADD_TO_WATCHLIST":
      if (state.watchlist.includes(action.payload)) return state;
      return { ...state, watchlist: [...state.watchlist, action.payload] };

    case "REMOVE_FROM_WATCHLIST":
      return { ...state, watchlist: state.watchlist.filter((id) => id !== action.payload) };

    case "ADD_TRADE":
      return { ...state, trades: [...state.trades, action.payload] };

    case "DELETE_TRADE":
      return { ...state, trades: state.trades.filter((t) => t.id !== action.payload) };

    case "UPDATE_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.payload } };

    case "LOAD_STATE":
      return action.payload;

    default:
      return state;
  }
}

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, null, loadState);

  useEffect(() => {
    saveState(state);
  }, [state]);

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

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
  const { state } = useAppState();

  const coinMap = new Map(COINS.map((c: Coin) => [c.id, c]));

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
