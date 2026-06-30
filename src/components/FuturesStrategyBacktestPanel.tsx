import { useState, type FormEvent } from "react";
import { AlertTriangle, FlaskConical, History, Play, Trash2 } from "lucide-react";
import {
  SUPPORTED_FUTURES_LEVERAGE,
  SUPPORTED_FUTURES_SYMBOLS,
  SUPPORTED_FUTURES_TEST_SCENARIOS,
  loadFuturesPaperSettings,
  type FuturesLeverage,
  type FuturesSymbol,
  type FuturesTestScenario,
} from "@/lib/futuresPaperEngine";
import { loadPaperRiskSettings } from "@/lib/paperRiskController";
import {
  DEFAULT_FUTURES_STRATEGY_BACKTEST_CONFIG,
  FUTURES_BACKTEST_PROFILES,
  MAX_FUTURES_STRATEGY_BACKTEST_HISTORY,
  clearFuturesStrategyBacktestHistory,
  loadFuturesStrategyBacktestHistory,
  runFuturesStrategyBacktest,
  saveFuturesStrategyBacktestHistory,
  type FuturesBacktestProfile,
  type FuturesStrategyBacktestRun,
} from "@/lib/futuresStrategyBacktest";

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
      <p className="label-upper" style={{ color: "#4b5563", fontSize: 9 }}>{label}</p>
      <p className="data-mono mt-2 text-lg" style={{ color }}>{value}</p>
    </div>
  );
}

function formatMoney(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPrice(value: number | null): string {
  if (value === null) return "—";
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

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function interpretationColor(value: string): string {
  if (value === "Positive test") return "#22c55e";
  if (value === "Weak test" || value === "Too few trades" || value === "No actionable setup") {
    return "#f59e0b";
  }
  return "#ef4444";
}

function exitReasonColor(value: string): string {
  if (value === "TAKE_PROFIT") return "#22c55e";
  if (value === "STOP_LOSS" || value === "RISK_BLOCKED") return "#ef4444";
  if (value === "WAIT") return "#6b7280";
  return "#f59e0b";
}

export default function FuturesStrategyBacktestPanel() {
  const [profile, setProfile] = useState<FuturesBacktestProfile>(
    DEFAULT_FUTURES_STRATEGY_BACKTEST_CONFIG.profile,
  );
  const [scenario, setScenario] = useState<FuturesTestScenario>(
    DEFAULT_FUTURES_STRATEGY_BACKTEST_CONFIG.scenario,
  );
  const [symbol, setSymbol] = useState<FuturesSymbol>(
    DEFAULT_FUTURES_STRATEGY_BACKTEST_CONFIG.symbol,
  );
  const [startingBalance, setStartingBalance] = useState(
    String(DEFAULT_FUTURES_STRATEGY_BACKTEST_CONFIG.startingBalance),
  );
  const [marginPerTrade, setMarginPerTrade] = useState(
    String(DEFAULT_FUTURES_STRATEGY_BACKTEST_CONFIG.marginPerTrade),
  );
  const [leverage, setLeverage] = useState<FuturesLeverage>(
    DEFAULT_FUTURES_STRATEGY_BACKTEST_CONFIG.leverage,
  );
  const [feePercent, setFeePercent] = useState(
    String(DEFAULT_FUTURES_STRATEGY_BACKTEST_CONFIG.feePercent),
  );
  const [slippagePercent, setSlippagePercent] = useState(
    String(DEFAULT_FUTURES_STRATEGY_BACKTEST_CONFIG.slippagePercent),
  );
  const [history, setHistory] = useState<FuturesStrategyBacktestRun[]>(
    loadFuturesStrategyBacktestHistory,
  );
  const [activeRun, setActiveRun] = useState<FuturesStrategyBacktestRun | null>(
    () => history[0] ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  const handleRun = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const result = runFuturesStrategyBacktest({
      profile,
      scenario,
      symbol,
      startingBalance: Number(startingBalance),
      marginPerTrade: Number(marginPerTrade),
      leverage,
      feePercent: Number(feePercent),
      slippagePercent: Number(slippagePercent),
      riskSettings: loadPaperRiskSettings(),
      maxDailyLossPercent: loadFuturesPaperSettings().maxDailyLossPercent,
    });

    if (result.ok === false) {
      setError(result.message);
      return;
    }

    const nextHistory = [
      result.value,
      ...history.filter((run) => run.id !== result.value.id),
    ].slice(0, MAX_FUTURES_STRATEGY_BACKTEST_HISTORY);
    setActiveRun(result.value);
    setHistory(nextHistory);
    if (!saveFuturesStrategyBacktestHistory(nextHistory)) {
      setError("Backtest completed, but the result could not be saved in this browser.");
    }
  };

  const handleClear = () => {
    if (!window.confirm("Clear all browser-local futures strategy backtest history?")) return;
    setHistory([]);
    setActiveRun(null);
    setError(
      clearFuturesStrategyBacktestHistory()
        ? null
        : "History was cleared for this session, but browser storage could not be updated.",
    );
  };

  const metrics = activeRun?.metrics;
  const resultColor = metrics && metrics.netPnl >= 0 ? "#22c55e" : "#ef4444";

  return (
    <section
      className="card-surface mt-8 rounded-xl p-5 lg:p-6"
      style={{ border: "1px solid rgba(201,215,227,0.06)" }}
      aria-labelledby="futures-strategy-backtest-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <FlaskConical size={16} style={{ color: "#cc9258" }} />
            <h3 id="futures-strategy-backtest-title" className="section-title" style={{ fontSize: 22 }}>
              15m Futures Strategy Backtest
            </h3>
          </div>
          <p className="text-xs" style={{ color: "#6b7280" }}>
            Command Center validation layer — local/mock only
          </p>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.08em]"
          style={{ color: "#cc9258", border: "1px solid rgba(204,146,88,0.24)" }}
        >
          Deterministic 15m lab
        </span>
      </div>

      <div
        className="mt-5 rounded-lg p-4"
        style={{
          backgroundColor: "rgba(201,215,227,0.02)",
          border: "1px solid rgba(201,215,227,0.05)",
        }}
      >
        <p className="text-xs" style={{ color: "#9ca3af" }}>Command Center validation layer.</p>
        <p className="mt-1 text-xs" style={{ color: "#6b7280" }}>Backtests use local/mock 15m data only.</p>
        <p className="mt-1 text-xs" style={{ color: "#6b7280" }}>Fees and slippage are estimates.</p>
        <p className="mt-1 text-xs" style={{ color: "#6b7280" }}>Past simulated behavior does not predict future results.</p>
        <p className="mt-1 text-xs" style={{ color: "#6b7280" }}>No real orders are placed.</p>
        <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>For tracking only. Not financial advice.</p>
      </div>

      <form onSubmit={handleRun} className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <label htmlFor="futures-backtest-profile" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
            Strategy profile
          </label>
          <select
            id="futures-backtest-profile"
            value={profile}
            onChange={(event) => setProfile(event.target.value as FuturesBacktestProfile)}
            className="input-dark cursor-pointer"
          >
            {FUTURES_BACKTEST_PROFILES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="futures-backtest-scenario" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
            Strategy scenario
          </label>
          <select
            id="futures-backtest-scenario"
            value={scenario}
            onChange={(event) => setScenario(event.target.value as FuturesTestScenario)}
            className="input-dark cursor-pointer"
          >
            {SUPPORTED_FUTURES_TEST_SCENARIOS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="futures-backtest-symbol" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
            Symbol
          </label>
          <select
            id="futures-backtest-symbol"
            value={symbol}
            onChange={(event) => setSymbol(event.target.value as FuturesSymbol)}
            className="input-dark cursor-pointer"
          >
            {SUPPORTED_FUTURES_SYMBOLS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="futures-backtest-leverage" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
            Leverage
          </label>
          <select
            id="futures-backtest-leverage"
            value={leverage}
            onChange={(event) => setLeverage(Number(event.target.value) as FuturesLeverage)}
            className="input-dark cursor-pointer"
          >
            {SUPPORTED_FUTURES_LEVERAGE.map((item) => <option key={item} value={item}>{item}x</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="futures-backtest-balance" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
            Starting balance
          </label>
          <input id="futures-backtest-balance" type="number" min="1" step="100" value={startingBalance} onChange={(event) => setStartingBalance(event.target.value)} className="input-dark" required />
        </div>

        <div>
          <label htmlFor="futures-backtest-margin" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
            Margin per trade
          </label>
          <input id="futures-backtest-margin" type="number" min="0.01" step="10" value={marginPerTrade} onChange={(event) => setMarginPerTrade(event.target.value)} className="input-dark" required />
        </div>

        <div>
          <label htmlFor="futures-backtest-fee" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
            Fee assumption (%)
          </label>
          <input id="futures-backtest-fee" type="number" min="0" max="10" step="0.01" value={feePercent} onChange={(event) => setFeePercent(event.target.value)} className="input-dark" required />
        </div>

        <div>
          <label htmlFor="futures-backtest-slippage" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
            Slippage assumption (%)
          </label>
          <input id="futures-backtest-slippage" type="number" min="0" max="10" step="0.01" value={slippagePercent} onChange={(event) => setSlippagePercent(event.target.value)} className="input-dark" required />
        </div>

        {leverage === 5 && (
          <div
            className="flex items-start gap-2 rounded-lg p-3 md:col-span-2 xl:col-span-4"
            style={{ color: "#f59e0b", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.16)" }}
            role="status"
          >
            <AlertTriangle className="mt-0.5 shrink-0" size={14} />
            <p className="text-xs leading-5">5x is a high-risk paper assumption and remains subject to liquidation-distance, allocation, trade-size, and daily-loss gates.</p>
          </div>
        )}

        <div className="flex flex-wrap gap-3 md:col-span-2 xl:col-span-4">
          <button type="submit" className="btn-accent flex items-center gap-2">
            <Play size={14} />
            Run strategy backtest
          </button>
          <button type="button" onClick={handleClear} className="btn-danger flex items-center gap-2" disabled={history.length === 0}>
            <Trash2 size={14} />
            Clear futures strategy backtest history
          </button>
        </div>
      </form>

      {error && <p role="alert" className="mt-4 text-xs" style={{ color: "#ef4444" }}>{error}</p>}

      {!activeRun || !metrics ? (
        <div className="mt-6 rounded-lg p-7 text-center" style={{ border: "1px dashed rgba(201,215,227,0.1)" }}>
          <p className="text-sm" style={{ color: "#9ca3af" }}>No futures strategy validation result yet.</p>
          <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>Run a deterministic profile/scenario sample to inspect setup and risk behavior.</p>
        </div>
      ) : (
        <>
          <div className="mt-7 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="label-upper" style={{ color: "#4b5563", fontSize: 10 }}>Latest validation result</p>
              <p className="mt-1 text-xs" style={{ color: "#6b7280" }}>
                {activeRun.config.profile} · {activeRun.config.scenario} · {activeRun.config.symbol}
              </p>
            </div>
            <span
              className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.08em]"
              style={{
                color: interpretationColor(activeRun.interpretation),
                border: `1px solid ${interpretationColor(activeRun.interpretation)}40`,
              }}
            >
              {activeRun.interpretation}
            </span>
          </div>
          <p className="mt-2 text-[10px]" style={{ color: "#4b5563" }}>
            Interpretation is descriptive validation status only, not a recommendation.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <MetricCard label="Setups evaluated" value={String(metrics.totalSetupsEvaluated)} />
            <MetricCard label="Trades taken" value={String(metrics.tradesTaken)} />
            <MetricCard label="WAIT count" value={String(metrics.waitCount)} />
            <MetricCard label="Risk blocked" value={String(metrics.riskBlockedCount)} color={metrics.riskBlockedCount > 0 ? "#ef4444" : "#c9d7e3"} />
            <MetricCard label="Win rate" value={`${metrics.winRate.toFixed(2)}%`} />
            <MetricCard label="Gross P/L" value={formatMoney(metrics.grossPnl)} color={metrics.grossPnl >= 0 ? "#22c55e" : "#ef4444"} />
            <MetricCard label="Net P/L" value={formatMoney(metrics.netPnl)} color={resultColor} />
            <MetricCard label="Fees + slippage" value={formatMoney(metrics.totalFeesAndSlippage)} color="#f59e0b" />
            <MetricCard label="Max drawdown" value={`${metrics.maxDrawdown.toFixed(2)}%`} color="#f59e0b" />
            <MetricCard label="Profit factor" value={metrics.profitFactor === null ? "∞" : metrics.profitFactor.toFixed(2)} />
            <MetricCard label="Average win" value={formatMoney(metrics.averageWin)} color="#22c55e" />
            <MetricCard label="Average loss" value={formatMoney(metrics.averageLoss)} color="#ef4444" />
            <MetricCard label="Best trade" value={formatMoney(metrics.bestTrade)} color={metrics.bestTrade >= 0 ? "#22c55e" : "#ef4444"} />
            <MetricCard label="Worst trade" value={formatMoney(metrics.worstTrade)} color={metrics.worstTrade >= 0 ? "#22c55e" : "#ef4444"} />
            <MetricCard label="Ending balance" value={formatMoney(metrics.endingBalance)} color={resultColor} />
            <MetricCard label="Return" value={formatPercent(metrics.returnPercent)} color={resultColor} />
            <MetricCard label="Average risk/reward" value={metrics.averageRiskReward.toFixed(2)} />
            <MetricCard label="Win / loss streak" value={`${metrics.largestWinningStreak} / ${metrics.largestLosingStreak}`} />
          </div>

          <div className="mt-7">
            <h4 className="section-title mb-1" style={{ fontSize: 18 }}>Traceable candidate results</h4>
            <p className="text-xs" style={{ color: "#4b5563" }}>
              Every evaluated setup is recorded as taken, blocked, or ignored.
            </p>
          </div>

          <div className="mt-4 overflow-auto rounded-lg" style={{ maxHeight: 620, border: "1px solid rgba(201,215,227,0.05)" }}>
            <table className="w-full min-w-[1900px] border-collapse text-left">
              <thead className="sticky top-0" style={{ backgroundColor: "#090d13" }}>
                <tr>
                  {[
                    "Date / time", "Symbol", "Profile", "Scenario", "Direction", "Status",
                    "Entry", "Exit", "Leverage", "Margin", "Exit reason", "Gross P/L",
                    "Fees / slippage", "Net P/L", "Drawdown", "Setup reason",
                  ].map((heading) => (
                    <th key={heading} className="px-4 py-3 label-upper" style={{ color: "#4b5563", fontSize: 9 }}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeRun.events.map((event) => (
                  <tr key={event.id} style={{ borderTop: "1px solid rgba(201,215,227,0.04)" }}>
                    <td className="px-4 py-3 text-xs" style={{ color: "#6b7280" }}>{formatTimestamp(event.timestamp)}</td>
                    <td className="px-4 py-3 data-mono text-xs" style={{ color: "#9ca3af" }}>{event.symbol}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#9ca3af" }}>{event.profile}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#9ca3af" }}>{event.scenario}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: event.direction === "LONG" ? "#22c55e" : event.direction === "SHORT" ? "#ef4444" : "#6b7280" }}>{event.direction}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#9ca3af" }}>{event.candidateStatus}</td>
                    <td className="px-4 py-3 data-mono text-xs" style={{ color: "#9ca3af" }}>{formatPrice(event.entryPrice)}</td>
                    <td className="px-4 py-3 data-mono text-xs" style={{ color: "#9ca3af" }}>{formatPrice(event.exitPrice)}</td>
                    <td className="px-4 py-3 data-mono text-xs" style={{ color: "#9ca3af" }}>{event.leverage}x</td>
                    <td className="px-4 py-3 data-mono text-xs" style={{ color: "#9ca3af" }}>{formatMoney(event.marginAmount)}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: exitReasonColor(event.exitReason) }}>{event.exitReason}</td>
                    <td className="px-4 py-3 data-mono text-xs" style={{ color: event.grossPnl >= 0 ? "#22c55e" : "#ef4444" }}>{formatMoney(event.grossPnl)}</td>
                    <td className="px-4 py-3 data-mono text-xs" style={{ color: "#f59e0b" }}>{formatMoney(event.feesAndSlippage)}</td>
                    <td className="px-4 py-3 data-mono text-xs" style={{ color: event.netPnl >= 0 ? "#22c55e" : "#ef4444" }}>{formatMoney(event.netPnl)}</td>
                    <td className="px-4 py-3 data-mono text-xs" style={{ color: "#9ca3af" }}>{event.drawdownAfterTrade.toFixed(2)}%</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#6b7280", minWidth: 360, lineHeight: 1.5 }}>
                      {event.setupReason}
                      <span className="mt-1 block" style={{ color: "#4b5563" }}>{event.decisionReason}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {history.length > 0 && (
        <details className="mt-6" style={{ borderTop: "1px solid rgba(201,215,227,0.05)", paddingTop: 16 }}>
          <summary className="flex cursor-pointer items-center gap-2 text-xs" style={{ color: "#6b7280" }}>
            <History size={13} />
            Saved futures strategy backtests · {history.length} / {MAX_FUTURES_STRATEGY_BACKTEST_HISTORY}
          </summary>
          <div className="mt-3 grid gap-2">
            {history.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => setActiveRun(run)}
                className="grid gap-2 rounded-md px-3 py-3 text-left transition-colors hover:bg-white/[0.03] sm:grid-cols-[1fr_auto_auto] sm:items-center"
                style={{ border: "1px solid rgba(201,215,227,0.04)" }}
              >
                <span className="text-xs" style={{ color: "#9ca3af" }}>
                  {run.config.profile} · {run.config.scenario} · {run.config.symbol}
                </span>
                <span className="data-mono text-xs" style={{ color: run.metrics.netPnl >= 0 ? "#22c55e" : "#ef4444" }}>
                  {formatMoney(run.metrics.netPnl)}
                </span>
                <span className="text-[10px]" style={{ color: "#4b5563" }}>{run.interpretation}</span>
              </button>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
