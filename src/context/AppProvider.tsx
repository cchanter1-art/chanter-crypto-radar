import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppContext, type AppContextType } from "@/context/AppContext";
import type { AppState, AppAction, AppSettings, Coin, PaperTrade, PriceAlert } from "@/types";
import { DEFAULT_TRADES, DEFAULT_WATCHLIST, COINS } from "@/data/mockData";
import {
  CryptoPriceServiceError,
  fetchCryptoPrices,
  type LiveCoinPrice,
} from "@/lib/cryptoPriceService";
import { getPaperHoldings, isValidPaperTrade } from "@/lib/paperTradeUtils";

const STORAGE_KEYS = {
  watchlist: "chanter-watchlist",
  trades: "chanter-trades",
  settings: "chanter-settings",
  alerts: "chanter-price-alerts",
};

const DEFAULT_SETTINGS: AppSettings = {
  displayName: "",
  email: "",
  priceAlerts: true,
  autoRefresh: false,
};

const SUPPORTED_COIN_IDS = new Set(DEFAULT_WATCHLIST);
const SUPPORTED_SYMBOLS_BY_ID = new Map(COINS.map((coin) => [coin.id, coin.symbol]));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStorageValue(raw: string | null): unknown {
  if (!raw) return undefined;

  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function copyDefaultTrades(): PaperTrade[] {
  return DEFAULT_TRADES.map((trade) => ({ ...trade }));
}

function normalizeWatchlist(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_WATCHLIST];
  return DEFAULT_WATCHLIST.filter((coinId) => value.includes(coinId));
}

function normalizeTrades(value: unknown): PaperTrade[] {
  if (!Array.isArray(value)) return copyDefaultTrades();

  const trades: PaperTrade[] = [];
  const tradeIds = new Set<string>();

  for (const item of value) {
    if (!isRecord(item)) continue;

    const trade = item as unknown as PaperTrade;
    if (!isValidPaperTrade(trade) || tradeIds.has(trade.id)) continue;

    if (trade.type === "sell" && trade.amount > getPaperHoldings(trades, trade.coinId)) {
      continue;
    }

    tradeIds.add(trade.id);
    trades.push({ ...trade });
  }

  return trades;
}

function normalizeSettings(value: unknown): AppSettings {
  if (!isRecord(value)) return { ...DEFAULT_SETTINGS };

  return {
    displayName: typeof value.displayName === "string" ? value.displayName : "",
    email: typeof value.email === "string" ? value.email : "",
    priceAlerts: typeof value.priceAlerts === "boolean"
      ? value.priceAlerts
      : DEFAULT_SETTINGS.priceAlerts,
    autoRefresh: typeof value.autoRefresh === "boolean"
      ? value.autoRefresh
      : DEFAULT_SETTINGS.autoRefresh,
  };
}

function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function normalizeAlerts(value: unknown): PriceAlert[] {
  if (!Array.isArray(value)) return [];

  const alerts: PriceAlert[] = [];
  const alertIds = new Set<string>();

  for (const item of value) {
    if (!isRecord(item) || typeof item.coinId !== "string") continue;

    const expectedSymbol = SUPPORTED_SYMBOLS_BY_ID.get(item.coinId);
    const triggeredAt = item.triggeredAt;

    if (
      typeof item.id !== "string" ||
      item.id.trim() === "" ||
      !SUPPORTED_COIN_IDS.has(item.coinId) ||
      !expectedSymbol ||
      item.symbol !== expectedSymbol ||
      (item.condition !== "above" && item.condition !== "below") ||
      typeof item.targetPrice !== "number" ||
      !Number.isFinite(item.targetPrice) ||
      item.targetPrice <= 0 ||
      typeof item.isActive !== "boolean" ||
      typeof item.isTriggered !== "boolean" ||
      !isValidDateString(item.createdAt) ||
      (triggeredAt !== undefined && !isValidDateString(triggeredAt)) ||
      alertIds.has(item.id)
    ) {
      continue;
    }

    const alert: PriceAlert = {
      id: item.id,
      coinId: item.coinId,
      symbol: expectedSymbol,
      condition: item.condition,
      targetPrice: item.targetPrice,
      isActive: item.isActive,
      isTriggered: item.isTriggered,
      createdAt: item.createdAt,
    };

    if (typeof triggeredAt === "string") {
      alert.triggeredAt = triggeredAt;
    }

    alertIds.add(alert.id);
    alerts.push(alert);
  }

  return alerts;
}

function loadState(): AppState {
  try {
    const watchlistRaw = localStorage.getItem(STORAGE_KEYS.watchlist);
    const tradesRaw = localStorage.getItem(STORAGE_KEYS.trades);
    const settingsRaw = localStorage.getItem(STORAGE_KEYS.settings);
    const alertsRaw = localStorage.getItem(STORAGE_KEYS.alerts);

    const watchlist = watchlistRaw
      ? normalizeWatchlist(parseStorageValue(watchlistRaw))
      : [...DEFAULT_WATCHLIST];
    const trades = tradesRaw ? normalizeTrades(parseStorageValue(tradesRaw)) : copyDefaultTrades();
    const settings = settingsRaw
      ? normalizeSettings(parseStorageValue(settingsRaw))
      : { ...DEFAULT_SETTINGS };
    const alerts = alertsRaw ? normalizeAlerts(parseStorageValue(alertsRaw)) : [];

    return { watchlist, trades, settings, alerts };
  } catch {
    return {
      watchlist: [...DEFAULT_WATCHLIST],
      trades: copyDefaultTrades(),
      settings: { ...DEFAULT_SETTINGS },
      alerts: [],
    };
  }
}

function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEYS.watchlist, JSON.stringify(state.watchlist));
    localStorage.setItem(STORAGE_KEYS.trades, JSON.stringify(state.trades));
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
    localStorage.setItem(STORAGE_KEYS.alerts, JSON.stringify(state.alerts));
  } catch {
    // silently fail
  }
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "ADD_TO_WATCHLIST":
      if (!SUPPORTED_COIN_IDS.has(action.payload) || state.watchlist.includes(action.payload)) {
        return state;
      }
      return { ...state, watchlist: [...state.watchlist, action.payload] };

    case "REMOVE_FROM_WATCHLIST":
      return { ...state, watchlist: state.watchlist.filter((id) => id !== action.payload) };

    case "RESTORE_DEFAULT_WATCHLIST":
      return { ...state, watchlist: [...DEFAULT_WATCHLIST] };

    case "ADD_TRADE":
      if (
        !isValidPaperTrade(action.payload) ||
        state.trades.some((trade) => trade.id === action.payload.id)
      ) {
        return state;
      }
      if (
        action.payload.type === "sell" &&
        action.payload.amount > getPaperHoldings(state.trades, action.payload.coinId)
      ) {
        return state;
      }
      return { ...state, trades: [...state.trades, action.payload] };

    case "DELETE_TRADE":
      return { ...state, trades: state.trades.filter((t) => t.id !== action.payload) };

    case "CLEAR_TRADES":
      return { ...state, trades: [] };

    case "RESTORE_SAMPLE_TRADES":
      return { ...state, trades: DEFAULT_TRADES.map((trade) => ({ ...trade })) };

    case "ADD_PRICE_ALERT":
      return { ...state, alerts: [...state.alerts, action.payload] };

    case "DELETE_PRICE_ALERT":
      return { ...state, alerts: state.alerts.filter((alert) => alert.id !== action.payload) };

    case "SET_PRICE_ALERT_ACTIVE":
      return {
        ...state,
        alerts: state.alerts.map((alert) =>
          alert.id === action.payload.id
            ? { ...alert, isActive: action.payload.isActive }
            : alert,
        ),
      };

    case "RESET_PRICE_ALERT":
      return {
        ...state,
        alerts: state.alerts.map((alert) =>
          alert.id === action.payload
            ? { ...alert, isTriggered: false, triggeredAt: undefined }
            : alert,
        ),
      };

    case "CHECK_PRICE_ALERTS": {
      if (!state.settings.priceAlerts) return state;

      let hasTriggeredAlert = false;
      const alerts = state.alerts.map((alert) => {
        if (!alert.isActive || alert.isTriggered) return alert;

        const currentPrice = action.payload.prices[alert.coinId];
        if (!Number.isFinite(currentPrice)) return alert;

        const shouldTrigger = alert.condition === "above"
          ? currentPrice > alert.targetPrice
          : currentPrice < alert.targetPrice;

        if (!shouldTrigger) return alert;

        hasTriggeredAlert = true;
        return {
          ...alert,
          isTriggered: true,
          triggeredAt: action.payload.triggeredAt,
        };
      });

      return hasTriggeredAlert ? { ...state, alerts } : state;
    }

    case "UPDATE_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.payload } };

    case "LOAD_STATE":
      return action.payload;

    default:
      return state;
  }
}

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
      dispatch({
        type: "CHECK_PRICE_ALERTS",
        payload: {
          prices: Object.fromEntries(
            livePrices.map((price) => [price.coinId, price.price]),
          ),
          triggeredAt: new Date().toISOString(),
        },
      });
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
