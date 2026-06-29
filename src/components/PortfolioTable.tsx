import type { PortfolioPosition } from "@/types";
import { COINS, formatCurrency, formatPercentage } from "@/data/mockData";
import { TrendingUp, TrendingDown } from "lucide-react";

interface PortfolioTableProps {
  positions: PortfolioPosition[];
}

export default function PortfolioTable({ positions }: PortfolioTableProps) {
  const coinMap = new Map(COINS.map((c) => [c.id, c]));

  if (positions.length === 0) {
    return (
      <div
        className="card-surface rounded-xl p-8 text-center"
        style={{ border: "1px solid rgba(201,215,227,0.06)" }}
      >
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 300,
            fontSize: 14,
            color: "#4b5563",
          }}
        >
          No active positions. Add a trade to get started.
        </p>
      </div>
    );
  }

  return (
    <div
      className="card-surface rounded-xl overflow-hidden"
      style={{ border: "1px solid rgba(201,215,227,0.06)" }}
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr
              style={{ borderBottom: "1px solid rgba(201,215,227,0.08)" }}
            >
              {["Coin", "Holdings", "Avg Price", "Current Price", "Value", "P/L"].map((h) => (
                <th
                  key={h}
                  className="label-upper text-left py-3 px-4"
                  style={{
                    color: "#4b5563",
                    fontSize: 11,
                    letterSpacing: "0.06em",
                    fontWeight: 400,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => {
              const coin = coinMap.get(pos.coinId);
              const isPositive = pos.pl >= 0;
              return (
                <tr
                  key={pos.coinId}
                  className="transition-colors"
                  style={{
                    borderBottom: "1px solid rgba(201,215,227,0.04)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(201,215,227,0.02)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                  }}
                >
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: coin?.color || "#cc9258" }}
                      />
                      <div>
                        <span
                          className="data-mono text-sm"
                          style={{ color: "#c9d7e3", fontWeight: 400 }}
                        >
                          {coin?.symbol || pos.coinId.toUpperCase()}
                        </span>
                        <p
                          style={{
                            fontFamily: "'DM Sans', sans-serif",
                            fontWeight: 300,
                            fontSize: 12,
                            color: "#4b5563",
                          }}
                        >
                          {coin?.name || pos.coinId}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4 data-mono text-sm" style={{ color: "#c9d7e3" }}>
                    {pos.holdings.toFixed(4)}
                  </td>
                  <td className="py-4 px-4 data-mono text-sm" style={{ color: "#c9d7e3" }}>
                    {formatCurrency(pos.avgPrice)}
                  </td>
                  <td className="py-4 px-4 data-mono text-sm" style={{ color: "#c9d7e3" }}>
                    {formatCurrency(pos.currentPrice)}
                  </td>
                  <td className="py-4 px-4 data-mono text-sm" style={{ color: "#c9d7e3" }}>
                    {formatCurrency(pos.currentValue)}
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-1">
                      {isPositive ? (
                        <TrendingUp size={12} style={{ color: "#22c55e" }} />
                      ) : (
                        <TrendingDown size={12} style={{ color: "#ef4444" }} />
                      )}
                      <span
                        className="data-mono text-sm"
                        style={{ color: isPositive ? "#22c55e" : "#ef4444" }}
                      >
                        {formatPercentage(pos.plPercent)}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
