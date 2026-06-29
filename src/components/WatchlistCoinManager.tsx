import { Check, Plus, RotateCcw } from "lucide-react";
import { useAppState } from "@/context/AppContext";
import { COINS, DEFAULT_WATCHLIST } from "@/data/mockData";

export default function WatchlistCoinManager() {
  const { state, dispatch } = useAppState();
  const isDefaultWatchlist =
    state.watchlist.length === DEFAULT_WATCHLIST.length &&
    DEFAULT_WATCHLIST.every((coinId) => state.watchlist.includes(coinId));

  const handleAdd = (coinId: string) => {
    dispatch({ type: "ADD_TO_WATCHLIST", payload: coinId });
  };

  const handleRestore = () => {
    dispatch({ type: "RESTORE_DEFAULT_WATCHLIST" });
  };

  return (
    <section
      className="card-surface mt-8 rounded-xl p-5 lg:p-6"
      style={{ border: "1px solid rgba(201,215,227,0.06)" }}
      aria-labelledby="add-coin-title"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 id="add-coin-title" className="section-title mb-1" style={{ fontSize: 20 }}>
            Add Coin
          </h3>
          <p className="text-xs" style={{ color: "#4b5563" }}>
            Choose from the supported coin universe
          </p>
        </div>
        <button
          type="button"
          onClick={handleRestore}
          disabled={isDefaultWatchlist}
          className="flex items-center gap-1.5 text-xs transition-colors disabled:cursor-default disabled:opacity-40"
          style={{ color: "#cc9258" }}
        >
          <RotateCcw size={12} />
          Restore default watchlist
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {COINS.map((coin) => {
          const isTracked = state.watchlist.includes(coin.id);

          return (
            <button
              key={coin.id}
              type="button"
              onClick={() => handleAdd(coin.id)}
              disabled={isTracked}
              className="flex items-center justify-between rounded-lg px-3 py-3 text-left transition-colors disabled:cursor-default"
              style={{
                backgroundColor: isTracked ? "rgba(201,215,227,0.025)" : "rgba(204,146,88,0.05)",
                border: isTracked
                  ? "1px solid rgba(201,215,227,0.06)"
                  : "1px solid rgba(204,146,88,0.16)",
              }}
              aria-label={isTracked ? `${coin.symbol} is already in watchlist` : `Add ${coin.symbol} to watchlist`}
            >
              <span>
                <span className="data-mono block text-sm" style={{ color: "#c9d7e3" }}>
                  {coin.symbol}
                </span>
                <span className="mt-0.5 block text-[10px]" style={{ color: "#4b5563" }}>
                  {coin.name}
                </span>
              </span>
              <span style={{ color: isTracked ? "#22c55e" : "#cc9258" }}>
                {isTracked ? <Check size={13} /> : <Plus size={13} />}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
