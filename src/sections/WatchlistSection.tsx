import { useAppState } from "@/context/AppContext";
import CoinCard from "@/components/CoinCard";
import MarketPriceStatus from "@/components/MarketPriceStatus";
import PriceAlerts from "@/components/PriceAlerts";
import WatchlistCoinManager from "@/components/WatchlistCoinManager";
import PaperSignalEngine from "@/components/PaperSignalEngine";

export default function WatchlistSection() {
  const { state, dispatch, coins } = useAppState();

  const watchlistCoins = coins.filter((c) => state.watchlist.includes(c.id));

  const handleRemove = (coinId: string) => {
    dispatch({ type: "REMOVE_FROM_WATCHLIST", payload: coinId });
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="section-title mb-2">Your Watchlist</h2>
        <p className="section-subtitle">Track your favorite assets in real-time</p>
      </div>

      <MarketPriceStatus />

      {watchlistCoins.length === 0 ? (
        <div
          className="card-surface rounded-xl p-8 text-center"
          style={{ border: "1px solid rgba(201,215,227,0.06)" }}
        >
          <p className="text-sm" style={{ color: "#c9d7e3" }}>
            Your watchlist is empty.
          </p>
          <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>
            Add a supported coin below or restore the default watchlist.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {watchlistCoins.map((coin) => (
            <CoinCard key={coin.id} coin={coin} onRemove={handleRemove} />
          ))}
        </div>
      )}

      <WatchlistCoinManager />

      <PriceAlerts />

      <PaperSignalEngine className="mt-8" />
    </div>
  );
}
