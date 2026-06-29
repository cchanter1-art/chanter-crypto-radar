const COINGECKO_MARKETS_URL = "https://api.coingecko.com/api/v3/coins/markets";
const REQUEST_TIMEOUT_MS = 10_000;

export const COINGECKO_COIN_IDS = {
  btc: "bitcoin",
  eth: "ethereum",
  sol: "solana",
  ada: "cardano",
  avax: "avalanche-2",
} as const;

export interface LiveCoinPrice {
  coinId: keyof typeof COINGECKO_COIN_IDS;
  price: number;
  change24h: number;
  sparkline: number[];
  lastUpdated: string;
}

interface CoinGeckoMarket {
  id?: unknown;
  current_price?: unknown;
  price_change_percentage_24h?: unknown;
  sparkline_in_7d?: {
    price?: unknown;
  } | null;
  last_updated?: unknown;
}

export class CryptoPriceServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoPriceServiceError";
  }
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function fetchCryptoPrices(signal?: AbortSignal): Promise<LiveCoinPrice[]> {
  const controller = new AbortController();
  const abortRequest = () => controller.abort();
  signal?.addEventListener("abort", abortRequest, { once: true });

  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const params = new URLSearchParams({
    vs_currency: "usd",
    ids: Object.values(COINGECKO_COIN_IDS).join(","),
    sparkline: "true",
    price_change_percentage: "24h",
  });

  try {
    const response = await fetch(`${COINGECKO_MARKETS_URL}?${params}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (response.status === 429) {
      throw new CryptoPriceServiceError(
        "CoinGecko rate limit reached. Mock prices are in use.",
      );
    }

    if (!response.ok) {
      throw new CryptoPriceServiceError(
        "CoinGecko prices are temporarily unavailable. Mock prices are in use.",
      );
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      throw new CryptoPriceServiceError(
        "CoinGecko returned invalid market data. Mock prices are in use.",
      );
    }

    const marketsById = new Map<string, CoinGeckoMarket>();
    for (const market of payload as CoinGeckoMarket[]) {
      if (typeof market.id === "string") {
        marketsById.set(market.id, market);
      }
    }

    return Object.entries(COINGECKO_COIN_IDS).map(([coinId, coinGeckoId]) => {
      const market = marketsById.get(coinGeckoId);
      const sparkline = Array.isArray(market?.sparkline_in_7d?.price)
        ? market.sparkline_in_7d.price.filter(isPositiveNumber)
        : [];

      if (
        !market ||
        !isPositiveNumber(market.current_price) ||
        !isFiniteNumber(market.price_change_percentage_24h) ||
        typeof market.last_updated !== "string" ||
        sparkline.length < 2
      ) {
        throw new CryptoPriceServiceError(
          "CoinGecko returned incomplete market data. Mock prices are in use.",
        );
      }

      return {
        coinId: coinId as keyof typeof COINGECKO_COIN_IDS,
        price: market.current_price,
        change24h: market.price_change_percentage_24h,
        sparkline,
        lastUpdated: market.last_updated,
      };
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new DOMException("The price request was cancelled.", "AbortError");
    }
    if (error instanceof CryptoPriceServiceError) {
      throw error;
    }
    throw new CryptoPriceServiceError(
      "Could not reach CoinGecko. Mock prices are in use.",
    );
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortRequest);
  }
}
