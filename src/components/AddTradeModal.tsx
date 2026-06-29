import { useState } from "react";
import { X, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useAppState } from "@/context/AppContext";
import type { PaperTrade } from "@/types";

interface AddTradeModalProps {
  onClose: () => void;
  onAdd: (trade: PaperTrade) => void;
}

export default function AddTradeModal({ onClose, onAdd }: AddTradeModalProps) {
  const { coins } = useAppState();
  const [coinId, setCoinId] = useState("");
  const [type, setType] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");

  const selectedCoin = coins.find((c) => c.id === coinId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!coinId || !amount || !price) return;

    const trade: PaperTrade = {
      id: `trade-${Date.now()}`,
      coinId,
      type,
      amount: parseFloat(amount),
      price: parseFloat(price),
      date: new Date().toISOString(),
    };

    onAdd(trade);
    onClose();
  };

  const setMarketPrice = () => {
    if (selectedCoin) {
      setPrice(selectedCoin.price.toFixed(2));
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
          maxWidth: 440,
          border: "1px solid rgba(201,215,227,0.08)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="section-title" style={{ fontSize: 20 }}>
            Record Trade
          </h3>
          <button
            onClick={onClose}
            className="p-1 transition-colors hover:text-[#c9d7e3]"
            style={{ color: "#4b5563" }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Type Toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType("buy")}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg transition-all"
              style={{
                border: `1px solid ${type === "buy" ? "rgba(34,197,94,0.4)" : "rgba(201,215,227,0.08)"}`,
                background: type === "buy" ? "rgba(34,197,94,0.08)" : "transparent",
                color: type === "buy" ? "#22c55e" : "#4b5563",
              }}
            >
              <ArrowDownLeft size={14} />
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 400,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Buy
              </span>
            </button>
            <button
              type="button"
              onClick={() => setType("sell")}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg transition-all"
              style={{
                border: `1px solid ${type === "sell" ? "rgba(239,68,68,0.4)" : "rgba(201,215,227,0.08)"}`,
                background: type === "sell" ? "rgba(239,68,68,0.08)" : "transparent",
                color: type === "sell" ? "#ef4444" : "#4b5563",
              }}
            >
              <ArrowUpRight size={14} />
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 400,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Sell
              </span>
            </button>
          </div>

          {/* Coin Select */}
          <select
            value={coinId}
            onChange={(e) => {
              setCoinId(e.target.value);
              const coin = coins.find((c) => c.id === e.target.value);
              if (coin) setPrice(coin.price.toFixed(2));
            }}
            className="input-dark cursor-pointer"
            required
          >
            <option value="" disabled>
              Select coin...
            </option>
            {coins.map((coin) => (
              <option key={coin.id} value={coin.id}>
                {coin.symbol} — {coin.name}
              </option>
            ))}
          </select>

          {/* Amount */}
          <input
            type="number"
            step="any"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input-dark"
            required
          />

          {/* Price */}
          <div className="flex gap-2">
            <input
              type="number"
              step="any"
              placeholder="Price per unit (USD)"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="input-dark flex-1"
              required
            />
            <button
              type="button"
              onClick={setMarketPrice}
              className="btn-accent shrink-0"
              style={{ padding: "12px 12px" }}
              disabled={!selectedCoin}
            >
              Market
            </button>
          </div>

          {selectedCoin && amount && price && (
            <div
              className="rounded-lg p-3"
              style={{
                backgroundColor: "rgba(201,215,227,0.03)",
                border: "1px solid rgba(201,215,227,0.06)",
              }}
            >
              <p
                className="label-upper mb-1"
                style={{ color: "#4b5563", fontSize: 10 }}
              >
                Total {type === "buy" ? "Cost" : "Proceeds"}
              </p>
              <p
                className="data-mono text-lg"
                style={{ color: "#c9d7e3" }}
              >
                ${(parseFloat(amount || "0") * parseFloat(price || "0")).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          )}

          <button type="submit" className="btn-primary w-full mt-2">
            Record {type === "buy" ? "Purchase" : "Sale"}
          </button>
        </form>
      </div>
    </div>
  );
}
