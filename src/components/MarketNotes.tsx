import type { ReactNode } from "react";
import {
  Activity,
  Database,
  PieChart,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useAppState, usePortfolio } from "@/context/AppContext";
import { formatCurrency, formatPercentage } from "@/data/mockData";

interface MarketNotesProps {
  className?: string;
}

interface MarketNote {
  id: string;
  title: string;
  body: string;
  icon: ReactNode;
  color: string;
}

const CONCENTRATION_WARNING_PERCENT = 50;

export default function MarketNotes({ className = "" }: MarketNotesProps) {
  const { state, coins, priceStatus } = useAppState();
  const { positions, totalValue, totalPL, totalPLPercent } = usePortfolio();

  const watchlistCoins = coins.filter((coin) => state.watchlist.includes(coin.id));
  const rankedWatchlist = [...watchlistCoins].sort(
    (left, right) => right.change24h - left.change24h,
  );
  const biggestGainer = rankedWatchlist[0];
  const biggestLoser = rankedWatchlist[rankedWatchlist.length - 1];

  const largestPosition = positions.reduce(
    (largest, position) =>
      !largest || position.currentValue > largest.currentValue ? position : largest,
    positions[0],
  );
  const largestPositionCoin = largestPosition
    ? coins.find((coin) => coin.id === largestPosition.coinId)
    : undefined;
  const concentrationPercent = largestPosition && totalValue > 0
    ? (largestPosition.currentValue / totalValue) * 100
    : 0;
  const hasConcentrationWarning = concentrationPercent >= CONCENTRATION_WARNING_PERCENT;

  const notes: MarketNote[] = [
    {
      id: "gainer",
      title: "Biggest watchlist gainer",
      body: biggestGainer
        ? `${biggestGainer.symbol} has the highest 24-hour change in your watchlist at ${formatPercentage(biggestGainer.change24h)}.`
        : "Add coins to the watchlist to compare 24-hour gains.",
      icon: <TrendingUp size={14} />,
      color: "#22c55e",
    },
    {
      id: "loser",
      title: "Biggest watchlist loser",
      body: biggestLoser
        ? `${biggestLoser.symbol} has the lowest 24-hour change in your watchlist at ${formatPercentage(biggestLoser.change24h)}.`
        : "Add coins to the watchlist to compare 24-hour losses.",
      icon: <TrendingDown size={14} />,
      color: "#ef4444",
    },
    {
      id: "concentration",
      title: hasConcentrationWarning ? "Portfolio concentration flag" : "Portfolio concentration",
      body: largestPosition
        ? `${largestPositionCoin?.symbol ?? largestPosition.coinId.toUpperCase()} represents ${concentrationPercent.toFixed(1)}% of the current paper-portfolio value${hasConcentrationWarning ? ", above the 50% tracking threshold." : "."}`
        : "No active paper positions are available for concentration tracking.",
      icon: <PieChart size={14} />,
      color: hasConcentrationWarning ? "#f59e0b" : "#6b7280",
    },
    {
      id: "performance",
      title: "Unrealized paper P/L",
      body: totalValue > 0
        ? `The paper portfolio currently shows an unrealized ${totalPL >= 0 ? "gain" : "loss"} of ${formatCurrency(Math.abs(totalPL))} (${Math.abs(totalPLPercent).toFixed(2)}%).`
        : "No active paper positions are available for unrealized P/L tracking.",
      icon: <Activity size={14} />,
      color: totalPL >= 0 ? "#22c55e" : "#ef4444",
    },
  ];

  if (priceStatus !== "live") {
    notes.push({
      id: "price-source",
      title: priceStatus === "fallback" ? "Price data may be stale" : "Price refresh in progress",
      body: priceStatus === "fallback"
        ? "Live prices are unavailable. Market notes currently use mock fallback values and may be stale."
        : "Live prices are refreshing. Market notes will update after a successful response.",
      icon: <Database size={14} />,
      color: "#f59e0b",
    });
  }

  const sourceLabel = priceStatus === "live"
    ? "Live data"
    : priceStatus === "fallback"
      ? "Fallback data"
      : "Refreshing";

  return (
    <section
      className={`card-surface rounded-xl p-5 lg:p-6 ${className}`}
      style={{ border: "1px solid rgba(201,215,227,0.06)" }}
      aria-labelledby="market-notes-title"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 id="market-notes-title" className="section-title mb-1" style={{ fontSize: 22 }}>
            Market Notes
          </h3>
          <p className="text-xs" style={{ color: "#6b7280" }}>
            Local rule-based notes
          </p>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.08em]"
          style={{
            color: priceStatus === "fallback" ? "#f59e0b" : "#6b7280",
            border: "1px solid rgba(201,215,227,0.08)",
          }}
        >
          {sourceLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {notes.map((note) => (
          <div
            key={note.id}
            className="rounded-lg p-4"
            style={{
              backgroundColor: "rgba(201,215,227,0.02)",
              border: "1px solid rgba(201,215,227,0.05)",
            }}
          >
            <div className="mb-2 flex items-center gap-2">
              <span style={{ color: note.color }}>{note.icon}</span>
              <h4 className="label-upper" style={{ color: "#6b7280", fontSize: 10 }}>
                {note.title}
              </h4>
            </div>
            <p
              className="text-sm"
              style={{
                color: "#9ca3af",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 300,
                lineHeight: 1.6,
              }}
            >
              {note.body}
            </p>
          </div>
        ))}
      </div>

      <p
        className="mt-5 text-xs"
        style={{
          color: "#4b5563",
          borderTop: "1px solid rgba(201,215,227,0.05)",
          paddingTop: 16,
        }}
      >
        For tracking only. Not financial advice.
      </p>
    </section>
  );
}
