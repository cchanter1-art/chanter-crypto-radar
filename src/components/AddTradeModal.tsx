import { useState, type FormEvent } from "react";
import { X, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useAppState } from "@/context/AppContext";
import {
  createPaperTradeId,
  getPaperHoldings,
  isSupportedPaperCoin,
} from "@/lib/paperTradeUtils";
import type { PaperTrade } from "@/types";

interface AddTradeModalProps {
  onClose: () => void;
  onAdd: (trade: PaperTrade) => void;
  initialCoinId?: string;
  initialType?: "buy" | "sell";
}

export default function AddTradeModal({
  onClose,
  onAdd,
  initialCoinId = "",
  initialType = "buy",
}: AddTradeModalProps) {
  const { state, coins } = useAppState();
  const safeInitialCoinId = isSupportedPaperCoin(initialCoinId) ? initialCoinId : "";
  const [coinId, setCoinId] = useState(safeInitialCoinId);
  const [type, setType] = useState<"buy" | "sell">(initialType);
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState(() => {
    const initialCoin = coins.find((coin) => coin.id === safeInitialCoinId);
    return initialCoin ? initialCoin.price.toFixed(2) : "";
  });
  const [formError, setFormError] = useState<string | null>(null);

  const selectedCoin = coins.find((coin) => coin.id === coinId);
  const availableHoldings = coinId ? getPaperHoldings(state.trades, coinId) : 0;
  const numericAmount = Number(amount);
  const numericPrice = Number(price);
  const hasValidPreview =
    Number.isFinite(numericAmount) &&
    numericAmount > 0 &&
    Number.isFinite(numericPrice) &&
    numericPrice > 0;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (!coinId || !selectedCoin || !isSupportedPaperCoin(coinId)) {
      setFormError("Select a supported coin.");
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFormError("Quantity must be greater than zero.");
      return;
    }
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      setFormError("Price must be greater than zero.");
      return;
    }
    if (type === "sell" && numericAmount > availableHoldings) {
      setFormError(
        `Sell quantity exceeds current holdings of ${availableHoldings.toFixed(8)} ${selectedCoin.symbol}.`,
      );
      return;
    }

    onAdd({
      id: createPaperTradeId(),
      coinId,
      type,
      amount: numericAmount,
      price: numericPrice,
      date: new Date().toISOString(),
    });
    onClose();
  };

  const setMarketPrice = () => {
    if (selectedCoin) {
      setPrice(selectedCoin.price.toFixed(2));
      setFormError(null);
    }
  };

  const selectTradeType = (nextType: "buy" | "sell") => {
    setType(nextType);
    setFormError(null);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center animate-fade-in"
      style={{ background: "rgba(5,5,5,0.8)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="card-surface rounded-xl p-6 w-full mx-4 animate-slide-up"
        style={{ maxWidth: 440, border: "1px solid rgba(201,215,227,0.08)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="section-title" style={{ fontSize: 20 }}>
            Record Trade
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close trade form"
            className="p-1 transition-colors hover:text-[#c9d7e3]"
            style={{ color: "#4b5563" }}
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-5 text-xs" style={{ color: "#4b5563" }}>
          Paper trades only. No real orders are placed.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => selectTradeType("buy")}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg transition-all"
              style={{
                border: `1px solid ${type === "buy" ? "rgba(34,197,94,0.4)" : "rgba(201,215,227,0.08)"}`,
                background: type === "buy" ? "rgba(34,197,94,0.08)" : "transparent",
                color: type === "buy" ? "#22c55e" : "#4b5563",
              }}
              aria-pressed={type === "buy"}
            >
              <ArrowDownLeft size={14} />
              <span className="label-upper" style={{ fontSize: 12 }}>Buy</span>
            </button>
            <button
              type="button"
              onClick={() => selectTradeType("sell")}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg transition-all"
              style={{
                border: `1px solid ${type === "sell" ? "rgba(239,68,68,0.4)" : "rgba(201,215,227,0.08)"}`,
                background: type === "sell" ? "rgba(239,68,68,0.08)" : "transparent",
                color: type === "sell" ? "#ef4444" : "#4b5563",
              }}
              aria-pressed={type === "sell"}
            >
              <ArrowUpRight size={14} />
              <span className="label-upper" style={{ fontSize: 12 }}>Sell</span>
            </button>
          </div>

          <div>
            <label htmlFor="trade-coin" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
              Coin
            </label>
            <select
              id="trade-coin"
              value={coinId}
              onChange={(event) => {
                setCoinId(event.target.value);
                setFormError(null);
                const coin = coins.find((item) => item.id === event.target.value);
                if (coin) setPrice(coin.price.toFixed(2));
              }}
              className="input-dark cursor-pointer"
              required
            >
              <option value="" disabled>Select coin...</option>
              {coins.map((coin) => (
                <option key={coin.id} value={coin.id}>
                  {coin.symbol} — {coin.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor="trade-quantity" className="label-upper" style={{ color: "#4b5563", fontSize: 10 }}>
                Quantity
              </label>
              {type === "sell" && selectedCoin && (
                <span className="text-[10px]" style={{ color: "#6b7280" }}>
                  Available: {availableHoldings.toFixed(8)} {selectedCoin.symbol}
                </span>
              )}
            </div>
            <input
              id="trade-quantity"
              type="number"
              min="0"
              step="any"
              placeholder="Quantity"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setFormError(null);
              }}
              className="input-dark"
              required
            />
          </div>

          <div>
            <label htmlFor="trade-price" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
              Price per unit (USD)
            </label>
            <div className="flex gap-2">
              <input
                id="trade-price"
                type="number"
                min="0"
                step="any"
                placeholder="Price per unit (USD)"
                value={price}
                onChange={(event) => {
                  setPrice(event.target.value);
                  setFormError(null);
                }}
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
          </div>

          {selectedCoin && hasValidPreview && (
            <div
              className="rounded-lg p-3"
              style={{
                backgroundColor: "rgba(201,215,227,0.03)",
                border: "1px solid rgba(201,215,227,0.06)",
              }}
            >
              <p className="label-upper mb-1" style={{ color: "#4b5563", fontSize: 10 }}>
                Total {type === "buy" ? "Cost" : "Proceeds"}
              </p>
              <p className="data-mono text-lg" style={{ color: "#c9d7e3" }}>
                ${(numericAmount * numericPrice).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
          )}

          {formError && (
            <p role="alert" className="text-xs" style={{ color: "#ef4444" }}>
              {formError}
            </p>
          )}

          <button type="submit" className="btn-primary w-full mt-2">
            Record {type === "buy" ? "Purchase" : "Sale"}
          </button>
        </form>
      </div>
    </div>
  );
}
