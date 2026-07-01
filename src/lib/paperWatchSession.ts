/**
 * Paper Watch Session v1
 *
 * Read-only paper setup monitoring layer. Users can save the current
 * Paper Action Plan as a watch session, then see whether the setup
 * remains watching, confirmed, invalidated, expired, or resolved.
 *
 * This is NOT trading. NOT paper trading execution.
 * Paper-only setup monitoring.
 *
 * Safety guarantees:
 * - No wallet connection
 * - No real orders
 * - No paper positions opened
 * - No buy/sell/execute buttons
 * - Does not modify risk gates or signal scoring
 */

import type { PaperActionPlan } from "@/lib/paperActionPlan";

// === Types ===

export type PaperWatchStatus = "WATCHING" | "CONFIRMED" | "INVALIDATED" | "EXPIRED" | "RESOLVED";

export interface PaperWatchSession {
  id: string;
  symbol: string;
  source: "PAPER_WATCH_SESSION";
  createdAt: string;
  updatedAt: string;
  status: PaperWatchStatus;
  action: string;
  setupType: string;
  referencePrice: number | null;
  currentPrice: number | null;
  confirmationNeeded: string;
  invalidationReason: string;
  confidenceLabel: string;
  reasonSummary: string;
  proofSummary: string;
  missingDataSummary: string;
  lastCheckedAt: string | null;
  resolvedAt: string | null;
  outcomeNote: string | null;
  direction: string;
  finalScore: number;
}

// === Constants ===

export const PAPER_WATCH_STORAGE_KEY = "chanter-paper-watch-sessions";
export const MAX_PAPER_WATCH_SESSIONS = 100;
const EXPIRY_MS = 4 * 60 * 60 * 1000; // 4 hours
const CONFIRMATION_THRESHOLD_PCT = 0.5; // 0.5% move to confirm

// === Helpers ===

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isPaperWatchStatus(value: unknown): value is PaperWatchStatus {
  return (
    value === "WATCHING" ||
    value === "CONFIRMED" ||
    value === "INVALIDATED" ||
    value === "EXPIRED" ||
    value === "RESOLVED"
  );
}

function safeString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function safeNumberOrNull(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null;
}

function safeStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

// === Core functions ===

export function createPaperWatchSessionFromPlan(
  plan: PaperActionPlan,
  now?: string,
): PaperWatchSession {
  const ts = now ?? new Date().toISOString();
  let status: PaperWatchStatus = "WATCHING";

  if (plan.action === "IGNORE") status = "EXPIRED";
  else if (plan.referencePrice === null) status = "WATCHING";
  else if (plan.invalidationReason.includes("Blocked") || plan.invalidationReason.includes("BLOCKED")) status = "INVALIDATED";

  const outcomeNote =
    plan.referencePrice === null ? "Reference price unavailable" :
    plan.action === "IGNORE" ? "Plan action is IGNORE -- session expired" :
    status === "INVALIDATED" ? "Setup invalidated by risk/data blocker" :
    null;

  return {
    id: `watch-${plan.symbol}-${ts.replace(/[:.]/g, "-")}`,
    symbol: plan.symbol,
    source: "PAPER_WATCH_SESSION",
    createdAt: ts,
    updatedAt: ts,
    status,
    action: plan.action,
    setupType: plan.setupType,
    referencePrice: plan.referencePrice,
    currentPrice: plan.referencePrice,
    confirmationNeeded: plan.confirmationNeeded,
    invalidationReason: plan.invalidationReason,
    confidenceLabel: plan.confidenceLabel,
    reasonSummary: `${plan.symbol}: ${plan.action} -- ${plan.setupType}`,
    proofSummary: plan.outcomeTracked > 0
      ? `${plan.outcomeTracked} tracked outcomes` + (plan.outcomeWinRate !== null ? `, ${plan.outcomeWinRate.toFixed(0)}% favorable` : "")
      : "No outcome proof yet",
    missingDataSummary: plan.confirmationNeeded,
    lastCheckedAt: ts,
    resolvedAt: status === "EXPIRED" || status === "INVALIDATED" ? ts : null,
    outcomeNote,
    direction: plan.direction,
    finalScore: plan.finalScore,
  };
}

export function updatePaperWatchSessionFromCandle(
  session: PaperWatchSession,
  candle: { price: number; time: string } | null,
  now?: number,
): PaperWatchSession {
  const currentTime = now ?? Date.now();
  const updatedTs = new Date(currentTime).toISOString();

  if (session.status === "CONFIRMED" || session.status === "RESOLVED" || session.status === "EXPIRED" || session.status === "INVALIDATED") {
    // Terminal states -- only update lastChecked
    return {
      ...session,
      lastCheckedAt: updatedTs,
      updatedAt: updatedTs,
    };
  }

  if (!candle || candle.price <= 0) {
    // No new data -- check for expiry
    const createdMs = Date.parse(session.createdAt);
    if (!Number.isNaN(createdMs) && currentTime - createdMs > EXPIRY_MS) {
      return {
        ...session,
        status: "EXPIRED",
        resolvedAt: updatedTs,
        outcomeNote: "Session expired -- no candle updates received within horizon",
        lastCheckedAt: updatedTs,
        updatedAt: updatedTs,
      };
    }
    return {
      ...session,
      lastCheckedAt: updatedTs,
      updatedAt: updatedTs,
    };
  }

  const currentPrice = candle.price;
  const referencePrice = session.referencePrice;

  // Check for expiry
  const createdMs = Date.parse(session.createdAt);
  if (!Number.isNaN(createdMs) && currentTime - createdMs > EXPIRY_MS) {
    return {
      ...session,
      status: "EXPIRED",
      currentPrice,
      resolvedAt: updatedTs,
      outcomeNote: "Session expired after 4 hours",
      lastCheckedAt: updatedTs,
      updatedAt: updatedTs,
    };
  }

  // Check for invalidation
  if (session.invalidationReason.includes("Blocked") || session.invalidationReason.includes("BLOCKED")) {
    return {
      ...session,
      status: "INVALIDATED",
      currentPrice,
      resolvedAt: updatedTs,
      outcomeNote: "Invalidated: " + session.invalidationReason,
      lastCheckedAt: updatedTs,
      updatedAt: updatedTs,
    };
  }

  // Check for confirmation
  if (referencePrice !== null && referencePrice > 0 && session.action !== "WAIT" && session.action !== "IGNORE") {
    const changePct = Math.abs(((currentPrice - referencePrice) / referencePrice) * 100);

    if (changePct >= CONFIRMATION_THRESHOLD_PCT) {
      const direction = session.direction;
      const favorable =
        (direction === "LONG" && currentPrice > referencePrice) ||
        (direction === "SHORT" && currentPrice < referencePrice);

      return {
        ...session,
        status: favorable ? "CONFIRMED" : "INVALIDATED",
        currentPrice,
        resolvedAt: updatedTs,
        outcomeNote: favorable
          ? `Confirmed: ${direction} setup moved favorably by ${changePct.toFixed(2)}%`
          : `Invalidated: ${direction} setup moved adversely by ${changePct.toFixed(2)}%`,
        lastCheckedAt: updatedTs,
        updatedAt: updatedTs,
      };
    }
  }

  // Still watching
  return {
    ...session,
    currentPrice,
    lastCheckedAt: updatedTs,
    updatedAt: updatedTs,
  };
}

export function normalizePaperWatchSession(record: unknown): PaperWatchSession | null {
  if (!isRecord(record)) return null;

  const id = safeString(record.id, "");
  const symbol = safeString(record.symbol, "");
  if (!id || !symbol) return null;

  const createdAt = isValidDateString(record.createdAt) ? record.createdAt : new Date().toISOString();
  const updatedAt = isValidDateString(record.updatedAt) ? record.updatedAt : createdAt;
  const status = isPaperWatchStatus(record.status) ? record.status : "WATCHING";

  return {
    id,
    symbol,
    source: "PAPER_WATCH_SESSION",
    createdAt,
    updatedAt,
    status,
    action: safeString(record.action, "WATCH"),
    setupType: safeString(record.setupType, "Unknown"),
    referencePrice: safeNumberOrNull(record.referencePrice),
    currentPrice: safeNumberOrNull(record.currentPrice),
    confirmationNeeded: safeString(record.confirmationNeeded, ""),
    invalidationReason: safeString(record.invalidationReason, ""),
    confidenceLabel: safeString(record.confidenceLabel, "LOW"),
    reasonSummary: safeString(record.reasonSummary, ""),
    proofSummary: safeString(record.proofSummary, ""),
    missingDataSummary: safeString(record.missingDataSummary, ""),
    lastCheckedAt: isValidDateString(record.lastCheckedAt) ? record.lastCheckedAt : null,
    resolvedAt: isValidDateString(record.resolvedAt) ? record.resolvedAt : null,
    outcomeNote: safeStringOrNull(record.outcomeNote),
    direction: safeString(record.direction, "WAIT"),
    finalScore: typeof record.finalScore === "number" && Number.isFinite(record.finalScore) ? record.finalScore : 0,
  };
}

// === Persistence ===

export function loadPaperWatchSessions(): PaperWatchSession[] {
  try {
    const raw = localStorage.getItem(PAPER_WATCH_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizePaperWatchSession)
      .filter((r): r is PaperWatchSession => r !== null)
      .slice(0, MAX_PAPER_WATCH_SESSIONS);
  } catch {
    return [];
  }
}

export function savePaperWatchSessions(records: PaperWatchSession[]): void {
  try {
    localStorage.setItem(PAPER_WATCH_STORAGE_KEY, JSON.stringify(records.slice(0, MAX_PAPER_WATCH_SESSIONS)));
  } catch {
    // ignore
  }
}

export function addOrUpdatePaperWatchSession(record: PaperWatchSession): PaperWatchSession[] {
  const existing = loadPaperWatchSessions();
  const idx = existing.findIndex((r) => r.id === record.id);
  if (idx >= 0) {
    existing[idx] = record;
    savePaperWatchSessions(existing);
    return existing;
  }
  const updated = [record, ...existing].slice(0, MAX_PAPER_WATCH_SESSIONS);
  savePaperWatchSessions(updated);
  return updated;
}

export function getActivePaperWatchSessions(): PaperWatchSession[] {
  return loadPaperWatchSessions().filter((r) => r.status === "WATCHING" || r.status === "CONFIRMED");
}

export function getLatestPaperWatchSessionBySymbol(symbol: string): PaperWatchSession | null {
  const sessions = loadPaperWatchSessions().filter((r) => r.symbol === symbol);
  if (sessions.length === 0) return null;
  return sessions.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
}
