/**
 * Historical Candle Store v1
 *
 * Local historical candle store so Paper Replay can test more windows
 * without needing real trades or wallet access.
 *
 * Safety guarantees:
 * - No wallet connection
 * - No real orders
 * - No buy/sell/execute buttons
 * - Does not fabricate prices
 * - Missing candles stay unavailable
 * - Read-only from replay perspective
 * - Does not change live Auto Intelligence Cycle behavior
 */

// === Types ===

export interface StoredCandle {
  timestamp: string; // ISO string of candle open time
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: string; // ISO string of candle close time
}

export interface CandleStoreRecord {
  symbol: string;
  timeframe: "15m" | "1h" | "4h";
  candles: StoredCandle[];
  lastUpdated: string;
  source: string;
}

export type CandleStoreMap = Map<string, CandleStoreRecord>;

// === Constants ===

export const CANDLE_STORE_STORAGE_KEY = "chanter-candle-history-store";
export const MAX_CANDLES_PER_SYMBOL_TF = 500; // cap per symbol/timeframe

const VALID_TIMEFRAMES = new Set(["15m", "1h", "4h"]);

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

// === Validation ===

export function normalizeStoredCandle(value: unknown): StoredCandle | null {
  if (!isRecord(value)) return null;

  const timestamp = value.timestamp;
  if (!isValidDateString(timestamp)) return null;

  const open = value.open;
  const high = value.high;
  const low = value.low;
  const close = value.close;
  const volume = value.volume;
  const closeTime = value.closeTime;

  if (!isFiniteNumber(open) || !isFiniteNumber(high) || !isFiniteNumber(low) || !isFiniteNumber(close)) {
    return null;
  }
  if (!isFiniteNumber(volume)) return null;
  if (!isValidDateString(closeTime)) return null;

  // Basic OHLC sanity: high >= max(open, close), low <= min(open, close)
  if (high < Math.max(open, close) || low > Math.min(open, close)) {
    return null;
  }

  // Reject future timestamps (beyond current time + 1 hour tolerance)
  const ts = Date.parse(timestamp);
  if (ts > Date.now() + 60 * 60 * 1000) return null;

  return {
    timestamp,
    open,
    high,
    low,
    close,
    volume,
    closeTime,
  };
}

export function normalizeCandleStoreRecord(value: unknown): CandleStoreRecord | null {
  if (!isRecord(value)) return null;

  const symbol = typeof value.symbol === "string" ? value.symbol : "";
  const timeframe = typeof value.timeframe === "string" && VALID_TIMEFRAMES.has(value.timeframe) ? value.timeframe as "15m" | "1h" | "4h" : null;
  if (!symbol || !timeframe) return null;

  const candles = Array.isArray(value.candles)
    ? value.candles
        .map(normalizeStoredCandle)
        .filter((c): c is StoredCandle => c !== null)
    : [];

  // Dedup by timestamp (keep latest)
  const seen = new Map<string, StoredCandle>();
  for (const c of candles) {
    seen.set(c.timestamp, c);
  }

  // Sort by timestamp ascending
  const deduped = [...seen.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  return {
    symbol,
    timeframe,
    candles: deduped.slice(-MAX_CANDLES_PER_SYMBOL_TF),
    lastUpdated: isValidDateString(value.lastUpdated) ? value.lastUpdated : new Date().toISOString(),
    source: typeof value.source === "string" ? value.source : "UNKNOWN",
  };
}

// === Persistence ===

export function loadCandleStore(): CandleStoreRecord[] {
  try {
    const raw = localStorage.getItem(CANDLE_STORE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeCandleStoreRecord)
      .filter((r): r is CandleStoreRecord => r !== null);
  } catch {
    return [];
  }
}

export function saveCandleStore(records: CandleStoreRecord[]): void {
  try {
    localStorage.setItem(CANDLE_STORE_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // ignore
  }
}

export function getCandleStoreMap(): CandleStoreMap {
  const records = loadCandleStore();
  const map: CandleStoreMap = new Map();
  for (const r of records) {
    map.set(`${r.symbol}|${r.timeframe}`, r);
  }
  return map;
}

export function getCandles(
  map: CandleStoreMap,
  symbol: string,
  timeframe: "15m" | "1h" | "4h",
): StoredCandle[] {
  const record = map.get(`${symbol}|${timeframe}`);
  return record?.candles ?? [];
}

export function addCandles(
  symbol: string,
  timeframe: "15m" | "1h" | "4h",
  newCandles: StoredCandle[],
  source: string = "AUTO_CYCLE",
): CandleStoreRecord[] {
  const existing = loadCandleStore();
  const key = `${symbol}|${timeframe}`;
  const idx = existing.findIndex((r) => `${r.symbol}|${r.timeframe}` === key);

  const validNew = newCandles
    .map(normalizeStoredCandle)
    .filter((c): c is StoredCandle => c !== null);

  if (idx >= 0) {
    // Merge: dedup by timestamp, keep latest
    const merged = new Map<string, StoredCandle>();
    for (const c of existing[idx].candles) merged.set(c.timestamp, c);
    for (const c of validNew) merged.set(c.timestamp, c);
    const sorted = [...merged.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    existing[idx] = {
      ...existing[idx],
      candles: sorted.slice(-MAX_CANDLES_PER_SYMBOL_TF),
      lastUpdated: new Date().toISOString(),
      source,
    };
  } else {
    const sorted = validNew
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
      .slice(-MAX_CANDLES_PER_SYMBOL_TF);
    existing.push({
      symbol,
      timeframe,
      candles: sorted,
      lastUpdated: new Date().toISOString(),
      source,
    });
  }

  saveCandleStore(existing);
  return existing;
}

export function clearCandleStore(): void {
  try {
    localStorage.removeItem(CANDLE_STORE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// === Replay Window Builder ===

export interface HistoricalReplayWindow {
  windowId: string;
  symbol: string;
  timeframe: "15m" | "1h" | "4h";
  baselineTime: string;
  baselinePrice: number;
  futureClosePrice: number;
  futureTime: string;
  movePct: number;
  available: boolean;
  missingDataReason: string | null;
  direction: string;
  favorable: boolean | null;
  source: "CANDLE_STORE";
}

const HORIZON_OFFSETS: Record<"15m" | "1h" | "4h", number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
};

const FLAT_THRESHOLD_PCT = 0.15;

function computeFavorable(direction: string, movePct: number): boolean | null {
  if (Math.abs(movePct) < FLAT_THRESHOLD_PCT) return null;
  if (direction === "LONG") return movePct > 0;
  if (direction === "SHORT") return movePct < 0;
  return null;
}

/**
 * Build replay windows from the candle store.
 * For each candle (except the last), the next candle at the horizon offset
 * provides the future close price.
 */
export function buildCandleStoreReplayWindows(
  map: CandleStoreMap,
  symbols: string[],
  direction: string = "LONG",
): HistoricalReplayWindow[] {
  const windows: HistoricalReplayWindow[] = [];
  const timeframes: ("15m" | "1h" | "4h")[] = ["15m", "1h", "4h"];

  for (const symbol of symbols) {
    for (const tf of timeframes) {
      const candles = getCandles(map, symbol, tf);
      if (candles.length < 2) {
        // Not enough candles for any window
        windows.push({
          windowId: `cs-${symbol}-${tf}-empty`,
          symbol,
          timeframe: tf,
          baselineTime: new Date().toISOString(),
          baselinePrice: 0,
          futureClosePrice: 0,
          futureTime: new Date().toISOString(),
          movePct: 0,
          available: false,
          missingDataReason: `Insufficient ${tf} candle data (${candles.length} candles, need >= 2)`,
          direction,
          favorable: null,
          source: "CANDLE_STORE",
        });
        continue;
      }

      const offsetMs = HORIZON_OFFSETS[tf];

      for (let i = 0; i < candles.length - 1; i++) {
        const baseline = candles[i];
        const baselineMs = Date.parse(baseline.timestamp);
        const targetMs = baselineMs + offsetMs;

        // Find the candle whose open time is closest to targetMs (and >= baselineMs)
        let future: StoredCandle | null = null;
        let minDiff = Infinity;
        for (let j = i + 1; j < candles.length; j++) {
          const diff = Math.abs(Date.parse(candles[j].timestamp) - targetMs);
          if (diff < minDiff) {
            minDiff = diff;
            future = candles[j];
          }
          if (Date.parse(candles[j].timestamp) > targetMs) break;
        }

        if (!future) {
          // No future candle found -- mark unavailable
          windows.push({
            windowId: `cs-${symbol}-${tf}-${i}-no-future`,
            symbol,
            timeframe: tf,
            baselineTime: baseline.timestamp,
            baselinePrice: baseline.close,
            futureClosePrice: 0,
            futureTime: baseline.timestamp,
            movePct: 0,
            available: false,
            missingDataReason: `No future ${tf} candle available for this baseline`,
            direction,
            favorable: null,
            source: "CANDLE_STORE",
          });
          continue;
        }

        const movePct = baseline.close > 0
          ? ((future.close - baseline.close) / baseline.close) * 100
          : 0;

        windows.push({
          windowId: `cs-${symbol}-${tf}-${i}`,
          symbol,
          timeframe: tf,
          baselineTime: baseline.timestamp,
          baselinePrice: baseline.close,
          futureClosePrice: future.close,
          futureTime: future.timestamp,
          movePct,
          available: true,
          missingDataReason: null,
          direction,
          favorable: computeFavorable(direction, movePct),
          source: "CANDLE_STORE",
        });
      }
    }
  }

  return windows;
}

export interface CandleStoreSummary {
  totalRecords: number;
  totalCandles: number;
  byTimeframe: { "15m": number; "1h": number; "4h": number };
  bySymbol: { symbol: string; "15m": number; "1h": number; "4h": number; total: number }[];
  oldestCandle: string | null;
  newestCandle: string | null;
}

export function summarizeCandleStore(map: CandleStoreMap): CandleStoreSummary {
  let totalCandles = 0;
  const byTimeframe = { "15m": 0, "1h": 0, "4h": 0 };
  const symbolMap = new Map<string, { "15m": number; "1h": number; "4h": number; total: number }>();
  let oldestMs = Infinity;
  let newestMs = -Infinity;

  for (const [, record] of map) {
    totalCandles += record.candles.length;
    byTimeframe[record.timeframe] += record.candles.length;

    if (!symbolMap.has(record.symbol)) {
      symbolMap.set(record.symbol, { "15m": 0, "1h": 0, "4h": 0, total: 0 });
    }
    const ss = symbolMap.get(record.symbol)!;
    ss[record.timeframe] = record.candles.length;
    ss.total += record.candles.length;

    for (const c of record.candles) {
      const ms = Date.parse(c.timestamp);
      if (!Number.isNaN(ms)) {
        if (ms < oldestMs) oldestMs = ms;
        if (ms > newestMs) newestMs = ms;
      }
    }
  }

  const bySymbol = [...symbolMap.entries()]
    .map(([symbol, s]) => ({ symbol, ...s }))
    .sort((a, b) => b.total - a.total || a.symbol.localeCompare(b.symbol));

  return {
    totalRecords: map.size,
    totalCandles,
    byTimeframe,
    bySymbol,
    oldestCandle: oldestMs !== Infinity ? new Date(oldestMs).toISOString() : null,
    newestCandle: newestMs !== -Infinity ? new Date(newestMs).toISOString() : null,
  };
}
