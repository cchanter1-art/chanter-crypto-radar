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
}

export type AppAction =
  | { type: "ADD_TO_WATCHLIST"; payload: string }
  | { type: "REMOVE_FROM_WATCHLIST"; payload: string }
  | { type: "ADD_TRADE"; payload: PaperTrade }
  | { type: "DELETE_TRADE"; payload: string }
  | { type: "UPDATE_SETTINGS"; payload: Partial<AppSettings> }
  | { type: "LOAD_STATE"; payload: AppState };
