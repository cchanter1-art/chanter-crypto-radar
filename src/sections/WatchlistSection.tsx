import { useState } from "react";
import { Plus } from "lucide-react";
import { useAppState } from "@/context/AppContext";
import CoinCard from "@/components/CoinCard";
import AddCoinModal from "@/components/AddCoinModal";
import MarketPriceStatus from "@/components/MarketPriceStatus";

export default function WatchlistSection() {
  const { state, dispatch, coins } = useAppState();
  const [showModal, setShowModal] = useState(false);

  const watchlistCoins = coins.filter((c) => state.watchlist.includes(c.id));

  const handleAdd = (coinId: string) => {
    dispatch({ type: "ADD_TO_WATCHLIST", payload: coinId });
  };

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {watchlistCoins.map((coin) => (
          <CoinCard key={coin.id} coin={coin} onRemove={handleRemove} />
        ))}
      </div>

      {watchlistCoins.length < coins.length && (
        <button
          onClick={() => setShowModal(true)}
          className="btn-accent mt-8 flex items-center gap-2"
        >
          <Plus size={14} />
          Add Coin
        </button>
      )}

      {showModal && (
        <AddCoinModal
          onClose={() => setShowModal(false)}
          onAdd={handleAdd}
          existingIds={state.watchlist}
        />
      )}
    </div>
  );
}
