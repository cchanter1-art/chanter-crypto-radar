/**
 * Auto Intelligence Cycle v1
 *
 * Browser-local 15-minute intelligence cycle.
 * Fetches live read-only 15m candles, runs integrity checks,
 * and saves reports. Never opens positions. Never places orders.
 *
 * Safety guarantees:
 * - No wallet connection
 * - No real orders
 * - No paper positions opened automatically
 * - Manual approval still required for any position
 * - Paper-only automation
 */

import {
  fetchLive15mCandles,
  runIntegrityCheckForLive,
} from "@/lib/liveCandleProvider";
import {
  loadMarketDataIntegrityHistory,
  saveMarketDataIntegrityHistory,
} from "@/lib/marketDataIntegrity";

export type AutoCycleStatus = "passed" | "failed" | "running";

export interface AutoIntelligenceCycleRunRecord {
  runAt: string;
  status: "passed" | "failed";
  symbol: string;
  score: number | null;
  readiness: string | null;
  source: string | null;
  error: string | null;
}

export interface AutoIntelligenceCycleState {
  enabled: boolean;
  intervalMs: number;
  lastRunAt: string | null;
  lastStatus: AutoCycleStatus | null;
  lastSymbol: string | null;
  lastScore: number | null;
  lastReadiness: string | null;
  lastSource: string | null;
  lastError: string | null;
  history: AutoIntelligenceCycleRunRecord[];
}

export const AUTO_INTELLIGENCE_CYCLE_STORAGE_KEY = "chanter-auto-intelligence-cycle";
export const DEFAULT_CYCLE_INTERVAL_MS = 15 * 60 * 1000;
export const MAX_CYCLE_HISTORY = 50;

const TRACKED_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "ADAUSDT", "AVAXUSDT"] as const;

let intervalId: ReturnType<typeof setInterval> | null = null;
let tickLock = false;

function getDefaultState(): AutoIntelligenceCycleState {
  return {
    enabled: false,
    intervalMs: DEFAULT_CYCLE_INTERVAL_MS,
    lastRunAt: null,
    lastStatus: null,
    lastSymbol: null,
    lastScore: null,
    lastReadiness: null,
    lastSource: null,
    lastError: null,
    history: [],
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isAutoCycleStatus(value: unknown): value is AutoCycleStatus {
  return value === "passed" || value === "failed" || value === "running";
}

function normalizeRunRecord(value: unknown): AutoIntelligenceCycleRunRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  if (!isValidDateString(r.runAt)) return null;
  if (r.status !== "passed" && r.status !== "failed") return null;
  if (typeof r.symbol !== "string") return null;
  const score = r.score;
  if (score !== null) {
    if (typeof score !== "number" || !Number.isFinite(score)) return null;
    if (score < 0 || score > 100) return null;
  }
  if (r.readiness !== null && typeof r.readiness !== "string") return null;
  if (r.source !== null && typeof r.source !== "string") return null;
  if (r.error !== null && typeof r.error !== "string") return null;
  return {
    runAt: r.runAt as string,
    status: r.status as "passed" | "failed",
    symbol: r.symbol as string,
    score: score as number | null,
    readiness: r.readiness as string | null,
    source: r.source as string | null,
    error: r.error as string | null,
  };
}

export function normalizeAutoIntelligenceCycleState(
  value: unknown,
): AutoIntelligenceCycleState | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.enabled !== "boolean") return null;
  const intervalMs = v.intervalMs;
  if (typeof intervalMs !== "number" || !Number.isFinite(intervalMs) || intervalMs <= 0) return null;
  if (v.lastRunAt !== null && !isValidDateString(v.lastRunAt)) return null;
  if (v.lastStatus !== null && !isAutoCycleStatus(v.lastStatus)) return null;
  if (v.lastSymbol !== null && typeof v.lastSymbol !== "string") return null;
  const lastScore = v.lastScore;
  if (lastScore !== null && (!isFiniteNumber(lastScore) || lastScore < 0 || lastScore > 100)) return null;
  if (v.lastReadiness !== null && typeof v.lastReadiness !== "string") return null;
  if (v.lastSource !== null && typeof v.lastSource !== "string") return null;
  if (v.lastError !== null && typeof v.lastError !== "string") return null;
  if (!Array.isArray(v.history)) return null;
  const history = v.history.map(normalizeRunRecord).filter(
    (r): r is AutoIntelligenceCycleRunRecord => r !== null,
  );
  return {
    enabled: v.enabled,
    intervalMs: intervalMs,
    lastRunAt: v.lastRunAt as string | null,
    lastStatus: v.lastStatus as AutoCycleStatus | null,
    lastSymbol: v.lastSymbol as string | null,
    lastScore: lastScore as number | null,
    lastReadiness: v.lastReadiness as string | null,
    lastSource: v.lastSource as string | null,
    lastError: v.lastError as string | null,
    history: history.slice(0, MAX_CYCLE_HISTORY),
  };
}

export function getAutoIntelligenceCycleState(): AutoIntelligenceCycleState {
  try {
    const raw = localStorage.getItem(AUTO_INTELLIGENCE_CYCLE_STORAGE_KEY);
    if (!raw) return getDefaultState();
    const parsed = JSON.parse(raw);
    return normalizeAutoIntelligenceCycleState(parsed) ?? getDefaultState();
  } catch {
    return getDefaultState();
  }
}

function saveState(state: AutoIntelligenceCycleState): boolean {
  try {
    localStorage.setItem(AUTO_INTELLIGENCE_CYCLE_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function isAutoIntelligenceCycleActive(): boolean {
  return intervalId !== null;
}

export function startAutoIntelligenceCycle(): boolean {
  if (intervalId !== null) return false;
  if (typeof setInterval === "undefined") return false;

  const state = getAutoIntelligenceCycleState();
  saveState({ ...state, enabled: true });

  intervalId = setInterval(() => {
    runAutoIntelligenceTick();
  }, DEFAULT_CYCLE_INTERVAL_MS);

  return true;
}

export function stopAutoIntelligenceCycle(): boolean {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }

  const state = getAutoIntelligenceCycleState();
  saveState({ ...state, enabled: false });

  return true;
}

export async function runAutoIntelligenceTick(): Promise<{ ok: boolean; error?: string }> {
  if (tickLock) {
    return { ok: false, error: "Tick already in progress" };
  }

  tickLock = true;

  const stateBefore = getAutoIntelligenceCycleState();
  saveState({ ...stateBefore, lastStatus: "running" });

  try {
    let lastSymbol: string | null = null;
    let lastScore: number | null = null;
    let lastReadiness: string | null = null;
    let lastSource: string | null = null;
    let lastError: string | null = null;
    let anySuccess = false;

    for (const symbol of TRACKED_SYMBOLS) {
      const result = await fetchLive15mCandles({ symbol, limit: 100 });
      if (!result.ok) {
        if (!lastError) {
          lastError = `${symbol}: ${result.error}`;
        } else {
          lastError = `${lastError}; ${symbol}: ${result.error}`;
        }
        continue;
      }

      const report = runIntegrityCheckForLive(symbol, result.candles, result.fetchedAt);
      const history = loadMarketDataIntegrityHistory();
      const updated = [report, ...history.filter((r) => r.id !== report.id)];
      saveMarketDataIntegrityHistory(updated);

      lastSymbol = symbol;
      lastScore = report.integrityScore;
      lastReadiness = report.readinessStatus;
      lastSource = report.source;
      anySuccess = true;
    }

    const now = new Date().toISOString();
    const status: "passed" | "failed" = anySuccess ? "passed" : "failed";

    const runRecord: AutoIntelligenceCycleRunRecord = {
      runAt: now,
      status,
      symbol: lastSymbol ?? TRACKED_SYMBOLS[0],
      score: lastScore,
      readiness: lastReadiness,
      source: lastSource,
      error: anySuccess ? lastError : lastError,
    };

    const currentState = getAutoIntelligenceCycleState();
    const newHistory = [runRecord, ...currentState.history].slice(0, MAX_CYCLE_HISTORY);

    saveState({
      ...currentState,
      lastRunAt: now,
      lastStatus: status,
      lastSymbol,
      lastScore,
      lastReadiness,
      lastSource,
      lastError,
      history: newHistory,
    });

    return { ok: anySuccess, error: anySuccess ? undefined : lastError ?? "All fetches failed" };
  } catch (err) {
    const now = new Date().toISOString();
    const message = err instanceof Error ? err.message : "Unknown error";
    const currentState = getAutoIntelligenceCycleState();

    const runRecord: AutoIntelligenceCycleRunRecord = {
      runAt: now,
      status: "failed",
      symbol: currentState.lastSymbol ?? TRACKED_SYMBOLS[0],
      score: null,
      readiness: null,
      source: null,
      error: message,
    };

    const newHistory = [runRecord, ...currentState.history].slice(0, MAX_CYCLE_HISTORY);

    saveState({
      ...currentState,
      lastRunAt: now,
      lastStatus: "failed",
      lastError: message,
      history: newHistory,
    });

    return { ok: false, error: message };
  } finally {
    tickLock = false;
  }
}

export function clearAutoIntelligenceCycleHistory(): boolean {
  const state = getAutoIntelligenceCycleState();
  saveState({
    ...state,
    lastRunAt: null,
    lastStatus: null,
    lastSymbol: null,
    lastScore: null,
    lastReadiness: null,
    lastSource: null,
    lastError: null,
    history: [],
  });
  return true;
}