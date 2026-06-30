import type { PaperSignal, PaperSignalLabel } from "@/lib/paperSignalEngine";
import type { PaperTrade, PortfolioPosition } from "@/types";

export type PaperRiskDecisionType = "APPROVED" | "BLOCKED" | "REDUCED" | "WAIT";

export interface PaperRiskSettings {
  maxAllocationPerCoinPercent: number;
  maxTradeSizePercent: number;
  maxDrawdownWarningPercent: number;
  blockBuyDrawdownPercent: number;
  lossCooldownHours: number;
}

export interface PaperRiskDecision {
  decision: PaperRiskDecisionType;
  reason: string;
  suggestedMaxTradeValue?: number;
  suggestedQuantity?: number;
}

export interface PaperRiskJournalEntry {
  id: string;
  timestamp: string;
  coinId: string;
  symbol: string;
  signal: PaperSignalLabel;
  decision: PaperRiskDecisionType;
  reason: string;
  suggestedMaxTradeValue?: number;
}

interface EvaluatePaperRiskInput {
  signal: PaperSignal;
  positions: PortfolioPosition[];
  trades: PaperTrade[];
  totalValue: number;
  totalPLPercent: number;
  currentPrice: number;
  priceStatus: "loading" | "live" | "fallback";
  settings: PaperRiskSettings;
  now?: string;
}

export const PAPER_RISK_SETTINGS_STORAGE_KEY = "chanter-paper-risk-settings";
export const PAPER_RISK_JOURNAL_STORAGE_KEY = "chanter-paper-risk-journal";
export const MAX_PAPER_RISK_JOURNAL = 100;

export const DEFAULT_PAPER_RISK_SETTINGS: PaperRiskSettings = {
  maxAllocationPerCoinPercent: 50,
  maxTradeSizePercent: 25,
  maxDrawdownWarningPercent: 20,
  blockBuyDrawdownPercent: 30,
  lossCooldownHours: 24,
};

const SUPPORTED_COIN_IDS = new Set(["btc", "eth", "sol", "ada", "avax"]);
const SUPPORTED_SYMBOLS_BY_ID = new Map([
  ["btc", "BTC"],
  ["eth", "ETH"],
  ["sol", "SOL"],
  ["ada", "ADA"],
  ["avax", "AVAX"],
]);
const SIGNAL_LABELS = new Set<PaperSignalLabel>(["BUY", "SELL", "HOLD", "AVOID"]);
const DECISIONS = new Set<PaperRiskDecisionType>(["APPROVED", "BLOCKED", "REDUCED", "WAIT"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function copyDefaultSettings(): PaperRiskSettings {
  return { ...DEFAULT_PAPER_RISK_SETTINGS };
}

export function validatePaperRiskSettings(settings: PaperRiskSettings): string | null {
  if (
    !Number.isFinite(settings.maxAllocationPerCoinPercent) ||
    settings.maxAllocationPerCoinPercent < 1 ||
    settings.maxAllocationPerCoinPercent > 100
  ) {
    return "Maximum coin allocation must be between 1% and 100%.";
  }
  if (
    !Number.isFinite(settings.maxTradeSizePercent) ||
    settings.maxTradeSizePercent < 1 ||
    settings.maxTradeSizePercent > 100
  ) {
    return "Maximum trade size must be between 1% and 100%.";
  }
  if (
    !Number.isFinite(settings.maxDrawdownWarningPercent) ||
    settings.maxDrawdownWarningPercent < 1 ||
    settings.maxDrawdownWarningPercent > 100
  ) {
    return "Drawdown warning must be between 1% and 100%.";
  }
  if (
    !Number.isFinite(settings.blockBuyDrawdownPercent) ||
    settings.blockBuyDrawdownPercent < 1 ||
    settings.blockBuyDrawdownPercent > 100
  ) {
    return "Buy-block drawdown must be between 1% and 100%.";
  }
  if (settings.blockBuyDrawdownPercent < settings.maxDrawdownWarningPercent) {
    return "Buy-block drawdown cannot be lower than the drawdown warning.";
  }
  if (
    !Number.isFinite(settings.lossCooldownHours) ||
    settings.lossCooldownHours < 0 ||
    settings.lossCooldownHours > 168
  ) {
    return "Loss cooldown must be between 0 and 168 hours.";
  }
  return null;
}

export function normalizePaperRiskSettings(value: unknown): PaperRiskSettings | null {
  if (!isRecord(value)) return null;

  const settings: PaperRiskSettings = {
    maxAllocationPerCoinPercent: value.maxAllocationPerCoinPercent as number,
    maxTradeSizePercent: value.maxTradeSizePercent as number,
    maxDrawdownWarningPercent: value.maxDrawdownWarningPercent as number,
    blockBuyDrawdownPercent: value.blockBuyDrawdownPercent as number,
    lossCooldownHours: value.lossCooldownHours as number,
  };

  return validatePaperRiskSettings(settings) === null ? settings : null;
}

export function loadPaperRiskSettings(): PaperRiskSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(PAPER_RISK_SETTINGS_STORAGE_KEY) ?? "null");
    return normalizePaperRiskSettings(parsed) ?? copyDefaultSettings();
  } catch {
    return copyDefaultSettings();
  }
}

export function savePaperRiskSettings(settings: PaperRiskSettings): boolean {
  if (validatePaperRiskSettings(settings)) return false;

  try {
    localStorage.setItem(PAPER_RISK_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

export function clearPaperRiskSettings(): boolean {
  try {
    localStorage.removeItem(PAPER_RISK_SETTINGS_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function findLatestLosingSale(
  trades: PaperTrade[],
  coinId: string,
): string | null {
  let holdings = 0;
  let costBasis = 0;
  let latestLossTimestamp: string | null = null;

  for (const trade of trades) {
    if (trade.coinId !== coinId || trade.amount <= 0 || trade.price <= 0) continue;

    if (trade.type === "buy") {
      holdings += trade.amount;
      costBasis += trade.amount * trade.price;
      continue;
    }

    if (holdings <= 0) continue;
    const averageCost = costBasis / holdings;
    const sellQuantity = Math.min(trade.amount, holdings);

    if (trade.price < averageCost && isValidDate(trade.date)) {
      if (!latestLossTimestamp || Date.parse(trade.date) > Date.parse(latestLossTimestamp)) {
        latestLossTimestamp = trade.date;
      }
    }

    holdings -= sellQuantity;
    costBasis -= sellQuantity * averageCost;
    if (holdings < 1e-10) {
      holdings = 0;
      costBasis = 0;
    }
  }

  return latestLossTimestamp;
}

function createDecision(
  decision: PaperRiskDecisionType,
  reason: string,
  maxTradeValue?: number,
  currentPrice?: number,
): PaperRiskDecision {
  const result: PaperRiskDecision = { decision, reason };

  if (maxTradeValue !== undefined && Number.isFinite(maxTradeValue) && maxTradeValue > 0) {
    result.suggestedMaxTradeValue = maxTradeValue;
    if (currentPrice !== undefined && Number.isFinite(currentPrice) && currentPrice > 0) {
      result.suggestedQuantity = maxTradeValue / currentPrice;
    }
  }

  return result;
}

export function evaluatePaperRisk({
  signal,
  positions,
  trades,
  totalValue,
  totalPLPercent,
  currentPrice,
  priceStatus,
  settings,
  now = new Date().toISOString(),
}: EvaluatePaperRiskInput): PaperRiskDecision {
  if (signal.label === "HOLD") {
    return createDecision("WAIT", "HOLD signals do not open paper trades.");
  }
  if (signal.label === "AVOID") {
    return createDecision("BLOCKED", "AVOID signals are not eligible for paper trades.");
  }
  if (priceStatus !== "live") {
    return createDecision("WAIT", "Live price data is required before a signal can open a paper trade form.");
  }
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    return createDecision("WAIT", "A valid current price is required before sizing a paper trade.");
  }

  const position = positions.find((item) => item.coinId === signal.coinId);
  const holdings = position?.holdings ?? 0;
  const coinValue = position?.currentValue ?? 0;
  const allocationPercent = totalValue > 0 ? (coinValue / totalValue) * 100 : 0;

  if (signal.label === "SELL" && holdings <= 0) {
    return createDecision("BLOCKED", `No ${signal.symbol} paper holdings are available to sell.`);
  }

  if (
    signal.label === "BUY" &&
    totalValue > 0 &&
    allocationPercent >= settings.maxAllocationPerCoinPercent
  ) {
    return createDecision(
      "BLOCKED",
      `${signal.symbol} already represents ${allocationPercent.toFixed(1)}% of the paper portfolio, at or above the ${settings.maxAllocationPerCoinPercent}% limit.`,
    );
  }

  if (
    signal.label === "BUY" &&
    totalPLPercent <= -settings.blockBuyDrawdownPercent
  ) {
    return createDecision(
      "BLOCKED",
      `New paper buys are blocked while unrealized portfolio P/L is ${totalPLPercent.toFixed(2)}%, beyond the -${settings.blockBuyDrawdownPercent}% threshold.`,
    );
  }

  if (signal.confidence === "Low") {
    return createDecision("WAIT", "Low-confidence signals require waiting; no paper trade form was opened.");
  }

  if (signal.label === "BUY" && settings.lossCooldownHours > 0) {
    const latestLossTimestamp = findLatestLosingSale(trades, signal.coinId);
    const nowMs = Date.parse(now);
    const latestLossMs = latestLossTimestamp ? Date.parse(latestLossTimestamp) : Number.NaN;
    const cooldownMs = settings.lossCooldownHours * 60 * 60 * 1000;

    if (
      Number.isFinite(nowMs) &&
      Number.isFinite(latestLossMs) &&
      nowMs >= latestLossMs &&
      nowMs - latestLossMs < cooldownMs
    ) {
      const hoursRemaining = Math.ceil((cooldownMs - (nowMs - latestLossMs)) / (60 * 60 * 1000));
      return createDecision(
        "WAIT",
        `${signal.symbol} is in a local cooldown after a recent losing paper sale (${hoursRemaining}h remaining).`,
      );
    }
  }

  if (totalValue <= 0) {
    return createDecision(
      "WAIT",
      "No existing paper portfolio value is available for percentage sizing. Add a manual paper position before using signal-based trade creation.",
    );
  }

  const standardMaxTradeValue = totalValue * settings.maxTradeSizePercent / 100;

  if (signal.label === "SELL") {
    const holdingValue = holdings * currentPrice;
    const maxTradeValue = Math.min(standardMaxTradeValue, holdingValue);

    if (holdingValue > standardMaxTradeValue + 0.01) {
      return createDecision(
        "REDUCED",
        `The suggested sale is capped at ${settings.maxTradeSizePercent}% of current paper portfolio value.`,
        maxTradeValue,
        currentPrice,
      );
    }

    return createDecision(
      "APPROVED",
      "Paper holdings are sufficient and the position fits the current trade-size rule.",
      maxTradeValue,
      currentPrice,
    );
  }

  const maxAllocationFraction = settings.maxAllocationPerCoinPercent / 100;
  const allocationCapacity = maxAllocationFraction >= 1
    ? Number.POSITIVE_INFINITY
    : (maxAllocationFraction * totalValue - coinValue) / (1 - maxAllocationFraction);
  const drawdownWarningActive = totalPLPercent <= -settings.maxDrawdownWarningPercent;
  const drawdownAdjustedMax = drawdownWarningActive
    ? standardMaxTradeValue / 2
    : standardMaxTradeValue;
  const maxTradeValue = Math.min(drawdownAdjustedMax, allocationCapacity);

  if (!Number.isFinite(maxTradeValue) || maxTradeValue <= 0) {
    return createDecision(
      "BLOCKED",
      `No additional ${signal.symbol} paper allocation fits the current local risk limits.`,
    );
  }

  if (maxTradeValue < standardMaxTradeValue - 0.01) {
    const reasons: string[] = [];
    if (drawdownWarningActive) {
      reasons.push(
        `unrealized portfolio P/L is ${totalPLPercent.toFixed(2)}%, beyond the -${settings.maxDrawdownWarningPercent}% warning`,
      );
    }
    if (allocationCapacity < standardMaxTradeValue) {
      reasons.push(`${signal.symbol} is near the ${settings.maxAllocationPerCoinPercent}% allocation limit`);
    }

    return createDecision(
      "REDUCED",
      `Suggested paper trade size was reduced because ${reasons.join(" and ")}.`,
      maxTradeValue,
      currentPrice,
    );
  }

  return createDecision(
    "APPROVED",
    `Signal passes the ${settings.maxAllocationPerCoinPercent}% allocation and ${settings.maxTradeSizePercent}% trade-size rules.`,
    standardMaxTradeValue,
    currentPrice,
  );
}

export function normalizePaperRiskJournalEntry(value: unknown): PaperRiskJournalEntry | null {
  if (!isRecord(value)) return null;

  const expectedSymbol = typeof value.coinId === "string"
    ? SUPPORTED_SYMBOLS_BY_ID.get(value.coinId)
    : undefined;
  const maxTradeValue = value.suggestedMaxTradeValue;

  if (
    typeof value.id !== "string" ||
    value.id.trim() === "" ||
    !isValidDate(value.timestamp) ||
    typeof value.coinId !== "string" ||
    !SUPPORTED_COIN_IDS.has(value.coinId) ||
    !expectedSymbol ||
    value.symbol !== expectedSymbol ||
    typeof value.signal !== "string" ||
    !SIGNAL_LABELS.has(value.signal as PaperSignalLabel) ||
    typeof value.decision !== "string" ||
    !DECISIONS.has(value.decision as PaperRiskDecisionType) ||
    typeof value.reason !== "string" ||
    value.reason.trim() === "" ||
    (maxTradeValue !== undefined && (!isFiniteNumber(maxTradeValue) || maxTradeValue <= 0))
  ) {
    return null;
  }

  const entry: PaperRiskJournalEntry = {
    id: value.id,
    timestamp: value.timestamp,
    coinId: value.coinId,
    symbol: expectedSymbol,
    signal: value.signal as PaperSignalLabel,
    decision: value.decision as PaperRiskDecisionType,
    reason: value.reason,
  };

  if (isFiniteNumber(maxTradeValue)) entry.suggestedMaxTradeValue = maxTradeValue;
  return entry;
}

export function loadPaperRiskJournal(): PaperRiskJournalEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PAPER_RISK_JOURNAL_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizePaperRiskJournalEntry)
      .filter((entry): entry is PaperRiskJournalEntry => entry !== null)
      .slice(0, MAX_PAPER_RISK_JOURNAL);
  } catch {
    return [];
  }
}

export function savePaperRiskJournal(entries: PaperRiskJournalEntry[]): boolean {
  try {
    const normalized = entries
      .map(normalizePaperRiskJournalEntry)
      .filter((entry): entry is PaperRiskJournalEntry => entry !== null)
      .slice(0, MAX_PAPER_RISK_JOURNAL);
    localStorage.setItem(PAPER_RISK_JOURNAL_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

function createJournalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `risk-${crypto.randomUUID()}`;
  }
  return `risk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function appendPaperRiskDecision(
  signal: PaperSignal,
  decision: PaperRiskDecision,
): { ok: boolean; entries: PaperRiskJournalEntry[] } {
  const entry: PaperRiskJournalEntry = {
    id: createJournalId(),
    timestamp: new Date().toISOString(),
    coinId: signal.coinId,
    symbol: signal.symbol,
    signal: signal.label,
    decision: decision.decision,
    reason: decision.reason,
  };

  if (decision.suggestedMaxTradeValue !== undefined) {
    entry.suggestedMaxTradeValue = decision.suggestedMaxTradeValue;
  }

  const entries = [entry, ...loadPaperRiskJournal()].slice(0, MAX_PAPER_RISK_JOURNAL);
  return { ok: savePaperRiskJournal(entries), entries };
}

export function clearPaperRiskJournal(): boolean {
  try {
    localStorage.removeItem(PAPER_RISK_JOURNAL_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
