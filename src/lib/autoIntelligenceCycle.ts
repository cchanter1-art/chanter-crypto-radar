/**
 * Auto Intelligence Cycle v1.1
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
import {
  buildCandidateFromSnapshot,
  addOrUpdateCandidate,
} from "@/lib/candidateReviewQueue";
import {
  loadLatestSignalQualityScore,
} from "@/lib/signalQualityScore";

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

export interface AutoObservationRecord {
  id: string;
  timestamp: string;
  symbol: string;
  source: "AUTO_CYCLE";
  fetchedAt: string;
  integrityScore: number;
  sourceLabel: string;
  freshnessStatus: string;
  readinessStatus: string;
  direction: string;
  confidence: string;
  reason: string;
  status: "OBSERVATION_ONLY";
}

export interface AutoIntelligenceCycleState {
  enabled: boolean;
  intervalMs: number;
  lastRunAt: string | null;
  lastStatus: AutoCycleStatus | null;
  lastTickStartedAt: string | null;
  lastTickCompletedAt: string | null;
  nextRunAt: string | null;
  lastSymbol: string | null;
  lastScore: number | null;
  lastReadiness: string | null;
  lastSource: string | null;
  lastError: string | null;
  symbolsScanned: number;
  symbolsSucceeded: number;
  symbolsFailed: number;
  observationsCreated: number;
  observationsSkipped: number;
  history: AutoIntelligenceCycleRunRecord[];
  autoObservations: AutoObservationRecord[];
}

export const AUTO_INTELLIGENCE_CYCLE_STORAGE_KEY = "chanter-auto-intelligence-cycle";
export const DEFAULT_CYCLE_INTERVAL_MS = 15 * 60 * 1000;
export const MAX_CYCLE_HISTORY = 50;
export const STALE_THRESHOLD_MS = 20 * 60 * 1000;
export const MAX_AUTO_OBSERVATIONS = 500;

const TRACKED_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "ADAUSDT", "AVAXUSDT"] as const;

let intervalId: ReturnType<typeof setInterval> | null = null;
let tickLock = false;

function getDefaultState(): AutoIntelligenceCycleState {
  return {
    enabled: false,
    intervalMs: DEFAULT_CYCLE_INTERVAL_MS,
    lastRunAt: null,
    lastStatus: null,
    lastTickStartedAt: null,
    lastTickCompletedAt: null,
    nextRunAt: null,
    lastSymbol: null,
    lastScore: null,
    lastReadiness: null,
    lastSource: null,
    lastError: null,
    symbolsScanned: 0,
    symbolsSucceeded: 0,
    symbolsFailed: 0,
    observationsCreated: 0,
    observationsSkipped: 0,
    history: [],
    autoObservations: [],
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

function isAutoObservationRecord(value: unknown): value is AutoObservationRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  if (typeof r.id !== "string" || r.id.trim() === "") return false;
  if (!isValidDateString(r.timestamp)) return false;
  if (typeof r.symbol !== "string") return false;
  if (typeof r.integrityScore !== "number" || !Number.isFinite(r.integrityScore)) return false;
  if (typeof r.sourceLabel !== "string") return false;
  if (typeof r.freshnessStatus !== "string") return false;
  if (typeof r.readinessStatus !== "string") return false;
  if (typeof r.direction !== "string") return false;
  if (typeof r.confidence !== "string") return false;
  if (typeof r.reason !== "string") return false;
  if (r.status !== "OBSERVATION_ONLY") return false;
  if (r.source !== "AUTO_CYCLE") return false;
  if (!isValidDateString(r.fetchedAt)) return false;
  return true;
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
  if (v.lastTickStartedAt !== null && !isValidDateString(v.lastTickStartedAt)) return null;
  if (v.lastTickCompletedAt !== null && !isValidDateString(v.lastTickCompletedAt)) return null;
  if (v.nextRunAt !== null && !isValidDateString(v.nextRunAt)) return null;
  if (v.lastSymbol !== null && typeof v.lastSymbol !== "string") return null;
  const lastScore = v.lastScore;
  if (lastScore !== null && (!isFiniteNumber(lastScore) || lastScore < 0 || lastScore > 100)) return null;
  if (v.lastReadiness !== null && typeof v.lastReadiness !== "string") return null;
  if (v.lastSource !== null && typeof v.lastSource !== "string") return null;
  if (v.lastError !== null && typeof v.lastError !== "string") return null;
  const symbolsScanned = v.symbolsScanned;
  if (typeof symbolsScanned !== "number" || !Number.isFinite(symbolsScanned) || symbolsScanned < 0) return null;
  const symbolsSucceeded = v.symbolsSucceeded;
  if (typeof symbolsSucceeded !== "number" || !Number.isFinite(symbolsSucceeded) || symbolsSucceeded < 0) return null;
  const symbolsFailed = v.symbolsFailed;
  if (typeof symbolsFailed !== "number" || !Number.isFinite(symbolsFailed) || symbolsFailed < 0) return null;
  const observationsCreated = v.observationsCreated;
  if (typeof observationsCreated !== "number" || !Number.isFinite(observationsCreated) || observationsCreated < 0) return null;
  const observationsSkipped = v.observationsSkipped;
  if (typeof observationsSkipped !== "number" || !Number.isFinite(observationsSkipped) || observationsSkipped < 0) return null;
  if (!Array.isArray(v.history)) return null;
  const history = v.history.map(normalizeRunRecord).filter(
    (r): r is AutoIntelligenceCycleRunRecord => r !== null,
  );
  // Normalize autoObservations
  let autoObservations: AutoObservationRecord[] = [];
  if (Array.isArray(v.autoObservations)) {
    autoObservations = v.autoObservations.filter(isAutoObservationRecord).slice(0, MAX_AUTO_OBSERVATIONS);
  }

  return {
    enabled: v.enabled,
    intervalMs: intervalMs,
    lastRunAt: v.lastRunAt as string | null,
    lastStatus: v.lastStatus as AutoCycleStatus | null,
    lastTickStartedAt: v.lastTickStartedAt as string | null,
    lastTickCompletedAt: v.lastTickCompletedAt as string | null,
    nextRunAt: v.nextRunAt as string | null,
    lastSymbol: v.lastSymbol as string | null,
    lastScore: lastScore as number | null,
    lastReadiness: v.lastReadiness as string | null,
    lastSource: v.lastSource as string | null,
    lastError: v.lastError as string | null,
    symbolsScanned: symbolsScanned,
    symbolsSucceeded: symbolsSucceeded,
    symbolsFailed: symbolsFailed,
    observationsCreated: observationsCreated,
    observationsSkipped: observationsSkipped,
    history: history.slice(0, MAX_CYCLE_HISTORY),
    autoObservations: autoObservations,
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

export function isTickRunning(): boolean {
  return tickLock;
}

export function isCycleStale(state: AutoIntelligenceCycleState): boolean {
  if (state.lastStatus !== "passed" || !state.lastTickCompletedAt) return false;
  const completedMs = Date.parse(state.lastTickCompletedAt);
  if (Number.isNaN(completedMs)) return false;
  return Date.now() - completedMs > STALE_THRESHOLD_MS;
}

export function getStaleWarning(state: AutoIntelligenceCycleState): string | null {
  if (!state.lastTickCompletedAt && !state.lastRunAt) return null;
  if (state.lastStatus === "passed" && !isCycleStale(state)) return null;
  if (state.lastStatus === "passed" && isCycleStale(state)) {
    const ageMin = Math.round((Date.now() - Date.parse(state.lastTickCompletedAt!)) / 60000);
    return `Last successful cycle was ${ageMin} min ago (stale threshold: 20 min). Live data may be outdated.`;
  }
  if (state.lastStatus === "failed") {
    return `Last cycle failed. Previous valid report retained but may be stale.`;
  }
  return null;
}

export function startAutoIntelligenceCycle(): boolean {
  if (intervalId !== null) return false;
  if (typeof setInterval === "undefined") return false;

  const state = getAutoIntelligenceCycleState();
  const now = new Date();
  const nextRunAt = new Date(now.getTime() + DEFAULT_CYCLE_INTERVAL_MS).toISOString();
  saveState({ ...state, enabled: true, nextRunAt });

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
  saveState({ ...state, enabled: false, nextRunAt: null });

  return true;
}

export async function runAutoIntelligenceTick(): Promise<{ ok: boolean; error?: string }> {
  if (tickLock) {
    return { ok: false, error: "Tick already in progress" };
  }

  tickLock = true;

  const startedAt = new Date().toISOString();
  const stateBefore = getAutoIntelligenceCycleState();
  saveState({ ...stateBefore, lastStatus: "running", lastTickStartedAt: startedAt });

  try {
    let lastSymbol: string | null = null;
    let lastScore: number | null = null;
    let lastReadiness: string | null = null;
    let lastSource: string | null = null;
    let lastError: string | null = null;
    let anySuccess = false;
    let successCount = 0;
    let failCount = 0;
    let observationsCreated = 0;
    let observationsSkipped = 0;
    let currentAutoObservations = [...getAutoIntelligenceCycleState().autoObservations];

    for (const symbol of TRACKED_SYMBOLS) {
      const result = await fetchLive15mCandles({ symbol, limit: 100 });
      if (!result.ok) {
        failCount += 1;
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
      successCount += 1;

      // Create auto observation record
      const obsId = `auto-${symbol}-${result.fetchedAt}`;
      const existingObs = currentAutoObservations.find(
        (o) => o.id === obsId || (o.symbol === symbol && o.timestamp === result.fetchedAt),
      );
      if (existingObs) {
        observationsSkipped += 1;
      } else {
        const direction = report.candleCount >= 26 ? "WAIT" : "WAIT";
        const confidence = report.integrityScore >= 85 ? "High" : report.integrityScore >= 50 ? "Medium" : "Low";
        const reason = `Auto observation: ${symbol} integrity score ${report.integrityScore}/100, readiness ${report.readinessStatus.replace(/_/g, " ")}`;
        const newObs: AutoObservationRecord = {
          id: obsId,
          timestamp: result.fetchedAt,
          symbol,
          source: "AUTO_CYCLE",
          fetchedAt: result.fetchedAt,
          integrityScore: report.integrityScore,
          sourceLabel: report.source,
          freshnessStatus: report.freshnessStatus,
          readinessStatus: report.readinessStatus,
          direction,
          confidence,
          reason,
          status: "OBSERVATION_ONLY",
        };
        currentAutoObservations = [newObs, ...currentAutoObservations].slice(0, MAX_AUTO_OBSERVATIONS);
        observationsCreated += 1;
      }
    }

    const completedAt = new Date().toISOString();
    const status: "passed" | "failed" = anySuccess ? "passed" : "failed";

    const runRecord: AutoIntelligenceCycleRunRecord = {
      runAt: completedAt,
      status,
      symbol: lastSymbol ?? TRACKED_SYMBOLS[0],
      score: lastScore,
      readiness: lastReadiness,
      source: lastSource,
      error: anySuccess ? lastError : lastError,
    };

    const currentState = getAutoIntelligenceCycleState();
    const newHistory = [runRecord, ...currentState.history].slice(0, MAX_CYCLE_HISTORY);

    // Calculate next run if cycle is still active
    const nextRunAt = intervalId !== null
      ? new Date(Date.now() + DEFAULT_CYCLE_INTERVAL_MS).toISOString()
      : null;

    saveState({
      ...currentState,
      lastRunAt: completedAt,
      lastStatus: status,
      lastTickStartedAt: startedAt,
      lastTickCompletedAt: completedAt,
      nextRunAt,
      lastSymbol,
      lastScore,
      lastReadiness,
      lastSource,
      lastError,
      symbolsScanned: TRACKED_SYMBOLS.length,
      symbolsSucceeded: successCount,
      symbolsFailed: failCount,
      observationsCreated,
      observationsSkipped,
      history: newHistory,
      autoObservations: currentAutoObservations,
    });

    // Build candidate review records from latest evidence snapshot
    if (anySuccess) {
      try {
        const latestSQ = loadLatestSignalQualityScore();
        if (latestSQ) {
          const integrityHistory = loadMarketDataIntegrityHistory();
          const latestIntegrity = integrityHistory[0] ?? null;
          const candidate = buildCandidateFromSnapshot({
            signalRecord: latestSQ,
            integrityReport: latestIntegrity,
            symbol: lastSymbol ?? "BTCUSDT",
            source: "AUTO_CYCLE",
          });
          if (candidate) {
            addOrUpdateCandidate(candidate);
          }
        }
      } catch {
        // Candidate creation is best-effort; never block the tick
      }
    }

    return { ok: anySuccess, error: anySuccess ? undefined : lastError ?? "All fetches failed" };
  } catch (err) {
    const completedAt = new Date().toISOString();
    const message = err instanceof Error ? err.message : "Unknown error";
    const currentState = getAutoIntelligenceCycleState();

    const runRecord: AutoIntelligenceCycleRunRecord = {
      runAt: completedAt,
      status: "failed",
      symbol: currentState.lastSymbol ?? TRACKED_SYMBOLS[0],
      score: null,
      readiness: null,
      source: null,
      error: message,
    };

    const newHistory = [runRecord, ...currentState.history].slice(0, MAX_CYCLE_HISTORY);

    const nextRunAt = intervalId !== null
      ? new Date(Date.now() + DEFAULT_CYCLE_INTERVAL_MS).toISOString()
      : null;

    saveState({
      ...currentState,
      lastRunAt: completedAt,
      lastStatus: "failed",
      lastTickStartedAt: startedAt,
      lastTickCompletedAt: completedAt,
      nextRunAt,
      lastError: message,
      symbolsScanned: TRACKED_SYMBOLS.length,
      symbolsSucceeded: 0,
      symbolsFailed: TRACKED_SYMBOLS.length,
      observationsCreated: 0,
      observationsSkipped: 0,
      history: newHistory,
      autoObservations: getAutoIntelligenceCycleState().autoObservations,
    });

    return { ok: false, error: message };
  } finally {
    tickLock = false;
  }
}

export function getLatestAutoObservation(): AutoObservationRecord | null {
  const state = getAutoIntelligenceCycleState();
  return state.autoObservations.length > 0 ? state.autoObservations[0] : null;
}

export function getAutoObservations(limit: number = 10): AutoObservationRecord[] {
  const state = getAutoIntelligenceCycleState();
  return state.autoObservations.slice(0, limit);
}

export function clearAutoIntelligenceCycleHistory(): boolean {
  const state = getAutoIntelligenceCycleState();
  saveState({
    ...state,
    lastRunAt: null,
    lastStatus: null,
    lastTickStartedAt: null,
    lastTickCompletedAt: null,
    nextRunAt: state.enabled ? new Date(Date.now() + DEFAULT_CYCLE_INTERVAL_MS).toISOString() : null,
    lastSymbol: null,
    lastScore: null,
    lastReadiness: null,
    lastSource: null,
    lastError: null,
    symbolsScanned: 0,
    symbolsSucceeded: 0,
    symbolsFailed: 0,
    history: [],
  });
  return true;
}
