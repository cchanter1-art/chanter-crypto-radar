import { RefreshCw } from "lucide-react";
import { useAppState } from "@/context/AppContext";

function formatUpdateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MarketPriceStatus() {
  const {
    priceStatus,
    priceError,
    lastPriceUpdate,
    refreshPrices,
  } = useAppState();

  const isLoading = priceStatus === "loading";
  const updatedAt = formatUpdateTime(lastPriceUpdate);
  const message = isLoading
    ? "Loading live market prices..."
    : priceStatus === "live"
      ? `Live CoinGecko prices${updatedAt ? ` · Updated ${updatedAt}` : ""}`
      : priceError ?? "Live prices are unavailable. Mock prices are in use.";

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <p
        role="status"
        aria-live="polite"
        className="text-xs"
        style={{
          color: priceStatus === "fallback" ? "#f59e0b" : "#4b5563",
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 400,
        }}
      >
        {message}
      </p>
      <button
        type="button"
        onClick={() => void refreshPrices()}
        disabled={isLoading}
        className="flex items-center gap-1.5 text-xs transition-colors disabled:cursor-wait disabled:opacity-50"
        style={{ color: "#cc9258" }}
        aria-label="Refresh market prices"
      >
        <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
        Refresh
      </button>
    </div>
  );
}
