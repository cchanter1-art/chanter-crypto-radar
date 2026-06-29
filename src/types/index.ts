export interface Coin {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  sparkline: number[];
  color: string;
}

export interface PaperTrade {
  id: string;
  coinId: string;
  type: "buy" | "sell";
  amount: number;
  price: number;
  date: string;
}

export interface PriceAlert {
  id: string;
  coinId: string;
  symbol: string;
  condition: "above" | "below";
  targetPrice: number;
  isActive: boolean;
  isTriggered: boolean;
  createdAt: string;
  triggeredAt?: string;
}

export interface PortfolioPosition {
  coinId: string;
  holdings: number;
  avgPrice: number;
  currentPrice: number;
  currentValue: number;
  invested: number;
  pl: number;
  plPercent: number;
}

export interface AppSettings {
  displayName: string;
  email: string;
  priceAlerts: boolean;
  autoRefresh: boolean;
}

export interface AppState {
  watchlist: string[];
  trades: PaperTrade[];
  settings: AppSettings;
  alerts: PriceAlert[];
}

export type AppAction =
  | { type: "ADD_TO_WATCHLIST"; payload: string }
  | { type: "REMOVE_FROM_WATCHLIST"; payload: string }
  | { type: "ADD_TRADE"; payload: PaperTrade }
  | { type: "DELETE_TRADE"; payload: string }
  | { type: "ADD_PRICE_ALERT"; payload: PriceAlert }
  | { type: "DELETE_PRICE_ALERT"; payload: string }
  | { type: "SET_PRICE_ALERT_ACTIVE"; payload: { id: string; isActive: boolean } }
  | { type: "RESET_PRICE_ALERT"; payload: string }
  | {
      type: "CHECK_PRICE_ALERTS";
      payload: { prices: Record<string, number>; triggeredAt: string };
    }
  | { type: "UPDATE_SETTINGS"; payload: Partial<AppSettings> }
  | { type: "LOAD_STATE"; payload: AppState };
