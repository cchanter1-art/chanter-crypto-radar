import type { Coin } from "@/types";
import { formatCurrency, formatPercentage } from "@/data/mockData";
import { TrendingUp, TrendingDown } from "lucide-react";
import Sparkline from "./Sparkline";

interface CoinCardProps {
  coin: Coin;
  onRemove?: (id: string) => void;
}

export default function CoinCard({ coin, onRemove }: CoinCardProps) {
  const isPositive = coin.change24h >= 0;

  return (
    <div
      className="card-surface rounded-xl p-6 transition-all duration-300"
      style={{
        border: "1px solid rgba(201,215,227,0.06)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(204,146,88,0.3)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(201,215,227,0.06)";
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <span
          className="data-mono text-lg"
          style={{ color: "#c9d7e3", fontWeight: 400 }}
        >
          {coin.symbol}
        </span>
        <span
          className="data-mono text-base"
          style={{ color: "#c9d7e3", fontWeight: 400 }}
        >
          {formatCurrency(coin.price)}
        </span>
      </div>

      <div className="flex items-center justify-between mb-4">
        <span
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 300,
            fontSize: 13,
            color: "#4b5563",
          }}
        >
          {coin.name}
        </span>
        <span
          className="data-mono flex items-center gap-1"
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: isPositive ? "#22c55e" : "#ef4444",
          }}
        >
          {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {formatPercentage(coin.change24h)}
        </span>
      </div>

      <Sparkline data={coin.sparkline} color={isPositive ? "#22c55e" : "#ef4444"} height={40} />

      {onRemove && (
        <button
          onClick={() => onRemove(coin.id)}
          className="mt-3 text-xs transition-colors hover:text-[#ef4444]"
          style={{
            color: "#4b5563",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 400,
            letterSpacing: "0.04em",
          }}
        >
          Remove
        </button>
      )}
    </div>
  );
}
