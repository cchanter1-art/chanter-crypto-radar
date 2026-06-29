import type { Coin, PortfolioPosition, PriceAlert } from "@/types";

export type PaperSignalLabel = "BUY" | "SELL" | "HOLD" | "AVOID";
export type PaperSignalConfidence = "Low" | "Medium" | "High";

export interface PaperSignal {
  id: string;
  coinId: string;
  symbol: string;
  label: PaperSignalLabel;
  confidence: PaperSignalConfidence;
  reason: string;
  riskNote: string;
  timestamp: string;
}

interface GeneratePaperSignalsInput {
  coins: Coin[];
  positions: PortfolioPosition[];
  alerts: PriceAlert[];
  priceStatus: "loading" | "live" | "fallback";
  totalValue: number;
  totalPLPercent: number;
  timestamp?: string;
}

export const PAPER_SIGNAL_STORAGE_KEY = "chanter-paper-signal-history";
export const MAX_PAPER_SIGNAL_HISTORY = 50;

const SUPPORTED_COIN_IDS = new Set(["btc", "eth", "sol", "ada", "avax"]);
const SUPPORTED_SYMBOLS_BY_ID = new Map([
  ["btc", "BTC"],
  ["eth", "ETH"],
  ["sol", "SOL"],
  ["ada", "ADA"],
  ["avax", "AVAX"],
]);
const SIGNAL_LABELS = new Set<PaperSignalLabel>(["BUY", "SELL", "HOLD", "AVOID"]);
const CONFIDENCE_LEVELS = new Set<PaperSignalConfidence>(["Low", "Medium", "High"]);
const ALERT_PROXIMITY_PERCENT = 2;
const OVERSIZED_ALLOCATION_PERCENT = 50;
const HIGH_LOSS_PERCENT = -25;
const PORTFOLIO_DRAWDOWN_PERCENT = -15;
const EXTREME_MOVE_PERCENT = 10;

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function getLatestMovement(coin: Coin): number {
  const previousPrice = coin.sparkline.at(-2);
  const currentPrice = coin.sparkline.at(-1);

  if (
    !Number.isFinite(previousPrice) ||
    !Number.isFinite(currentPrice) ||
    !previousPrice ||
    previousPrice <= 0
  ) {
    return 0;
  }

  return ((currentPrice - previousPrice) / previousPrice) * 100;
}

function getNearestAlert(
  alerts: PriceAlert[],
  coinId: string,
  currentPrice: number,
): { alert: PriceAlert; proximityPercent: number } | null {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;

  return alerts
    .filter((alert) => alert.coinId === coinId && alert.isActive && !alert.isTriggered)
    .map((alert) => ({
      alert,
      proximityPercent: Math.abs(alert.targetPrice - currentPrice) / currentPrice * 100,
    }))
    .sort((a, b) => a.proximityPercent - b.proximityPercent)[0] ?? null;
}

function getMomentumScore(change24h: number, latestMovement: number): number {
  let score = 0;

  if (change24h >= 4) score += 2;
  else if (change24h >= 1) score += 1;
  else if (change24h <= -4) score -= 2;
  else if (change24h <= -1) score -= 1;

  if (latestMovement >= 0.75) score += 1;
  else if (latestMovement <= -0.75) score -= 1;

  return score;
}

function getConfidence(label: PaperSignalLabel, score: number): PaperSignalConfidence {
  const strength = Math.abs(score);

  if (label === "AVOID") return strength >= 3 ? "High" : "Medium";
  if (label === "HOLD") return strength >= 2 ? "Medium" : "Low";
  return strength >= 3 ? "High" : "Medium";
}

function createUnavailableSignal(
  coin: Coin,
  priceStatus: GeneratePaperSignalsInput["priceStatus"],
  timestamp: string,
): PaperSignal {
  const isLoading = priceStatus === "loading";

  return {
    id: `signal-${timestamp}-${coin.id}`,
    coinId: coin.id,
    symbol: coin.symbol,
    label: "HOLD",
    confidence: "Low",
    reason: isLoading
      ? "Live price refresh is still pending. Directional scoring is paused."
      : "Live price data is unavailable. Mock fallback values are displayed, so directional scoring is disabled.",
    riskNote: "Unavailable live data forces a safe HOLD result. Do not treat mock values as a trade trigger.",
    timestamp,
  };
}

function createRiskNote(
  position: PortfolioPosition | undefined,
  exposurePercent: number,
  totalPLPercent: number,
  nearestAlert: ReturnType<typeof getNearestAlert>,
): string {
  const notes: string[] = [];

  if (position?.plPercent !== undefined && position.plPercent <= HIGH_LOSS_PERCENT) {
    notes.push(`Position P/L is ${formatSignedPercent(position.plPercent)}, below the -25% risk threshold.`);
  }

  if (exposurePercent > OVERSIZED_ALLOCATION_PERCENT) {
    notes.push(`Exposure is ${exposurePercent.toFixed(1)}%, above the 50% concentration threshold.`);
  } else if (position) {
    notes.push(`Current paper-portfolio exposure is ${exposurePercent.toFixed(1)}%.`);
  } else {
    notes.push("No active paper position is recorded for this coin.");
  }

  if (totalPLPercent <= PORTFOLIO_DRAWDOWN_PERCENT) {
    notes.push(`Total paper-portfolio drawdown is ${Math.abs(totalPLPercent).toFixed(2)}%.`);
  }

  if (nearestAlert && nearestAlert.proximityPercent <= ALERT_PROXIMITY_PERCENT) {
    notes.push(
      `Nearest ${nearestAlert.alert.condition} alert is ${nearestAlert.proximityPercent.toFixed(2)}% from the displayed price.`,
    );
  }

  return notes.join(" ");
}

export function generatePaperSignals({
  coins,
  positions,
  alerts,
  priceStatus,
  totalValue,
  totalPLPercent,
  timestamp = new Date().toISOString(),
}: GeneratePaperSignalsInput): PaperSignal[] {
  return coins
    .filter((coin) => SUPPORTED_COIN_IDS.has(coin.id))
    .map((coin) => {
      if (priceStatus !== "live" || !Number.isFinite(coin.price) || coin.price <= 0) {
        return createUnavailableSignal(coin, priceStatus, timestamp);
      }

      const position = positions.find((item) => item.coinId === coin.id);
      const exposurePercent = position && totalValue > 0
        ? (position.currentValue / totalValue) * 100
        : 0;
      const latestMovement = getLatestMovement(coin);
      const nearestAlert = getNearestAlert(alerts, coin.id, coin.price);
      let score = getMomentumScore(coin.change24h, latestMovement);

      if (nearestAlert && nearestAlert.proximityPercent <= ALERT_PROXIMITY_PERCENT) {
        score += nearestAlert.alert.condition === "above" ? 1 : -1;
      }

      const hasHoldings = Boolean(position && position.holdings > 0);
      const hasExtremeMove = Math.abs(coin.change24h) >= EXTREME_MOVE_PERCENT;
      const hasConcentrationWarning = exposurePercent > OVERSIZED_ALLOCATION_PERCENT;
      const hasHighLossWarning = Boolean(position && position.plPercent <= HIGH_LOSS_PERCENT);
      let label: PaperSignalLabel;

      if (hasExtremeMove) {
        label = "AVOID";
      } else if (score <= -2) {
        label = hasHoldings ? "SELL" : "AVOID";
      } else if (score >= 2 && !hasConcentrationWarning && !hasHighLossWarning) {
        label = "BUY";
      } else {
        label = "HOLD";
      }

      const alertReason = nearestAlert && nearestAlert.proximityPercent <= ALERT_PROXIMITY_PERCENT
        ? ` A local ${nearestAlert.alert.condition} alert is within ${nearestAlert.proximityPercent.toFixed(2)}%.`
        : "";
      const guardReason = hasExtremeMove
        ? " The 24-hour move exceeds the 10% volatility guard, so directional action is suppressed."
        : hasConcentrationWarning && score > 0
          ? " Existing exposure exceeds the concentration guard, so additional paper exposure is suppressed."
          : hasHighLossWarning && score > 0
            ? " The active position is below the loss threshold, so a new paper buy is suppressed."
            : "";

      return {
        id: `signal-${timestamp}-${coin.id}`,
        coinId: coin.id,
        symbol: coin.symbol,
        label,
        confidence: getConfidence(label, score),
        reason: `${coin.symbol} is ${formatSignedPercent(coin.change24h)} over 24h and ${formatSignedPercent(latestMovement)} in the latest local price sample.${alertReason}${guardReason}`,
        riskNote: createRiskNote(position, exposurePercent, totalPLPercent, nearestAlert),
        timestamp,
      };
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidPaperSignal(value: unknown): value is PaperSignal {
  return isRecord(value) &&
    typeof value.id === "string" &&
    value.id.trim() !== "" &&
    typeof value.coinId === "string" &&
    SUPPORTED_COIN_IDS.has(value.coinId) &&
    typeof value.symbol === "string" &&
    value.symbol === SUPPORTED_SYMBOLS_BY_ID.get(value.coinId) &&
    typeof value.label === "string" &&
    SIGNAL_LABELS.has(value.label as PaperSignalLabel) &&
    typeof value.confidence === "string" &&
    CONFIDENCE_LEVELS.has(value.confidence as PaperSignalConfidence) &&
    typeof value.reason === "string" &&
    value.reason.trim() !== "" &&
    typeof value.riskNote === "string" &&
    value.riskNote.trim() !== "" &&
    typeof value.timestamp === "string" &&
    !Number.isNaN(Date.parse(value.timestamp));
}

export function loadPaperSignalHistory(): PaperSignal[] {
  try {
    const stored = JSON.parse(localStorage.getItem(PAPER_SIGNAL_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter(isValidPaperSignal).slice(0, MAX_PAPER_SIGNAL_HISTORY);
  } catch {
    return [];
  }
}

export function savePaperSignalHistory(signals: PaperSignal[]): boolean {
  try {
    localStorage.setItem(
      PAPER_SIGNAL_STORAGE_KEY,
      JSON.stringify(signals.slice(0, MAX_PAPER_SIGNAL_HISTORY)),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearPaperSignalHistory(): boolean {
  try {
    localStorage.removeItem(PAPER_SIGNAL_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
