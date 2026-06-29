import { useState, type FormEvent } from "react";
import { BarChart3, History, Play, Trash2 } from "lucide-react";
import { MOCK_BACKTEST_PERIODS, type MockBacktestPeriod } from "@/data/mockHistoricalData";
import { COINS } from "@/data/mockData";
import {
  clearBacktestHistory,
  loadBacktestHistory,
  MAX_BACKTEST_HISTORY,
  runPaperBacktest,
  saveBacktestHistory,
  type BacktestCoinId,
  type BacktestRun,
} from "@/lib/paperBacktestEngine";
import type { PaperSignalLabel } from "@/lib/paperSignalEngine";

const SIGNAL_COLORS: Record<PaperSignalLabel, string> = {
  BUY: "#22c55e",
  SELL: "#ef4444",
  HOLD: "#c9d7e3",
  AVOID: "#f59e0b",
};

function formatMoney(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPrice(value: number | undefined): string {
  if (value === undefined) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 10 ? 4 : 2,
    maximumFractionDigits: value < 10 ? 4 : 2,
  });
}

function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatRunTime(timestamp: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

interface MetricCardProps {
  label: string;
  value: string;
  color?: string;
}

function MetricCard({ label, value, color = "#c9d7e3" }: MetricCardProps) {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        backgroundColor: "rgba(201,215,227,0.02)",
        border: "1px solid rgba(201,215,227,0.05)",
      }}
    >
      <p className="label-upper" style={{ color: "#4b5563", fontSize: 9 }}>
        {label}
      </p>
      <p className="data-mono mt-2 text-lg" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

export default function BacktestEngine() {
  const [startingBalance, setStartingBalance] = useState("10000");
  const [tradeSizePercent, setTradeSizePercent] = useState("25");
  const [coinId, setCoinId] = useState<BacktestCoinId>("all");
  const [period, setPeriod] = useState<MockBacktestPeriod>(90);
  const [history, setHistory] = useState<BacktestRun[]>(loadBacktestHistory);
  const [activeRun, setActiveRun] = useState<BacktestRun | null>(() => history[0] ?? null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const result = runPaperBacktest({
      startingBalance: Number(startingBalance),
      tradeSizePercent: Number(tradeSizePercent),
      coinId,
      period,
    });

    if (result.ok === false) {
      setActiveRun(null);
      setError(result.message);
      return;
    }

    const nextHistory = [result.value, ...history].slice(0, MAX_BACKTEST_HISTORY);
    setActiveRun(result.value);
    setHistory(nextHistory);

    if (!saveBacktestHistory(nextHistory)) {
      setError("Backtest completed, but the result could not be saved in this browser.");
    }
  };

  const handleClear = () => {
    if (!window.confirm("Clear all browser-local backtest history?")) return;

    setHistory([]);
    setActiveRun(null);
    setError(
      clearBacktestHistory()
        ? null
        : "Backtest history was cleared for this session, but browser storage could not be updated.",
    );
  };

  const metrics = activeRun?.metrics;
  const returnColor = metrics && metrics.simulatedReturnPercent >= 0 ? "#22c55e" : "#ef4444";

  return (
    <section
      className="card-surface mt-8 rounded-xl p-5 lg:p-6"
      style={{ border: "1px solid rgba(201,215,227,0.06)" }}
      aria-labelledby="backtest-engine-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <BarChart3 size={16} style={{ color: "#cc9258" }} />
            <h3 id="backtest-engine-title" className="section-title" style={{ fontSize: 22 }}>
              Backtest Engine
            </h3>
          </div>
          <p className="text-xs" style={{ color: "#6b7280" }}>
            Local paper strategy simulation using deterministic mock prices
          </p>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.08em]"
          style={{ color: "#cc9258", border: "1px solid rgba(204,146,88,0.24)" }}
        >
          Mock / Local
        </span>
      </div>

      <div
        className="mt-5 rounded-lg p-4"
        style={{
          backgroundColor: "rgba(201,215,227,0.02)",
          border: "1px solid rgba(201,215,227,0.05)",
        }}
      >
        <p className="text-xs" style={{ color: "#9ca3af" }}>
          Backtest uses mock/local historical data only.
        </p>
        <p className="mt-1 text-xs" style={{ color: "#6b7280" }}>
          Past simulated performance does not predict future results.
        </p>
        <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>
          For tracking only. Not financial advice.
        </p>
      </div>

      <form onSubmit={handleRun} className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <label htmlFor="backtest-balance" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
            Starting Balance
          </label>
          <input
            id="backtest-balance"
            type="number"
            min="100"
            max="1000000000"
            step="100"
            value={startingBalance}
            onChange={(event) => setStartingBalance(event.target.value)}
            className="input-dark"
            required
          />
        </div>

        <div>
          <label htmlFor="backtest-size" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
            Trade Size (%)
          </label>
          <input
            id="backtest-size"
            type="number"
            min="1"
            max="100"
            step="1"
            value={tradeSizePercent}
            onChange={(event) => setTradeSizePercent(event.target.value)}
            className="input-dark"
            required
          />
        </div>

        <div>
          <label htmlFor="backtest-coin" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
            Coin
          </label>
          <select
            id="backtest-coin"
            value={coinId}
            onChange={(event) => setCoinId(event.target.value as BacktestCoinId)}
            className="input-dark cursor-pointer"
          >
            <option value="all">All supported coins</option>
            {COINS.map((coin) => (
              <option key={coin.id} value={coin.id}>{coin.symbol} — {coin.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="backtest-period" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
            Mock Period
          </label>
          <select
            id="backtest-period"
            value={period}
            onChange={(event) => setPeriod(Number(event.target.value) as MockBacktestPeriod)}
            className="input-dark cursor-pointer"
          >
            {MOCK_BACKTEST_PERIODS.map((days) => (
              <option key={days} value={days}>{days} days</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-3 md:col-span-2 xl:col-span-4">
          <button type="submit" className="btn-accent flex items-center gap-2">
            <Play size={14} />
            Run Backtest
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="btn-danger flex items-center gap-2"
            disabled={history.length === 0}
          >
            <Trash2 size={14} />
            Clear Backtest History
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="mt-4 text-xs" style={{ color: "#ef4444" }}>
          {error}
        </p>
      )}

      {!activeRun || !metrics ? (
        <div
          className="mt-6 rounded-lg p-7 text-center"
          style={{ border: "1px dashed rgba(201,215,227,0.1)" }}
        >
          <p className="text-sm" style={{ color: "#9ca3af" }}>
            No backtest result yet.
          </p>
          <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>
            Choose a supported mock-data configuration and run a local simulation.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-7 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="label-upper" style={{ color: "#4b5563", fontSize: 10 }}>
                Latest Result
              </p>
              <p className="mt-1 text-xs" style={{ color: "#6b7280" }}>
                {activeRun.periodStart} to {activeRun.periodEnd} · {activeRun.config.coinId === "all" ? "All coins" : activeRun.config.coinId.toUpperCase()}
              </p>
            </div>
            <time className="text-[10px]" style={{ color: "#4b5563" }} dateTime={activeRun.createdAt}>
              {formatRunTime(activeRun.createdAt)}
            </time>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard label="Simulated Trades" value={metrics.totalTrades.toString()} />
            <MetricCard label="Win Rate" value={`${metrics.winRate.toFixed(2)}%`} />
            <MetricCard label="Average Win" value={formatMoney(metrics.averageWin)} color="#22c55e" />
            <MetricCard label="Average Loss" value={formatMoney(metrics.averageLoss)} color="#ef4444" />
            <MetricCard
              label="Profit Factor"
              value={metrics.totalTrades === 0 ? "—" : metrics.profitFactor === null ? "∞" : metrics.profitFactor.toFixed(2)}
            />
            <MetricCard label="Max Drawdown" value={`${metrics.maxDrawdown.toFixed(2)}%`} color="#f59e0b" />
            <MetricCard label="Simulated Return" value={formatPercent(metrics.simulatedReturnPercent)} color={returnColor} />
            <MetricCard label="Final Equity" value={formatMoney(metrics.finalEquity)} color={returnColor} />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {(Object.entries(activeRun.signalCounts) as [PaperSignalLabel, number][]).map(([label, count]) => (
              <span
                key={label}
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em]"
                style={{ color: SIGNAL_COLORS[label], border: `1px solid ${SIGNAL_COLORS[label]}40` }}
              >
                {label} · {count}
              </span>
            ))}
          </div>

          <div className="mt-7">
            <h4 className="section-title mb-1" style={{ fontSize: 18 }}>Simulation Results</h4>
            <p className="text-xs" style={{ color: "#4b5563" }}>
              {activeRun.events.length} mock signal observations
            </p>
          </div>

          {activeRun.events.length === 0 ? (
            <div className="mt-4 rounded-lg p-6 text-center" style={{ border: "1px dashed rgba(201,215,227,0.1)" }}>
              <p className="text-sm" style={{ color: "#9ca3af" }}>
                No mock historical data exists for this result.
              </p>
            </div>
          ) : (
            <div className="mt-4 overflow-auto rounded-lg" style={{ maxHeight: 560, border: "1px solid rgba(201,215,227,0.05)" }}>
              <table className="w-full min-w-[980px] border-collapse text-left">
                <thead className="sticky top-0" style={{ backgroundColor: "#090d13" }}>
                  <tr>
                    {["Date", "Coin", "Signal", "Entry", "Exit", "Simulated P/L", "Reason"].map((heading) => (
                      <th key={heading} className="px-4 py-3 label-upper" style={{ color: "#4b5563", fontSize: 9 }}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeRun.events.map((event) => (
                    <tr key={event.id} style={{ borderTop: "1px solid rgba(201,215,227,0.04)" }}>
                      <td className="px-4 py-3 text-xs" style={{ color: "#6b7280" }}>{event.date}</td>
                      <td className="px-4 py-3 data-mono text-xs" style={{ color: "#9ca3af" }}>{event.symbol}</td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: SIGNAL_COLORS[event.signal] }}>{event.signal}</td>
                      <td className="px-4 py-3 data-mono text-xs" style={{ color: "#9ca3af" }}>{formatPrice(event.entryPrice)}</td>
                      <td className="px-4 py-3 data-mono text-xs" style={{ color: "#9ca3af" }}>{formatPrice(event.exitPrice)}</td>
                      <td
                        className="px-4 py-3 data-mono text-xs"
                        style={{ color: event.pnl === undefined ? "#4b5563" : event.pnl >= 0 ? "#22c55e" : "#ef4444" }}
                      >
                        {event.pnl === undefined ? "—" : formatMoney(event.pnl)}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#6b7280", minWidth: 320, lineHeight: 1.5 }}>
                        {event.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {history.length > 0 && (
        <details className="mt-6" style={{ borderTop: "1px solid rgba(201,215,227,0.05)", paddingTop: 16 }}>
          <summary className="flex cursor-pointer items-center gap-2 text-xs" style={{ color: "#6b7280" }}>
            <History size={13} />
            Saved backtests · {history.length} / {MAX_BACKTEST_HISTORY}
          </summary>
          <div className="mt-3 grid gap-2">
            {history.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => setActiveRun(run)}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-white/[0.03]"
                style={{ border: "1px solid rgba(201,215,227,0.04)" }}
              >
                <span className="text-xs" style={{ color: "#9ca3af" }}>
                  {run.config.coinId === "all" ? "All coins" : run.config.coinId.toUpperCase()} · {run.config.period} days
                </span>
                <span className="data-mono text-xs" style={{ color: run.metrics.simulatedReturnPercent >= 0 ? "#22c55e" : "#ef4444" }}>
                  {formatPercent(run.metrics.simulatedReturnPercent)}
                </span>
                <time className="text-[10px]" style={{ color: "#4b5563" }} dateTime={run.createdAt}>
                  {formatRunTime(run.createdAt)}
                </time>
              </button>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
