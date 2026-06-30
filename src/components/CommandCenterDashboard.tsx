import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock3,
  Database,
  FlaskConical,
  History,
  Layers3,
  Radar,
  ShieldCheck,
} from "lucide-react";
import { useAppState, usePortfolio } from "@/context/AppContext";
import { formatCurrency, formatPercentage } from "@/data/mockData";
import {
  getFuturesMockMarkPrice,
  getFuturesPositionMetrics,
  loadFuturesPaperHistory,
  loadFuturesPaperPositions,
  loadFuturesPaperSettings,
  loadFuturesTestScenario,
} from "@/lib/futuresPaperEngine";
import {
  analyzeLocalTimeframes,
  type LocalTrendState,
  type MomentumState,
  type RsiZone,
} from "@/lib/localMultiTimeframeAnalysis";
import { loadBacktestHistory } from "@/lib/paperBacktestEngine";
import { loadFuturesStrategyBacktestHistory } from "@/lib/futuresStrategyBacktest";
import {
  loadPaperRiskJournal,
  loadPaperRiskSettings,
  type PaperRiskDecisionType,
} from "@/lib/paperRiskController";
import {
  loadPaperSignalHistory,
  loadPaperSignalSensitivity,
  type PaperSignalLabel,
} from "@/lib/paperSignalEngine";

interface SectionCardProps {
  id: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
  badge?: string;
  className?: string;
  children: ReactNode;
}

interface JournalEvent {
  id: string;
  timestamp: string;
  category: string;
  title: string;
  detail: string;
}

interface StorageHealth {
  status: "available" | "unavailable";
  message: string;
}

const SIGNAL_LABELS: PaperSignalLabel[] = ["BUY", "SELL", "HOLD", "AVOID"];
const PRICE_STALE_AFTER_MS = 5 * 60 * 1000;

const sectionStyle = {
  background: "rgba(7, 13, 22, 0.88)",
  border: "1px solid rgba(201, 215, 227, 0.08)",
  boxShadow: "0 18px 60px rgba(0, 0, 0, 0.22)",
};

function SectionCard({
  id,
  title,
  subtitle,
  icon,
  badge,
  className = "",
  children,
}: SectionCardProps) {
  return (
    <section
      className={`rounded-xl p-5 lg:p-6 ${className}`}
      style={sectionStyle}
      aria-labelledby={id}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 rounded-lg p-2"
            style={{ color: "#c9d7e3", background: "rgba(201, 215, 227, 0.05)" }}
            aria-hidden="true"
          >
            {icon}
          </span>
          <div>
            <h2 id={id} className="text-lg font-medium tracking-tight" style={{ color: "#e5e7eb" }}>
              {title}
            </h2>
            <p className="mt-1 text-xs leading-5" style={{ color: "#6b7280" }}>
              {subtitle}
            </p>
          </div>
        </div>
        {badge && <StatusPill value={badge} />}
      </div>
      {children}
    </section>
  );
}

function getStatusColor(value: string): string {
  const normalized = value.toLowerCase();
  if (
    normalized.includes("blocked") ||
    normalized.includes("error") ||
    normalized.includes("stale") ||
    normalized.includes("bearish") ||
    normalized.includes("negative") ||
    normalized.includes("unavailable")
  ) {
    return "#ef4444";
  }
  if (
    normalized.includes("live") ||
    normalized.includes("approved") ||
    normalized.includes("available") ||
    normalized.includes("bullish") ||
    normalized.includes("positive")
  ) {
    return "#22c55e";
  }
  if (
    normalized.includes("fallback") ||
    normalized.includes("wait") ||
    normalized.includes("reduced") ||
    normalized.includes("warning") ||
    normalized.includes("overbought") ||
    normalized.includes("oversold")
  ) {
    return "#f59e0b";
  }
  return "#94a3b8";
}

function StatusPill({ value }: { value: string }) {
  const color = getStatusColor(value);
  return (
    <span
      className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em]"
      style={{ color, border: `1px solid ${color}33`, background: `${color}0d` }}
    >
      {value}
    </span>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "rgba(201, 215, 227, 0.025)", border: "1px solid rgba(201, 215, 227, 0.06)" }}
    >
      <p className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#6b7280" }}>
        {label}
      </p>
      <p className="mt-2 text-sm font-medium" style={{ color: "#d1d5db" }}>
        {value}
      </p>
      {detail && <p className="mt-1 text-xs leading-5" style={{ color: "#6b7280" }}>{detail}</p>}
    </div>
  );
}

function formatTimestamp(value: string | null): string {
  if (!value) return "Not available yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getStorageHealth(): StorageHealth {
  const healthKey = "chanter-storage-health-check";
  try {
    localStorage.setItem(healthKey, "ok");
    localStorage.removeItem(healthKey);
    return { status: "available", message: "Browser-local persistence is available." };
  } catch {
    try {
      localStorage.removeItem(healthKey);
    } catch {
      // Storage is already known to be unavailable.
    }
    return {
      status: "unavailable",
      message: "Browser storage is unavailable. Local histories may not persist.",
    };
  }
}

function trendLabel(value: LocalTrendState): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function indicatorLabel(value: MomentumState | RsiZone): string {
  if (value === "unavailable") return "Unavailable";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getDecisionBadge(decision: PaperRiskDecisionType): string {
  return decision.charAt(0) + decision.slice(1).toLowerCase();
}

export default function CommandCenterDashboard() {
  const { state, coins, priceStatus, priceError, lastPriceUpdate } = useAppState();
  const { positions, totalPLPercent } = usePortfolio();
  const [localSnapshot] = useState(() => ({
    signals: loadPaperSignalHistory(),
    sensitivity: loadPaperSignalSensitivity(),
    riskSettings: loadPaperRiskSettings(),
    riskJournal: loadPaperRiskJournal(),
    backtests: loadBacktestHistory(),
    futuresStrategyBacktests: loadFuturesStrategyBacktestHistory(),
    futuresHistory: loadFuturesPaperHistory(),
    futuresPositions: loadFuturesPaperPositions(),
    futuresSettings: loadFuturesPaperSettings(),
    scenario: loadFuturesTestScenario(),
    storage: getStorageHealth(),
    checkedAt: Date.now(),
  }));

  const watchlistCoins = coins.filter((coin) => state.watchlist.includes(coin.id));
  const lastUpdateTime = lastPriceUpdate ? Date.parse(lastPriceUpdate) : Number.NaN;
  const isPriceStale = priceStatus !== "loading" && Number.isFinite(lastUpdateTime) &&
    localSnapshot.checkedAt - lastUpdateTime > PRICE_STALE_AFTER_MS;
  const priceStateLabel = priceStatus === "live"
    ? "Live"
    : priceStatus === "fallback"
      ? "Mock fallback"
      : "Loading";

  const multiTimeframe = useMemo(
    () => coins
      .map((coin) => analyzeLocalTimeframes(coin.id, coin.symbol, localSnapshot.scenario))
      .filter((analysis) => analysis !== null),
    [coins, localSnapshot.scenario],
  );

  const latestSignalTimestamp = localSnapshot.signals.reduce<string | null>((latest, signal) => {
    if (!latest || Date.parse(signal.timestamp) > Date.parse(latest)) return signal.timestamp;
    return latest;
  }, null);
  const latestSignals = latestSignalTimestamp
    ? localSnapshot.signals.filter((signal) => signal.timestamp === latestSignalTimestamp)
    : [];
  const signalCounts = Object.fromEntries(
    SIGNAL_LABELS.map((label) => [
      label,
      latestSignals.filter((signal) => signal.label === label).length,
    ]),
  ) as Record<PaperSignalLabel, number>;
  const latestFuturesStrategyBacktest = localSnapshot.futuresStrategyBacktests[0] ?? null;
  const bestRecentFuturesStrategyBacktest = localSnapshot.futuresStrategyBacktests.reduce<
    (typeof localSnapshot.futuresStrategyBacktests)[number] | null
  >(
    (best, run) => !best || run.metrics.returnPercent > best.metrics.returnPercent ? run : best,
    null,
  );

  const futuresLiquidationState = localSnapshot.futuresPositions.length === 0
    ? "No open futures positions"
    : localSnapshot.futuresPositions.some((position) => {
        const markPrice = getFuturesMockMarkPrice(position.symbol, position.scenario);
        const metrics = getFuturesPositionMetrics(position, markPrice);
        return Math.abs(markPrice - metrics.liquidationPrice) / markPrice < 0.1;
      })
      ? "Warning: liquidation distance below 10%"
      : "Tracked; no distance warning";

  const journalEvents = useMemo<JournalEvent[]>(() => {
    const coinSymbols = new Map(coins.map((coin) => [coin.id, coin.symbol]));
    const paperTrades: JournalEvent[] = state.trades.map((trade) => ({
      id: `trade-${trade.id}`,
      timestamp: trade.date,
      category: "Paper trade",
      title: `${trade.type.toUpperCase()} ${coinSymbols.get(trade.coinId) ?? trade.coinId.toUpperCase()}`,
      detail: `${trade.amount.toLocaleString()} at ${formatCurrency(trade.price)}`,
    }));
    const signals: JournalEvent[] = localSnapshot.signals.map((signal) => ({
      id: `signal-${signal.id}`,
      timestamp: signal.timestamp,
      category: "Paper signal",
      title: `${signal.label} ${signal.symbol}`,
      detail: `${signal.confidence} confidence · ${signal.reason}`,
    }));
    const backtests: JournalEvent[] = localSnapshot.backtests.map((run) => ({
      id: `backtest-${run.id}`,
      timestamp: run.createdAt,
      category: "Backtest",
      title: `${run.config.coinId === "all" ? "All supported coins" : run.config.coinId.toUpperCase()} simulation`,
      detail: `${run.metrics.totalTrades} trades · ${run.metrics.netReturnPercent.toFixed(2)}% net return`,
    }));
    const futures: JournalEvent[] = localSnapshot.futuresHistory.map((record) => ({
      id: `futures-${record.recordId}`,
      timestamp: record.timestamp,
      category: "Futures paper",
      title: `${record.action} ${record.direction} ${record.symbol}`,
      detail: `${record.leverage}x isolated · ${formatCurrency(record.marginAmount)} margin`,
    }));
    const futuresStrategyBacktests: JournalEvent[] = localSnapshot.futuresStrategyBacktests.map((run) => ({
      id: `futures-strategy-backtest-${run.id}`,
      timestamp: run.createdAt,
      category: "Strategy validation",
      title: `${run.config.profile} · ${run.config.symbol}`,
      detail: `${run.interpretation} · ${formatCurrency(run.metrics.netPnl)} net P/L`,
    }));

    return [...paperTrades, ...signals, ...backtests, ...futures, ...futuresStrategyBacktests]
      .filter((event) => !Number.isNaN(Date.parse(event.timestamp)))
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      .slice(0, 8);
  }, [coins, localSnapshot, state.trades]);

  return (
    <main
      className="min-h-screen"
      style={{
        background: "rgba(5, 5, 5, 0.91)",
        backdropFilter: "blur(30px)",
        WebkitBackdropFilter: "blur(30px)",
      }}
    >
      <div className="mx-auto px-4 pb-16 pt-28 sm:px-6 lg:px-12" style={{ maxWidth: 1280 }}>
        <header className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="h-px w-8" style={{ background: "#c9d7e3" }} />
              <p className="text-[10px] uppercase tracking-[0.16em]" style={{ color: "#9ca3af" }}>
                Paper trading intelligence
              </p>
            </div>
            <h1 className="text-3xl font-medium tracking-tight sm:text-4xl" style={{ color: "#f3f4f6" }}>
              Command Center
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6" style={{ color: "#8b95a5" }}>
              A read-only operating view over local signals, risk controls, simulations, and paper activity.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill value="Paper only" />
            <StatusPill value={priceStateLabel} />
            <StatusPill value={localSnapshot.sensitivity} />
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <SectionCard
            id="market-intelligence-title"
            title="Market Intelligence"
            subtitle="Tracked universe and market-data availability"
            icon={<Activity size={17} />}
            badge={priceStateLabel}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Metric label="Supported coins" value={`${coins.length}`} detail={coins.map((coin) => coin.symbol).join(" · ")} />
              <Metric label="Watchlist tracked" value={`${watchlistCoins.length} / ${coins.length}`} detail="Browser-local selection" />
              <Metric label="Last price refresh" value={formatTimestamp(lastPriceUpdate)} detail={isPriceStale ? "Stale data warning" : "Latest recorded update"} />
            </div>
            <p className="mt-4 text-xs leading-5" style={{ color: "#6b7280" }}>
              Live prices use CoinGecko where available. Strategy simulations may use local/mock data.
            </p>
          </SectionCard>

          <SectionCard
            id="coin-radar-title"
            title="Coin Radar"
            subtitle="Compact watchlist market summary"
            icon={<Radar size={17} />}
            badge={`${watchlistCoins.length} tracked`}
          >
            {watchlistCoins.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {watchlistCoins.map((coin) => (
                  <div
                    key={coin.id}
                    className="flex items-center justify-between gap-4 rounded-lg px-3 py-3"
                    style={{ background: "rgba(201, 215, 227, 0.025)", border: "1px solid rgba(201, 215, 227, 0.05)" }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium" style={{ color: "#d1d5db" }}>{coin.symbol}</p>
                      <p className="mt-1 truncate text-[10px] uppercase tracking-[0.06em]" style={{ color: "#5f6977" }}>
                        {priceStatus === "live" ? "CoinGecko" : priceStatus === "fallback" ? "Mock fallback" : "Awaiting prices"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm tabular-nums" style={{ color: "#d1d5db" }}>{formatCurrency(coin.price)}</p>
                      <p className="mt-1 text-xs tabular-nums" style={{ color: coin.change24h >= 0 ? "#22c55e" : "#ef4444" }}>
                        {formatPercentage(coin.change24h)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg p-4 text-sm" style={{ color: "#6b7280", background: "rgba(201, 215, 227, 0.025)" }}>
                No coins are currently selected in the Watchlist.
              </p>
            )}
          </SectionCard>
        </div>

        <SectionCard
          id="multi-timeframe-title"
          title="Multi-Timeframe Analysis"
          subtitle={`Deterministic local/mock structure · ${localSnapshot.scenario}`}
          icon={<Layers3 size={17} />}
          badge="Local/mock"
          className="mt-6"
        >
          <div className="space-y-4">
            {multiTimeframe.map((analysis) => (
              <article
                key={analysis.coinId}
                className="rounded-lg p-3 sm:p-4"
                style={{ background: "rgba(201, 215, 227, 0.018)", border: "1px solid rgba(201, 215, 227, 0.05)" }}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium" style={{ color: "#d1d5db" }}>{analysis.symbol}</h3>
                    <p className="mt-0.5 text-[10px] uppercase tracking-[0.06em]" style={{ color: "#5f6977" }}>
                      {analysis.futuresSymbol} · {analysis.source}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {analysis.timeframes.map((timeframe) => (
                    <div
                      key={timeframe.timeframe}
                      className="rounded-lg p-3"
                      style={{ background: "rgba(0, 0, 0, 0.16)", border: "1px solid rgba(201, 215, 227, 0.045)" }}
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-xs font-medium" style={{ color: "#9ca3af" }}>{timeframe.timeframe}</p>
                        <StatusPill value={trendLabel(timeframe.trend)} />
                      </div>
                      <dl className="space-y-2 text-xs">
                        <div className="flex justify-between gap-3"><dt style={{ color: "#5f6977" }}>RSI</dt><dd className="text-right" style={{ color: "#9ca3af" }}>{timeframe.rsi ?? "Unavailable"}</dd></div>
                        <div className="flex justify-between gap-3"><dt style={{ color: "#5f6977" }}>State</dt><dd className="text-right" style={{ color: getStatusColor(timeframe.rsiZone) }}>{indicatorLabel(timeframe.rsiZone)}</dd></div>
                        <div className="flex justify-between gap-3"><dt style={{ color: "#5f6977" }}>MACD</dt><dd className="text-right" style={{ color: getStatusColor(timeframe.macd) }}>{indicatorLabel(timeframe.macd)}</dd></div>
                        <div className="flex justify-between gap-3"><dt style={{ color: "#5f6977" }}>EMA</dt><dd className="max-w-44 text-right" style={{ color: "#9ca3af" }}>{timeframe.emaStructure}</dd></div>
                        <div className="flex justify-between gap-3"><dt style={{ color: "#5f6977" }}>Volume anomaly</dt><dd className="text-right" style={{ color: "#6b7280" }}>{indicatorLabel(timeframe.volumeAnomaly)}</dd></div>
                      </dl>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5" style={{ color: "#6b7280" }}>
            Multi-timeframe analysis is local/mock until market-grade candle data is connected. Mock candles do not include volume.
          </p>
        </SectionCard>

        <SectionCard
          id="strategy-validation-summary-title"
          title="Futures Strategy Validation"
          subtitle="Recent deterministic 15m profile backtests"
          icon={<FlaskConical size={17} />}
          badge="Local/mock only"
          className="mt-6"
        >
          {latestFuturesStrategyBacktest && bestRecentFuturesStrategyBacktest ? (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Metric
                  label="Best recent test"
                  value={`${bestRecentFuturesStrategyBacktest.config.profile} · ${bestRecentFuturesStrategyBacktest.config.symbol}`}
                  detail={`${bestRecentFuturesStrategyBacktest.metrics.returnPercent.toFixed(2)}% simulated return`}
                />
                <Metric label="Latest win rate" value={`${latestFuturesStrategyBacktest.metrics.winRate.toFixed(2)}%`} />
                <Metric label="Latest net P/L" value={formatCurrency(latestFuturesStrategyBacktest.metrics.netPnl)} />
                <Metric label="Latest max drawdown" value={`${latestFuturesStrategyBacktest.metrics.maxDrawdown.toFixed(2)}%`} />
                <Metric label="Latest risk blocked" value={`${latestFuturesStrategyBacktest.metrics.riskBlockedCount}`} />
              </div>
              <p className="mt-4 text-xs leading-5" style={{ color: "#6b7280" }}>
                Latest: {latestFuturesStrategyBacktest.config.profile} · {latestFuturesStrategyBacktest.config.scenario} · {latestFuturesStrategyBacktest.interpretation}. Validation status is descriptive only.
              </p>
            </>
          ) : (
            <p className="rounded-lg p-4 text-sm" style={{ color: "#6b7280", background: "rgba(201, 215, 227, 0.025)" }}>
              No saved futures strategy validation runs are available. Run the 15m Futures Strategy Backtest from Analytics.
            </p>
          )}
        </SectionCard>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <SectionCard
            id="signal-summary-title"
            title="Signal Engine Summary"
            subtitle="Latest saved paper-signal batch"
            icon={<BarChart3 size={17} />}
            badge={localSnapshot.sensitivity}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Metric label="Latest signals" value={`${latestSignals.length}`} />
              {SIGNAL_LABELS.map((label) => (
                <Metric key={label} label={label} value={`${signalCounts[label]}`} />
              ))}
            </div>
            <p className="mt-4 text-xs leading-5" style={{ color: "#6b7280" }}>
              {latestSignalTimestamp
                ? `Latest generated batch: ${formatTimestamp(latestSignalTimestamp)}. Signals never create trades automatically.`
                : "No saved paper signals are available yet. Generate signals from an existing Signal Engine panel."}
            </p>
          </SectionCard>

          <SectionCard
            id="risk-summary-title"
            title="Risk Engine Summary"
            subtitle="Current local controller limits and saved decisions"
            icon={<ShieldCheck size={17} />}
            badge={localSnapshot.riskJournal[0]?.decision ?? "No decision"}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Metric label="Max paper trade size" value={`${localSnapshot.riskSettings.maxTradeSizePercent}%`} detail={`Max coin allocation ${localSnapshot.riskSettings.maxAllocationPerCoinPercent}%`} />
              <Metric label="Stop-loss presence" value={localSnapshot.futuresPositions.length > 0 ? `${localSnapshot.futuresPositions.length} / ${localSnapshot.futuresPositions.length} open positions` : "No open futures positions"} detail="Required by Futures Paper Mode" />
              <Metric label="Daily loss guard" value={`${localSnapshot.futuresSettings.maxDailyLossPercent}% cap`} detail={`${formatCurrency(localSnapshot.futuresSettings.realizedLossToday)} recorded today`} />
              <Metric label="Liquidation risk" value={futuresLiquidationState} detail="Local isolated-margin estimate only" />
              <Metric label="Maximum leverage" value="5x paper cap" detail="5x remains high risk and gated" />
              <Metric label="Portfolio drawdown" value={positions.length > 0 ? `${totalPLPercent.toFixed(2)}%` : "No active spot positions"} detail={`New buys block below -${localSnapshot.riskSettings.blockBuyDrawdownPercent}%`} />
            </div>

            <div className="mt-4 border-t pt-4" style={{ borderColor: "rgba(201, 215, 227, 0.06)" }}>
              <p className="mb-3 text-[10px] uppercase tracking-[0.08em]" style={{ color: "#6b7280" }}>
                Latest controller decisions
              </p>
              {localSnapshot.riskJournal.length > 0 ? (
                <div className="space-y-2">
                  {localSnapshot.riskJournal.slice(0, 3).map((entry) => (
                    <div key={entry.id} className="rounded-lg p-3" style={{ background: "rgba(201, 215, 227, 0.02)" }}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-medium" style={{ color: "#9ca3af" }}>{entry.signal} {entry.symbol}</p>
                        <StatusPill value={getDecisionBadge(entry.decision)} />
                      </div>
                      <p className="mt-2 text-xs leading-5" style={{ color: "#6b7280" }}>{entry.reason}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs leading-5" style={{ color: "#6b7280" }}>
                  No saved Risk Controller decisions are available. Candidate status will appear after a signal is evaluated.
                </p>
              )}
            </div>
          </SectionCard>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <SectionCard
            id="journal-summary-title"
            title="Paper Trading Journal Summary"
            subtitle="Recent records combined from existing browser-local histories"
            icon={<History size={17} />}
            badge={`${journalEvents.length} recent`}
          >
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Paper trades" value={`${state.trades.length}`} />
              <Metric label="Signals saved" value={`${localSnapshot.signals.length}`} />
              <Metric label="Backtests" value={`${localSnapshot.backtests.length + localSnapshot.futuresStrategyBacktests.length}`} />
              <Metric label="Futures actions" value={`${localSnapshot.futuresHistory.length}`} />
            </div>
            {journalEvents.length > 0 ? (
              <div className="divide-y" style={{ borderColor: "rgba(201, 215, 227, 0.06)" }}>
                {journalEvents.map((event) => (
                  <div key={event.id} className="grid gap-2 py-3 sm:grid-cols-[120px_1fr_auto] sm:items-center">
                    <p className="text-[10px] uppercase tracking-[0.06em]" style={{ color: "#5f6977" }}>{event.category}</p>
                    <div className="min-w-0">
                      <p className="text-sm" style={{ color: "#b7bec8" }}>{event.title}</p>
                      <p className="mt-1 truncate text-xs" style={{ color: "#6b7280" }}>{event.detail}</p>
                    </div>
                    <p className="text-xs sm:text-right" style={{ color: "#5f6977" }}>{formatTimestamp(event.timestamp)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg p-4 text-sm" style={{ color: "#6b7280", background: "rgba(201, 215, 227, 0.025)" }}>
                No paper trades, saved signals, backtests, or futures actions are available yet.
              </p>
            )}
            <p className="mt-4 text-xs" style={{ color: "#4b5563" }}>Live trading is disabled. No records are synthesized.</p>
          </SectionCard>

          <SectionCard
            id="system-health-title"
            title="System Health"
            subtitle="Local runtime and data-source visibility"
            icon={<Database size={17} />}
            badge={isPriceStale ? "Stale warning" : localSnapshot.storage.status}
          >
            <dl className="space-y-3">
              {[
                { label: "Price data", value: priceStateLabel },
                { label: "Local storage", value: localSnapshot.storage.status },
                { label: "Last update", value: formatTimestamp(lastPriceUpdate) },
                { label: "Data freshness", value: isPriceStale ? "Stale warning" : lastPriceUpdate ? "Current" : "Awaiting update" },
                { label: "Mock scenario", value: localSnapshot.scenario },
                { label: "Execution mode", value: "Paper only" },
              ].map((item) => (
                <div key={item.label} className="flex items-start justify-between gap-4 border-b pb-3 last:border-0 last:pb-0" style={{ borderColor: "rgba(201, 215, 227, 0.05)" }}>
                  <dt className="text-xs" style={{ color: "#6b7280" }}>{item.label}</dt>
                  <dd className="max-w-[65%] text-right text-xs" style={{ color: "#9ca3af" }}>{item.value}</dd>
                </div>
              ))}
            </dl>

            {(priceError || localSnapshot.storage.status === "unavailable" || isPriceStale) && (
              <div
                className="mt-4 rounded-lg p-3"
                style={{ background: "rgba(245, 158, 11, 0.06)", border: "1px solid rgba(245, 158, 11, 0.16)" }}
                role="status"
              >
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 shrink-0" size={14} style={{ color: "#f59e0b" }} />
                  <div className="space-y-1 text-xs leading-5" style={{ color: "#a78b63" }}>
                    {priceError && <p>{priceError}</p>}
                    {localSnapshot.storage.status === "unavailable" && <p>{localSnapshot.storage.message}</p>}
                    {isPriceStale && <p>Price data is older than five minutes. Review the displayed source state before relying on it.</p>}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 flex items-start gap-2 text-xs leading-5" style={{ color: "#5f6977" }}>
              {priceStatus === "loading" ? <Clock3 className="mt-0.5 shrink-0" size={13} /> : <ShieldCheck className="mt-0.5 shrink-0" size={13} />}
              <p>Paper mode only. No wallet connection and no real orders.</p>
            </div>
          </SectionCard>
        </div>

        <p className="mt-6 text-center text-xs" style={{ color: "#4b5563" }}>
          For tracking only. Not financial advice.
        </p>
      </div>
    </main>
  );
}
