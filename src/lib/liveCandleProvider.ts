import {
  evaluateMarketDataIntegrity,
  type Candle,
  type MarketDataIntegrityReport,
} from "@/lib/marketDataIntegrity";

/**
 * Live Read-Only 15m Candle Provider
 *
 * Fetches public 15m OHLC candles from Binance public klines endpoint.
 * No authentication. No private API keys. No order placement.
 * Read-only market data for integrity validation only.
 */

export type LiveCandleSymbol = "BTCUSDT" | "ETHUSDT" | "SOLUSDT" | "ADAUSDT" | "AVAXUSDT";

export interface LiveCandleFetchOptions {
  symbol: LiveCandleSymbol;
  limit?: number;
  signal?: AbortSignal;
}

export interface LiveCandleFetchResult {
  ok: boolean;
  candles: Candle[];
  error?: string;
  fetchedAt: string;
  endpoint: string;
  httpStatus?: number;
}

const BINANCE_KLINES_ENDPOINT = "https://api.binance.com/api/v3/klines";
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

/**
 * Type guard for a raw Binance kline array.
 * Binance klines are arrays: [openTime, open, high, low, close, volume, closeTime, ...]
 */
export function isRawBinanceKline(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 7) return false;
  return (
    typeof value[0] === "number" &&
    typeof value[1] === "string" &&
    typeof value[2] === "string" &&
    typeof value[3] === "string" &&
    typeof value[4] === "string" &&
    typeof value[5] === "string" &&
    typeof value[6] === "number"
  );
}

/**
 * Normalize raw Binance kline arrays into Candle objects.
 * Skips malformed entries. Returns empty array if input is not an array.
 */
export function normalizeBinanceKlines(
  raw: unknown,
  symbol: string,
): Candle[] {
  if (!Array.isArray(raw)) return [];
  const candles: Candle[] = [];
  for (const item of raw) {
    if (!isRawBinanceKline(item)) continue;
    const openTime = item[0] as number;
    const timestamp = new Date(openTime).toISOString();
    const open = Number(item[1] as string);
    const high = Number(item[2] as string);
    const low = Number(item[3] as string);
    const close = Number(item[4] as string);
    const volume = Number(item[5] as string);
    if (
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      continue;
    }
    candles.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : undefined,
      source: "LIVE_READ_ONLY",
      symbol,
      timeframe: "15m",
    });
  }
  return candles;
}

/**
 * Fetch public 15m candles from Binance.
 * Returns a LiveCandleFetchResult with normalized candles or an error.
 * Never throws -- all failures are captured in the result.
 */
export async function fetchLive15mCandles(
  options: LiveCandleFetchOptions,
): Promise<LiveCandleFetchResult> {
  const { symbol, limit = DEFAULT_LIMIT, signal } = options;
  const clampedLimit = Math.max(1, Math.min(MAX_LIMIT, limit));
  const endpoint = `${BINANCE_KLINES_ENDPOINT}?symbol=${symbol}&interval=15m&limit=${clampedLimit}`;
  const fetchedAt = new Date().toISOString();

  try {
    const response = await fetch(endpoint, { signal });
    if (!response.ok) {
      return {
        ok: false,
        candles: [],
        error: `HTTP ${response.status} ${response.statusText}`.trim(),
        fetchedAt,
        endpoint,
        httpStatus: response.status,
      };
    }
    const data: unknown = await response.json();
    const candles = normalizeBinanceKlines(data, symbol);
    if (candles.length === 0) {
      return {
        ok: false,
        candles: [],
        error: "No valid candles in response",
        fetchedAt,
        endpoint,
        httpStatus: response.status,
      };
    }
    return {
      ok: true,
      candles,
      fetchedAt,
      endpoint,
      httpStatus: response.status,
    };
  } catch (err) {
    if (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError") {
      return {
        ok: false,
        candles: [],
        error: "Request aborted",
        fetchedAt,
        endpoint,
      };
    }
    const message = err instanceof Error ? err.message : "Unknown fetch error";
    return {
      ok: false,
      candles: [],
      error: message,
      fetchedAt,
      endpoint,
    };
  }
}

/**
 * Run the Market Data Integrity Engine on live candles.
 * Produces a report with source: LIVE_READ_ONLY.
 */
export function runIntegrityCheckForLive(
  symbol: string,
  candles: Candle[],
  now?: string,
): MarketDataIntegrityReport {
  return evaluateMarketDataIntegrity({
    candles,
    symbol,
    timeframe: "15m",
    source: "LIVE_READ_ONLY",
    now,
  });
}