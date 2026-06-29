import { RotateCcw, Trash2 } from "lucide-react";
import { COINS, formatCurrency } from "@/data/mockData";
import type { PaperTrade } from "@/types";

interface TradeHistoryTableProps {
  trades: PaperTrade[];
  onDelete: (id: string) => void;
  onClear: () => void;
  onRestore: () => void;
}

function formatTradeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";

  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TradeHistoryTable({
  trades,
  onDelete,
  onClear,
  onRestore,
}: TradeHistoryTableProps) {
  const coinMap = new Map(COINS.map((coin) => [coin.id, coin]));
  const sortedTrades = [...trades].sort(
    (left, right) => Date.parse(right.date) - Date.parse(left.date),
  );

  return (
    <section className="mt-8" aria-labelledby="trade-history-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 id="trade-history-title" className="section-title mb-1" style={{ fontSize: 20 }}>
            Trade History
          </h3>
          <p className="text-xs" style={{ color: "#4b5563" }}>
            Stored locally in this browser
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onRestore}
            className="btn-accent flex items-center gap-1.5"
          >
            <RotateCcw size={12} />
            Restore samples
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={trades.length === 0}
            className="flex items-center gap-1.5 text-xs transition-colors hover:text-[#ef4444] disabled:cursor-default disabled:opacity-40"
            style={{ color: "#6b7280" }}
          >
            <Trash2 size={12} />
            Clear all
          </button>
        </div>
      </div>

      {sortedTrades.length === 0 ? (
        <div
          className="card-surface rounded-xl p-8 text-center"
          style={{ border: "1px solid rgba(201,215,227,0.06)" }}
        >
          <p className="text-sm" style={{ color: "#c9d7e3" }}>
            No paper trades yet.
          </p>
          <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>
            Add a paper trade or restore the sample trades.
          </p>
        </div>
      ) : (
        <div
          className="card-surface rounded-xl overflow-hidden"
          style={{ border: "1px solid rgba(201,215,227,0.06)" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(201,215,227,0.08)" }}>
                  {['Date', 'Type', 'Coin', 'Quantity', 'Price', 'Total', ''].map((heading) => (
                    <th
                      key={heading || "actions"}
                      className="label-upper text-left py-3 px-4"
                      style={{ color: "#4b5563", fontSize: 10, fontWeight: 400 }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedTrades.map((trade) => {
                  const coin = coinMap.get(trade.coinId);
                  const typeColor = trade.type === "buy" ? "#22c55e" : "#ef4444";

                  return (
                    <tr key={trade.id} style={{ borderBottom: "1px solid rgba(201,215,227,0.04)" }}>
                      <td className="py-4 px-4 text-xs whitespace-nowrap" style={{ color: "#6b7280" }}>
                        {formatTradeDate(trade.date)}
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]"
                          style={{ color: typeColor, backgroundColor: `${typeColor}14` }}
                        >
                          {trade.type}
                        </span>
                      </td>
                      <td className="py-4 px-4 data-mono text-sm" style={{ color: "#c9d7e3" }}>
                        {coin?.symbol ?? trade.coinId.toUpperCase()}
                      </td>
                      <td className="py-4 px-4 data-mono text-sm" style={{ color: "#c9d7e3" }}>
                        {trade.amount.toLocaleString("en-US", { maximumFractionDigits: 8 })}
                      </td>
                      <td className="py-4 px-4 data-mono text-sm" style={{ color: "#c9d7e3" }}>
                        {formatCurrency(trade.price)}
                      </td>
                      <td className="py-4 px-4 data-mono text-sm" style={{ color: "#c9d7e3" }}>
                        {formatCurrency(trade.amount * trade.price)}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => onDelete(trade.id)}
                          aria-label={`Delete ${trade.type} ${coin?.symbol ?? trade.coinId.toUpperCase()} trade`}
                          className="p-1 transition-colors hover:text-[#ef4444]"
                          style={{ color: "#4b5563" }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
