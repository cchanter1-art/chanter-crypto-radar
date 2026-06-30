import { DEFAULT_WATCHLIST } from "@/data/mockData";
import {
  MAX_BACKTEST_HISTORY,
  normalizeBacktestRun,
  type BacktestRun,
} from "@/lib/paperBacktestEngine";
import {
  DEFAULT_PAPER_SIGNAL_SENSITIVITY,
  isValidPaperSignal,
  isPaperSignalSensitivity,
  MAX_PAPER_SIGNAL_HISTORY,
  type PaperSignal,
  type PaperSignalSensitivity,
} from "@/lib/paperSignalEngine";
import {
  DEFAULT_PAPER_RISK_SETTINGS,
  MAX_PAPER_RISK_JOURNAL,
  normalizePaperRiskJournalEntry,
  normalizePaperRiskSettings,
  type PaperRiskJournalEntry,
  type PaperRiskSettings,
} from "@/lib/paperRiskController";
import {
  DEFAULT_FUTURES_TEST_SCENARIO,
  DEFAULT_FUTURES_PAPER_SETTINGS,
  isFuturesTestScenario,
  MAX_FUTURES_PAPER_HISTORY,
  normalizeFuturesHistoryRecord,
  normalizeFuturesPaperPosition,
  normalizeFuturesPaperSettings,
  type FuturesPaperHistoryRecord,
  type FuturesPaperPosition,
  type FuturesPaperSettings,
  type FuturesTestScenario,
} from "@/lib/futuresPaperEngine";
import {
  DEFAULT_FUTURES_STRATEGY_PROFILE,
  isFuturesStrategyProfile,
  type FuturesStrategyProfile,
} from "@/lib/futuresStrategyProfiles";
import {
  MAX_FUTURES_STRATEGY_BACKTEST_HISTORY,
  normalizeFuturesStrategyBacktestRun,
  type FuturesStrategyBacktestRun,
} from "@/lib/futuresStrategyBacktest";
import {
  normalizeForwardTestData,
  type ForwardTestData,
} from "@/lib/forwardTestSession";
import {
  MAX_SIGNAL_QUALITY_HISTORY,
  normalizeSignalQualityRecord,
  type SignalQualityRecord,
} from "@/lib/signalQualityScore";
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
  signalSensitivity: PaperSignalSensitivity;
  backtestRuns: BacktestRun[];
  riskControllerSettings: PaperRiskSettings;
  riskJournal: PaperRiskJournalEntry[];
  futuresPaperSettings: FuturesPaperSettings;
  futuresPaperPositions: FuturesPaperPosition[];
  futuresPaperHistory: FuturesPaperHistoryRecord[];
  futuresStrategyProfile: FuturesStrategyProfile;
  futuresTestScenario: FuturesTestScenario;
  futuresStrategyBacktests: FuturesStrategyBacktestRun[];
  forwardTestData: ForwardTestData;
  signalQualityHistory: SignalQualityRecord[];
  settings: AppSettings;
}

export interface ImportedLocalDataBackup {
  state: AppState;
  paperSignals: PaperSignal[];
  signalSensitivity: PaperSignalSensitivity;
  backtestRuns: BacktestRun[];
  riskSettings: PaperRiskSettings;
  riskJournal: PaperRiskJournalEntry[];
  futuresSettings: FuturesPaperSettings;
  futuresPositions: FuturesPaperPosition[];
  futuresHistory: FuturesPaperHistoryRecord[];
  futuresStrategyProfile: FuturesStrategyProfile;
  futuresTestScenario: FuturesTestScenario;
  futuresStrategyBacktests: FuturesStrategyBacktestRun[];
  forwardTestData: ForwardTestData;
  signalQualityHistory: SignalQualityRecord[];
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

function validateSignalSensitivity(
  value: unknown,
): ValidationResult<PaperSignalSensitivity> {
  if (value === undefined) {
    return { ok: true, value: DEFAULT_PAPER_SIGNAL_SENSITIVITY };
  }
  if (!isPaperSignalSensitivity(value)) {
    return { ok: false, message: "Backup signal sensitivity is invalid." };
  }
  return { ok: true, value };
}

function validateBacktestRuns(value: unknown): ValidationResult<BacktestRun[]> {
  if (value === undefined) {
    return { ok: true, value: [] };
  }

  if (!Array.isArray(value)) {
    return { ok: false, message: "Backup backtest history must be an array." };
  }

  const runIds = new Set<string>();
  const runs: BacktestRun[] = [];

  for (const item of value) {
    const normalizedRun = normalizeBacktestRun(item);
    if (!normalizedRun) {
      return { ok: false, message: "Backup contains an invalid backtest run." };
    }

    if (runIds.has(normalizedRun.id)) {
      return { ok: false, message: "Backup contains duplicate backtest run ids." };
    }

    runIds.add(normalizedRun.id);
    runs.push({
      ...normalizedRun,
      config: { ...normalizedRun.config },
      metrics: { ...normalizedRun.metrics },
      signalCounts: { ...normalizedRun.signalCounts },
      events: normalizedRun.events.map((event) => ({ ...event })),
    });
  }

  return { ok: true, value: runs.slice(0, MAX_BACKTEST_HISTORY) };
}

function validateRiskSettings(value: unknown): ValidationResult<PaperRiskSettings> {
  if (value === undefined) {
    return { ok: true, value: { ...DEFAULT_PAPER_RISK_SETTINGS } };
  }

  const settings = normalizePaperRiskSettings(value);
  if (!settings) {
    return { ok: false, message: "Backup Paper Risk Controller settings are invalid." };
  }

  return { ok: true, value: settings };
}

function validateRiskJournal(value: unknown): ValidationResult<PaperRiskJournalEntry[]> {
  if (value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value)) {
    return { ok: false, message: "Backup Risk Journal must be an array." };
  }

  const entries: PaperRiskJournalEntry[] = [];
  const entryIds = new Set<string>();

  for (const item of value) {
    const entry = normalizePaperRiskJournalEntry(item);
    if (!entry) {
      return { ok: false, message: "Backup contains an invalid Risk Journal record." };
    }
    if (entryIds.has(entry.id)) {
      return { ok: false, message: "Backup contains duplicate Risk Journal ids." };
    }

    entryIds.add(entry.id);
    entries.push(entry);
  }

  return { ok: true, value: entries.slice(0, MAX_PAPER_RISK_JOURNAL) };
}

function validateFuturesSettings(value: unknown): ValidationResult<FuturesPaperSettings> {
  if (value === undefined) {
    return { ok: true, value: { ...DEFAULT_FUTURES_PAPER_SETTINGS } };
  }
  const settings = normalizeFuturesPaperSettings(value);
  return settings
    ? { ok: true, value: settings }
    : { ok: false, message: "Backup futures paper settings are invalid." };
}

function validateFuturesPositions(value: unknown): ValidationResult<FuturesPaperPosition[]> {
  if (value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value)) {
    return { ok: false, message: "Backup futures paper positions must be an array." };
  }

  const positions: FuturesPaperPosition[] = [];
  const positionIds = new Set<string>();
  const symbols = new Set<string>();
  for (const item of value) {
    const position = normalizeFuturesPaperPosition(item);
    if (!position) {
      return { ok: false, message: "Backup contains an invalid futures paper position." };
    }
    if (positionIds.has(position.id) || symbols.has(position.symbol)) {
      return { ok: false, message: "Backup contains duplicate futures positions." };
    }
    positionIds.add(position.id);
    symbols.add(position.symbol);
    positions.push(position);
  }
  return { ok: true, value: positions };
}

function validateFuturesHistory(value: unknown): ValidationResult<FuturesPaperHistoryRecord[]> {
  if (value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value)) {
    return { ok: false, message: "Backup futures paper history must be an array." };
  }

  const records: FuturesPaperHistoryRecord[] = [];
  const recordIds = new Set<string>();
  for (const item of value) {
    const record = normalizeFuturesHistoryRecord(item);
    if (!record) {
      return { ok: false, message: "Backup contains an invalid futures paper history record." };
    }
    if (recordIds.has(record.recordId)) {
      return { ok: false, message: "Backup contains duplicate futures paper history ids." };
    }
    recordIds.add(record.recordId);
    records.push(record);
  }
  return { ok: true, value: records.slice(0, MAX_FUTURES_PAPER_HISTORY) };
}

function validateFuturesStrategyProfile(
  value: unknown,
): ValidationResult<FuturesStrategyProfile> {
  if (value === undefined) {
    return { ok: true, value: DEFAULT_FUTURES_STRATEGY_PROFILE };
  }
  return isFuturesStrategyProfile(value)
    ? { ok: true, value }
    : { ok: false, message: "Backup futures strategy profile is invalid." };
}

function validateFuturesTestScenario(
  value: unknown,
): ValidationResult<FuturesTestScenario> {
  if (value === undefined) {
    return { ok: true, value: DEFAULT_FUTURES_TEST_SCENARIO };
  }
  return isFuturesTestScenario(value)
    ? { ok: true, value }
    : { ok: false, message: "Backup futures test scenario is invalid." };
}

function validateFuturesStrategyBacktests(
  value: unknown,
): ValidationResult<FuturesStrategyBacktestRun[]> {
  if (value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value)) {
    return { ok: false, message: "Backup futures strategy backtest history must be an array." };
  }

  const runs: FuturesStrategyBacktestRun[] = [];
  const runIds = new Set<string>();
  for (const item of value) {
    const run = normalizeFuturesStrategyBacktestRun(item);
    if (!run) {
      return { ok: false, message: "Backup contains an invalid futures strategy backtest record." };
    }
    if (runIds.has(run.id)) {
      return { ok: false, message: "Backup contains duplicate futures strategy backtest ids." };
    }
    runIds.add(run.id);
    runs.push(run);
  }

  return { ok: true, value: runs.slice(0, MAX_FUTURES_STRATEGY_BACKTEST_HISTORY) };
}

function validateForwardTestData(value: unknown): ValidationResult<ForwardTestData> {
  if (value === undefined) {
    return { ok: true, value: { activeSession: null, completedSessions: [] } };
  }
  const normalized = normalizeForwardTestData(value);
  return normalized
    ? { ok: true, value: normalized }
    : { ok: false, message: "Backup forward test session data is invalid." };
}

function validateSignalQualityHistory(value: unknown): ValidationResult<SignalQualityRecord[]> {
  if (value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value)) {
    return { ok: false, message: "Backup Signal Quality Score history must be an array." };
  }
  const records: SignalQualityRecord[] = [];
  const recordIds = new Set<string>();
  for (const item of value) {
    const record = normalizeSignalQualityRecord(item);
    if (!record) {
      return { ok: false, message: "Backup contains an invalid Signal Quality Score record." };
    }
    if (recordIds.has(record.id)) {
      return { ok: false, message: "Backup contains duplicate Signal Quality Score ids." };
    }
    recordIds.add(record.id);
    records.push(record);
  }
  return { ok: true, value: records.slice(0, MAX_SIGNAL_QUALITY_HISTORY) };
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
  backtestRuns: BacktestRun[] = [],
  riskSettings: PaperRiskSettings = DEFAULT_PAPER_RISK_SETTINGS,
  riskJournal: PaperRiskJournalEntry[] = [],
  signalSensitivity: PaperSignalSensitivity = DEFAULT_PAPER_SIGNAL_SENSITIVITY,
  futuresSettings: FuturesPaperSettings = DEFAULT_FUTURES_PAPER_SETTINGS,
  futuresPositions: FuturesPaperPosition[] = [],
  futuresHistory: FuturesPaperHistoryRecord[] = [],
  futuresStrategyProfile: FuturesStrategyProfile = DEFAULT_FUTURES_STRATEGY_PROFILE,
  futuresTestScenario: FuturesTestScenario = DEFAULT_FUTURES_TEST_SCENARIO,
  futuresStrategyBacktests: FuturesStrategyBacktestRun[] = [],
  forwardTestData: ForwardTestData = { activeSession: null, completedSessions: [] },
  signalQualityHistory: SignalQualityRecord[] = [],
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
    signalSensitivity: isPaperSignalSensitivity(signalSensitivity)
      ? signalSensitivity
      : DEFAULT_PAPER_SIGNAL_SENSITIVITY,
    backtestRuns: backtestRuns
      .map(normalizeBacktestRun)
      .filter((run): run is BacktestRun => run !== null)
      .slice(0, MAX_BACKTEST_HISTORY)
      .map((run) => ({
        ...run,
        config: { ...run.config },
        metrics: { ...run.metrics },
        signalCounts: { ...run.signalCounts },
        events: run.events.map((event) => ({ ...event })),
      })),
    riskControllerSettings:
      normalizePaperRiskSettings(riskSettings) ?? { ...DEFAULT_PAPER_RISK_SETTINGS },
    riskJournal: riskJournal
      .map(normalizePaperRiskJournalEntry)
      .filter((entry): entry is PaperRiskJournalEntry => entry !== null)
      .slice(0, MAX_PAPER_RISK_JOURNAL),
    futuresPaperSettings:
      normalizeFuturesPaperSettings(futuresSettings) ?? { ...DEFAULT_FUTURES_PAPER_SETTINGS },
    futuresPaperPositions: futuresPositions
      .map(normalizeFuturesPaperPosition)
      .filter((position): position is FuturesPaperPosition => position !== null),
    futuresPaperHistory: futuresHistory
      .map(normalizeFuturesHistoryRecord)
      .filter((record): record is FuturesPaperHistoryRecord => record !== null)
      .slice(0, MAX_FUTURES_PAPER_HISTORY),
    futuresStrategyProfile: isFuturesStrategyProfile(futuresStrategyProfile)
      ? futuresStrategyProfile
      : DEFAULT_FUTURES_STRATEGY_PROFILE,
    futuresTestScenario: isFuturesTestScenario(futuresTestScenario)
      ? futuresTestScenario
      : DEFAULT_FUTURES_TEST_SCENARIO,
    futuresStrategyBacktests: futuresStrategyBacktests
      .map(normalizeFuturesStrategyBacktestRun)
      .filter((run): run is FuturesStrategyBacktestRun => run !== null)
      .slice(0, MAX_FUTURES_STRATEGY_BACKTEST_HISTORY),
    forwardTestData: normalizeForwardTestData(forwardTestData) ?? {
      activeSession: null,
      completedSessions: [],
    },
    signalQualityHistory: signalQualityHistory
      .map(normalizeSignalQualityRecord)
      .filter((record): record is SignalQualityRecord => record !== null)
      .slice(0, MAX_SIGNAL_QUALITY_HISTORY),
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

  const signalSensitivity = validateSignalSensitivity(parsed.signalSensitivity);
  if (signalSensitivity.ok === false) {
    return { ok: false, message: `Import failed. ${signalSensitivity.message}` };
  }

  const backtestRuns = validateBacktestRuns(parsed.backtestRuns);
  if (backtestRuns.ok === false) {
    return { ok: false, message: `Import failed. ${backtestRuns.message}` };
  }

  const riskSettings = validateRiskSettings(parsed.riskControllerSettings);
  if (riskSettings.ok === false) {
    return { ok: false, message: `Import failed. ${riskSettings.message}` };
  }

  const riskJournal = validateRiskJournal(parsed.riskJournal);
  if (riskJournal.ok === false) {
    return { ok: false, message: `Import failed. ${riskJournal.message}` };
  }

  const futuresSettings = validateFuturesSettings(parsed.futuresPaperSettings);
  if (futuresSettings.ok === false) {
    return { ok: false, message: `Import failed. ${futuresSettings.message}` };
  }

  const futuresPositions = validateFuturesPositions(parsed.futuresPaperPositions);
  if (futuresPositions.ok === false) {
    return { ok: false, message: `Import failed. ${futuresPositions.message}` };
  }

  const futuresHistory = validateFuturesHistory(parsed.futuresPaperHistory);
  if (futuresHistory.ok === false) {
    return { ok: false, message: `Import failed. ${futuresHistory.message}` };
  }

  const futuresStrategyProfile = validateFuturesStrategyProfile(parsed.futuresStrategyProfile);
  if (futuresStrategyProfile.ok === false) {
    return { ok: false, message: `Import failed. ${futuresStrategyProfile.message}` };
  }

  const futuresTestScenario = validateFuturesTestScenario(parsed.futuresTestScenario);
  if (futuresTestScenario.ok === false) {
    return { ok: false, message: `Import failed. ${futuresTestScenario.message}` };
  }

  const futuresStrategyBacktests = validateFuturesStrategyBacktests(
    parsed.futuresStrategyBacktests,
  );
  if (futuresStrategyBacktests.ok === false) {
    return { ok: false, message: `Import failed. ${futuresStrategyBacktests.message}` };
  }

  const forwardTestData = validateForwardTestData(parsed.forwardTestData);
  if (forwardTestData.ok === false) {
    return { ok: false, message: `Import failed. ${forwardTestData.message}` };
  }

  const signalQualityHistory = validateSignalQualityHistory(parsed.signalQualityHistory);
  if (signalQualityHistory.ok === false) {
    return { ok: false, message: `Import failed. ${signalQualityHistory.message}` };
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
      signalSensitivity: signalSensitivity.value,
      backtestRuns: backtestRuns.value,
      riskSettings: riskSettings.value,
      riskJournal: riskJournal.value,
      futuresSettings: futuresSettings.value,
      futuresPositions: futuresPositions.value,
      futuresHistory: futuresHistory.value,
      futuresStrategyProfile: futuresStrategyProfile.value,
      futuresTestScenario: futuresTestScenario.value,
      futuresStrategyBacktests: futuresStrategyBacktests.value,
      forwardTestData: forwardTestData.value,
      signalQualityHistory: signalQualityHistory.value,
    },
  };
}
