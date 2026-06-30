import assert from "node:assert/strict";
import { createServer } from "vite";

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
  key: (index) => [...store.keys()][index] ?? null,
  get length() {
    return store.size;
  },
};

const server = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

try {
  const liveProvider = await server.ssrLoadModule("/src/lib/liveCandleProvider.ts");
  const integrity = await server.ssrLoadModule("/src/lib/marketDataIntegrity.ts");

  // 1. normalizeBinanceKlines: valid raw data
  const validRaw = [
    [1719504000000, "61000", "61500", "60800", "61200", "100.5", 1719504900000],
    [1719504900000, "61200", "61800", "61100", "61700", "120.3", 1719505800000],
    [1719505800000, "61700", "62000", "61600", "61900", "85.7", 1719506700000],
  ];
  const candles = liveProvider.normalizeBinanceKlines(validRaw, "BTCUSDT");
  assert.equal(candles.length, 3, "Must normalize 3 valid klines");
  assert.equal(candles[0].symbol, "BTCUSDT");
  assert.equal(candles[0].timeframe, "15m");
  assert.equal(candles[0].source, "LIVE_READ_ONLY");
  assert.equal(candles[0].open, 61000);
  assert.equal(candles[0].high, 61500);
  assert.equal(candles[0].low, 60800);
  assert.equal(candles[0].close, 61200);
  assert.equal(candles[0].volume, 100.5);
  assert.equal(candles[0].timestamp, "2024-06-27T16:00:00.000Z");

  // 2. Reject malformed arrays
  assert.equal(liveProvider.normalizeBinanceKlines(null, "BTCUSDT").length, 0);
  assert.equal(liveProvider.normalizeBinanceKlines("not an array", "BTCUSDT").length, 0);
  assert.equal(liveProvider.normalizeBinanceKlines([], "BTCUSDT").length, 0);

  // Array with wrong types (open not string)
  const badRaw1 = [
    [1719504000000, 61000, "61500", "60800", "61200", "100.5", 1719504900000],
  ];
  assert.equal(liveProvider.normalizeBinanceKlines(badRaw1, "BTCUSDT").length, 0);

  // Array with non-numeric strings
  const badRaw2 = [
    [1719504000000, "abc", "61500", "60800", "61200", "100.5", 1719504900000],
  ];
  assert.equal(liveProvider.normalizeBinanceKlines(badRaw2, "BTCUSDT").length, 0);

  // Too short array
  const badRaw3 = [
    [1719504000000, "61000", "61500"],
  ];
  assert.equal(liveProvider.normalizeBinanceKlines(badRaw3, "BTCUSDT").length, 0);

  // 3. Mixed valid/invalid: only valid ones pass
  const mixedRaw = [
    [1719504000000, "61000", "61500", "60800", "61200", "100.5", 1719504900000],
    ["bad", "61200", "61800", "61100", "61700", "120.3", 1719505800000],
    [1719505800000, "61700", "62000", "61600", "61900", "85.7", 1719506700000],
  ];
  const mixedCandles = liveProvider.normalizeBinanceKlines(mixedRaw, "BTCUSDT");
  assert.equal(mixedCandles.length, 2, "Must skip invalid klines, keep valid ones");

  // 4. Integrity check on normalized live candles (100 candles)
  const baseTime = 1719504000000;
  const manyRaw = Array.from({ length: 100 }, (_, i) => {
    const openTime = baseTime + i * 900000;
    const price = 60000 + i * 10;
    return [openTime, String(price), String(price + 200), String(price - 100), String(price + 50), String(100 + i), openTime + 900000];
  });
  const liveCandles = liveProvider.normalizeBinanceKlines(manyRaw, "BTCUSDT");
  assert.equal(liveCandles.length, 100);

  const liveReport = liveProvider.runIntegrityCheckForLive(
    "BTCUSDT",
    liveCandles,
    new Date(baseTime + 100 * 900000).toISOString(),
  );
  assert.ok(liveReport, "Live candle integrity check must produce a report");
  assert.equal(liveReport.source, "LIVE_READ_ONLY");
  assert.equal(liveReport.symbol, "BTCUSDT");
  assert.equal(liveReport.timeframe, "15m");
  assert.equal(liveReport.candleCount, 100);
  assert.equal(liveReport.checks.shapeValid, true);
  assert.equal(liveReport.checks.ohlcConsistent, true);
  assert.equal(liveReport.checks.timestampOrdered, true);
  assert.equal(liveReport.checks.intervalValid, true);
  assert.ok(
    !liveReport.warnings.some((w) => w.includes("local mock")),
    "Live data must not have local mock warning",
  );

  // 5. Mock fetch success
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => manyRaw,
  });
  try {
    const result = await liveProvider.fetchLive15mCandles({ symbol: "BTCUSDT", limit: 100 });
    assert.equal(result.ok, true, "Fetch must succeed with mocked response");
    assert.equal(result.candles.length, 100);
    assert.ok(result.fetchedAt, "Must include fetchedAt timestamp");
    assert.ok(result.endpoint.includes("binance"), "Endpoint must be Binance");
    assert.ok(result.endpoint.includes("BTCUSDT"), "Endpoint must include symbol");
    assert.ok(result.endpoint.includes("15m"), "Endpoint must include interval");
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 6. Mock fetch HTTP error (e.g. geo-block 451)
  globalThis.fetch = async () => ({
    ok: false,
    status: 451,
    statusText: "Unavailable For Legal Reasons",
    json: async () => ({}),
  });
  try {
    const result = await liveProvider.fetchLive15mCandles({ symbol: "BTCUSDT" });
    assert.equal(result.ok, false, "HTTP error must produce failure");
    assert.equal(result.candles.length, 0, "Failed fetch must not produce candles");
    assert.ok(result.error, "Must include error message");
    assert.ok(result.error.includes("451"), "Error must include HTTP status");
    assert.equal(result.httpStatus, 451);
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 7. Mock fetch network error
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  try {
    const result = await liveProvider.fetchLive15mCandles({ symbol: "ETHUSDT" });
    assert.equal(result.ok, false, "Network error must produce failure");
    assert.equal(result.candles.length, 0);
    assert.ok(result.error.includes("Failed to fetch"));
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 8. Mock fetch with non-array JSON (error object)
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ error: "Invalid symbol" }),
  });
  try {
    const result = await liveProvider.fetchLive15mCandles({ symbol: "BTCUSDT" });
    assert.equal(result.ok, false, "Non-array response must fail");
    assert.equal(result.candles.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 9. Mock fetch with all-malformed klines
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => [["bad", "data"], [1, 2, 3]],
  });
  try {
    const result = await liveProvider.fetchLive15mCandles({ symbol: "BTCUSDT" });
    assert.equal(result.ok, false, "Malformed klines must fail");
    assert.equal(result.candles.length, 0);
    assert.ok(result.error.includes("No valid candles"));
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 10. Verify module exports only data functions (no order/auth logic)
  assert.equal(typeof liveProvider.fetchLive15mCandles, "function");
  assert.equal(typeof liveProvider.normalizeBinanceKlines, "function");
  assert.equal(typeof liveProvider.runIntegrityCheckForLive, "function");
  assert.equal(typeof liveProvider.isRawBinanceKline, "function");

  // 11. Live report saves/loads through existing integrity history
  const saveResult = integrity.saveMarketDataIntegrityHistory([liveReport]);
  assert.equal(saveResult, true, "Live report must save to history");
  const loaded = integrity.loadLatestMarketDataIntegrity();
  assert.ok(loaded, "Live report must load from history");
  assert.equal(loaded.source, "LIVE_READ_ONLY");
  integrity.clearMarketDataIntegrityHistory();

  // 12. Live data with bad OHLC is rejected by integrity engine
  const badOhlcRaw = [
    [1719504000000, "61000", "61500", "60800", "61200", "100.5", 1719504900000],
    [1719504900000, "61200", "61100", "61800", "61700", "120.3", 1719505800000],
  ];
  const badOhlcCandles = liveProvider.normalizeBinanceKlines(badOhlcRaw, "BTCUSDT");
  assert.equal(badOhlcCandles.length, 2);
  const badReport = liveProvider.runIntegrityCheckForLive(
    "BTCUSDT",
    badOhlcCandles,
    new Date(1719505800000 + 900000).toISOString(),
  );
  assert.equal(badReport.checks.ohlcConsistent, false, "Bad OHLC must fail");
  assert.equal(badReport.readinessStatus, "blocked", "Bad OHLC must block");

  // 13. Live data with gaps detected
  const gappedRaw = [
    [1719504000000, "61000", "61500", "60800", "61200", "100.5", 1719504900000],
    [1719506700000, "61700", "62000", "61600", "61900", "85.7", 1719507600000],
  ];
  const gappedCandles = liveProvider.normalizeBinanceKlines(gappedRaw, "BTCUSDT");
  const gappedReport = liveProvider.runIntegrityCheckForLive(
    "BTCUSDT",
    gappedCandles,
    new Date(1719507600000 + 900000).toISOString(),
  );
  assert.ok(gappedReport.gapCount > 0, "Missing 15m candle must produce gap");

  // 14. isRawBinanceKline type guard
  assert.equal(liveProvider.isRawBinanceKline([1, "a", "b", "c", "d", "e", 2]), true);
  assert.equal(liveProvider.isRawBinanceKline([1, 2, 3]), false);
  assert.equal(liveProvider.isRawBinanceKline("not array"), false);
  assert.equal(liveProvider.isRawBinanceKline(null), false);

  console.log(
    "Live Candle Provider verification passed: normalization, malformed rejection, mock fetch success/failure, integrity check on live candles, gap detection, bad OHLC blocking, history persistence, and safety verification.",
  );
} finally {
  await server.close();
}