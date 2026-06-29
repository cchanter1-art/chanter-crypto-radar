import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AppState, AppAction, AppSettings, Coin, PortfolioPosition } from "@/types";
import { DEFAULT_TRADES, COINS } from "@/data/mockData";
import {
  CryptoPriceServiceError,
  fetchCryptoPrices,
  type LiveCoinPrice,
} from "@/lib/cryptoPriceService";

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
  coins: Coin[];
  priceStatus: "loading" | "live" | "fallback";
  priceError: string | null;
  lastPriceUpdate: string | null;
  refreshPrices: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

function mergeLivePrices(livePrices: LiveCoinPrice[]): Coin[] {
  const pricesById = new Map(livePrices.map((price) => [price.coinId, price]));

  return COINS.map((coin) => {
    const livePrice = pricesById.get(coin.id as LiveCoinPrice["coinId"]);
    if (!livePrice) return coin;

    return {
      ...coin,
      price: livePrice.price,
      change24h: livePrice.change24h,
      sparkline: livePrice.sparkline.length > 1 ? livePrice.sparkline : coin.sparkline,
    };
  });
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, null, loadState);
  const [coins, setCoins] = useState<Coin[]>(COINS);
  const [priceStatus, setPriceStatus] = useState<AppContextType["priceStatus"]>("loading");
  const [priceError, setPriceError] = useState<string | null>(null);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<string | null>(null);
  const activePriceRequest = useRef<AbortController | null>(null);

  const refreshPrices = useCallback(async () => {
    activePriceRequest.current?.abort();
    const controller = new AbortController();
    activePriceRequest.current = controller;

    setPriceStatus("loading");
    setPriceError(null);

    try {
      const livePrices = await fetchCryptoPrices(controller.signal);
      if (controller.signal.aborted) return;

      const newestUpdate = livePrices.reduce(
        (latest, price) => price.lastUpdated > latest ? price.lastUpdated : latest,
        livePrices[0]?.lastUpdated ?? new Date().toISOString(),
      );

      setCoins(mergeLivePrices(livePrices));
      setLastPriceUpdate(newestUpdate);
      setPriceStatus("live");
    } catch (error) {
      if (controller.signal.aborted) return;

      setCoins(COINS);
      setLastPriceUpdate(null);
      setPriceStatus("fallback");
      setPriceError(
        error instanceof CryptoPriceServiceError
          ? error.message
          : "Live prices are unavailable. Mock prices are in use.",
      );
    } finally {
      if (activePriceRequest.current === controller) {
        activePriceRequest.current = null;
      }
    }
  }, []);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    const initialRefreshId = window.setTimeout(() => {
      void refreshPrices();
    }, 0);

    return () => {
      window.clearTimeout(initialRefreshId);
      activePriceRequest.current?.abort();
    };
  }, [refreshPrices]);

  useEffect(() => {
    if (!state.settings.autoRefresh) return;

    const intervalId = window.setInterval(() => {
      void refreshPrices();
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [state.settings.autoRefresh, refreshPrices]);

  return (
    <AppContext.Provider
      value={{
        state,
        dispatch,
        coins,
        priceStatus,
        priceError,
        lastPriceUpdate,
        refreshPrices,
      }}
    >
      {children}
    </AppContext.Provider>
  );
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
