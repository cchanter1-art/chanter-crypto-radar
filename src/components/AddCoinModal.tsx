import { useState } from "react";
import { X, Plus } from "lucide-react";
import { COINS } from "@/data/mockData";

interface AddCoinModalProps {
  onClose: () => void;
  onAdd: (coinId: string) => void;
  existingIds: string[];
}

export default function AddCoinModal({ onClose, onAdd, existingIds }: AddCoinModalProps) {
  const [selected, setSelected] = useState("");

  const availableCoins = COINS.filter((c) => !existingIds.includes(c.id));

  const handleAdd = () => {
    if (selected) {
      onAdd(selected);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center animate-fade-in"
      style={{ background: "rgba(5,5,5,0.8)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="card-surface rounded-xl p-6 w-full mx-4 animate-slide-up"
        style={{
          maxWidth: 400,
          border: "1px solid rgba(201,215,227,0.08)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3
            className="section-title"
            style={{ fontSize: 20 }}
          >
            Add Coin
          </h3>
          <button onClick={onClose} className="p-1 transition-colors hover:text-[#c9d7e3]" style={{ color: "#4b5563" }}>
            <X size={18} />
          </button>
        </div>

        {availableCoins.length === 0 ? (
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 300,
              fontSize: 14,
              color: "#4b5563",
            }}
          >
            All available coins are already in your watchlist.
          </p>
        ) : (
          <>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="input-dark mb-4 cursor-pointer"
            >
              <option value="" disabled>
                Select a coin...
              </option>
              {availableCoins.map((coin) => (
                <option key={coin.id} value={coin.id}>
                  {coin.symbol} — {coin.name}
                </option>
              ))}
            </select>

            <button
              onClick={handleAdd}
              disabled={!selected}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={14} />
              Add to Watchlist
            </button>
          </>
        )}
      </div>
    </div>
  );
}
