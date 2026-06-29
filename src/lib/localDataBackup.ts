import { DEFAULT_WATCHLIST } from "@/data/mockData";
import {
  isValidPaperSignal,
  MAX_PAPER_SIGNAL_HISTORY,
  type PaperSignal,
} from "@/lib/paperSignalEngine";
import { isValidPaperTrade } from "@/lib/paperTradeUtils";
import type { AppSettings, AppState, PaperTrade, PriceAlert } from "@/types";

export const BACKUP_SCHEMA_VERSION = 1 as const;
export const BACKUP_APP_NAME = "CHANTER Crypto Radar" as const;

const DEFAULT_LOCAL_SETTINGS: AppSettings = {
  displayName: "",
  email: "",
  priceAlerts: true,
  autoRefresh: false,
};

const SUPPORTED_SYMBOLS_BY_ID = new Map([
  ["btc", "BTC"],
  ["eth", "ETH"],
  ["sol", "SOL"],
  ["ada", "ADA"],
  ["avax", "AVAX"],
]);
const SUPPORTED_COIN_IDS = new Set(DEFAULT_WATCHLIST);

export interface LocalDataBackup {
  version: typeof BACKUP_SCHEMA_VERSION;
  app: typeof BACKUP_APP_NAME;
  exportedAt: string;
  watchlist: string[];
  paperTrades: PaperTrade[];
  priceAlerts: PriceAlert[];
  paperSignals: PaperSignal[];
  settings: AppSettings;
}

export interface ImportedLocalDataBackup {
  state: AppState;
  paperSignals: PaperSignal[];
}

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function hasDuplicateStrings(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

function validateWatchlist(value: unknown): ValidationResult<string[]> {
  if (!Array.isArray(value)) {
    return { ok: false, message: "Backup watchlist must be an array." };
  }

  if (!value.every((coinId) => typeof coinId === "string")) {
    return { ok: false, message: "Backup watchlist contains an invalid coin id." };
  }

  if (!value.every((coinId) => SUPPORTED_COIN_IDS.has(coinId))) {
    return { ok: false, message: "Backup watchlist contains an unsupported coin." };
  }

  if (hasDuplicateStrings(value)) {
    return { ok: false, message: "Backup watchlist contains duplicate coins." };
  }

  return { ok: true, value: [...value] };
}

function validatePaperTrades(value: unknown): ValidationResult<PaperTrade[]> {
  if (!Array.isArray(value)) {
    return { ok: false, message: "Backup paper trades must be an array." };
  }

  const trades: PaperTrade[] = [];
  const tradeIds = new Set<string>();
  const holdingsByCoinId = new Map<string, number>();

  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || item.id.trim() === "") {
      return { ok: false, message: "Backup contains an invalid paper trade." };
    }

    const trade = item as unknown as PaperTrade;
    if (!isValidPaperTrade(trade)) {
      return { ok: false, message: "Backup contains an invalid paper trade." };
    }

    if (tradeIds.has(trade.id)) {
      return { ok: false, message: "Backup contains duplicate paper trade ids." };
    }

    const currentHoldings = holdingsByCoinId.get(trade.coinId) ?? 0;
    if (trade.type === "sell" && trade.amount > currentHoldings) {
      return { ok: false, message: "Backup contains a sell trade larger than current holdings." };
    }

    tradeIds.add(trade.id);
    holdingsByCoinId.set(
      trade.coinId,
      trade.type === "buy"
        ? currentHoldings + trade.amount
        : currentHoldings - trade.amount,
    );
    trades.push({ ...trade });
  }

  return { ok: true, value: trades };
}

function validatePriceAlerts(value: unknown): ValidationResult<PriceAlert[]> {
  if (!Array.isArray(value)) {
    return { ok: false, message: "Backup price alerts must be an array." };
  }

  const alerts: PriceAlert[] = [];
  const alertIds = new Set<string>();

  for (const item of value) {
    if (!isRecord(item)) {
      return { ok: false, message: "Backup contains an invalid price alert." };
    }

    const expectedSymbol = typeof item.coinId === "string"
      ? SUPPORTED_SYMBOLS_BY_ID.get(item.coinId)
      : undefined;
    const triggeredAt = item.triggeredAt;

    if (
      typeof item.id !== "string" ||
      item.id.trim() === "" ||
      typeof item.coinId !== "string" ||
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
      (triggeredAt !== undefined && !isValidDateString(triggeredAt))
    ) {
      return { ok: false, message: "Backup contains an invalid price alert." };
    }

    if (alertIds.has(item.id)) {
      return { ok: false, message: "Backup contains duplicate price alert ids." };
    }

    alertIds.add(item.id);
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

    alerts.push(alert);
  }

  return { ok: true, value: alerts };
}

function validatePaperSignals(value: unknown): ValidationResult<PaperSignal[]> {
  if (value === undefined) {
    return { ok: true, value: [] };
  }

  if (!Array.isArray(value)) {
    return { ok: false, message: "Backup paper signal history must be an array." };
  }

  const signalIds = new Set<string>();
  const signals: PaperSignal[] = [];

  for (const item of value) {
    if (!isValidPaperSignal(item)) {
      return { ok: false, message: "Backup contains an invalid paper signal." };
    }

    if (signalIds.has(item.id)) {
      return { ok: false, message: "Backup contains duplicate paper signal ids." };
    }

    signalIds.add(item.id);
    signals.push({ ...item });
  }

  return { ok: true, value: signals.slice(0, MAX_PAPER_SIGNAL_HISTORY) };
}

function validateSettings(value: unknown): ValidationResult<AppSettings> {
  if (!isRecord(value)) {
    return { ok: false, message: "Backup settings must be an object." };
  }

  if (
    typeof value.displayName !== "string" ||
    typeof value.email !== "string" ||
    typeof value.priceAlerts !== "boolean" ||
    typeof value.autoRefresh !== "boolean"
  ) {
    return { ok: false, message: "Backup settings are invalid." };
  }

  return {
    ok: true,
    value: {
      displayName: value.displayName,
      email: value.email,
      priceAlerts: value.priceAlerts,
      autoRefresh: value.autoRefresh,
    },
  };
}

export function createEmptyLocalAppState(): AppState {
  return {
    watchlist: [],
    trades: [],
    alerts: [],
    settings: { ...DEFAULT_LOCAL_SETTINGS },
  };
}

export function createLocalDataBackup(
  state: AppState,
  paperSignals: PaperSignal[] = [],
): LocalDataBackup {
  return {
    version: BACKUP_SCHEMA_VERSION,
    app: BACKUP_APP_NAME,
    exportedAt: new Date().toISOString(),
    watchlist: [...state.watchlist],
    paperTrades: state.trades.map((trade) => ({ ...trade })),
    priceAlerts: state.alerts.map((alert) => ({ ...alert })),
    paperSignals: paperSignals
      .filter(isValidPaperSignal)
      .slice(0, MAX_PAPER_SIGNAL_HISTORY)
      .map((signal) => ({ ...signal })),
    settings: { ...state.settings },
  };
}

export function parseLocalDataBackup(
  rawJson: string,
): ValidationResult<ImportedLocalDataBackup> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, message: "Import failed. The selected file is not valid JSON." };
  }

  if (!isRecord(parsed)) {
    return { ok: false, message: "Import failed. Backup file must contain a JSON object." };
  }

  if (parsed.version !== BACKUP_SCHEMA_VERSION || parsed.app !== BACKUP_APP_NAME) {
    return { ok: false, message: "Import failed. Unsupported backup schema." };
  }

  if (!isValidDateString(parsed.exportedAt)) {
    return { ok: false, message: "Import failed. Backup timestamp is invalid." };
  }

  const watchlist = validateWatchlist(parsed.watchlist);
  if (watchlist.ok === false) {
    return { ok: false, message: `Import failed. ${watchlist.message}` };
  }

  const trades = validatePaperTrades(parsed.paperTrades);
  if (trades.ok === false) {
    return { ok: false, message: `Import failed. ${trades.message}` };
  }

  const alerts = validatePriceAlerts(parsed.priceAlerts);
  if (alerts.ok === false) {
    return { ok: false, message: `Import failed. ${alerts.message}` };
  }

  const paperSignals = validatePaperSignals(parsed.paperSignals);
  if (paperSignals.ok === false) {
    return { ok: false, message: `Import failed. ${paperSignals.message}` };
  }

  const settings = validateSettings(parsed.settings);
  if (settings.ok === false) {
    return { ok: false, message: `Import failed. ${settings.message}` };
  }

  return {
    ok: true,
    value: {
      state: {
        watchlist: watchlist.value,
        trades: trades.value,
        alerts: alerts.value,
        settings: settings.value,
      },
      paperSignals: paperSignals.value,
    },
  };
}
