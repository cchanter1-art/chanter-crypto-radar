import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock3,
  Database,
  Eye,
  FlaskConical,
  Gauge,
  History,
  Layers3,
  ListChecks,
  Radar,
  ShieldCheck,
  Zap,
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
  getForwardTestSummary,
  getLatestForwardTestObservation,
  loadForwardTestData,
} from "@/lib/forwardTestSession";
import { loadLatestSignalQualityScore, buildEvidenceStack, applyEvidenceModifier } from "@/lib/signalQualityScore";
import { loadLatestMarketDataIntegrity } from "@/lib/marketDataIntegrity";
import { getAutoIntelligenceCycleState, getStaleWarning, isAutoIntelligenceCycleActive, getLatestAutoObservation } from "@/lib/autoIntelligenceCycle";
import { getCandidateSummary } from "@/lib/candidateReviewQueue";
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

function createLocalSnapshot() {
  return {
    signals: loadPaperSignalHistory(),
    sensitivity: loadPaperSignalSensitivity(),
    riskSettings: loadPaperRiskSettings(),
    riskJournal: loadPaperRiskJournal(),
    backtests: loadBacktestHistory(),
    futuresStrategyBacktests: loadFuturesStrategyBacktestHistory(),
    forwardTestData: loadForwardTestData(),
    latestSignalQuality: loadLatestSignalQualityScore(),
    evidenceAdjusted: (() => {
      const sq = loadLatestSignalQualityScore();
      const st = buildEvidenceStack({
        integrity: loadLatestMarketDataIntegrity(),
        autoObs: getAutoIntelligenceCycleState(),
        forwardTest: (() => {
          const d = loadForwardTestData();
          const s = d.activeSession ?? d.completedSessions[0] ?? null;
          return s ? { observations: s.observations, latestDirection: s.observations[0]?.direction ?? null } : null;
        })(),
        backtest: (() => {
          const r = loadFuturesStrategyBacktestHistory()[0] ?? null;
          return r ? { returnPercent: r.metrics.returnPercent, winRate: r.metrics.winRate } : null;
        })(),
        riskGate: sq ? { riskStatus: sq.input.riskStatus } : null,
      });
      return sq ? applyEvidenceModifier(sq, st) : null;
    })(),
    evidenceStack: buildEvidenceStack({
      integrity: loadLatestMarketDataIntegrity(),
      autoObs: getAutoIntelligenceCycleState(),
      forwardTest: (() => {
        const d = loadForwardTestData();
        const s = d.activeSession ?? d.completedSessions[0] ?? null;
        return s ? { observations: s.observations, latestDirection: s.observations[0]?.direction ?? null } : null;
      })(),
      backtest: (() => {
        const r = loadFuturesStrategyBacktestHistory()[0] ?? null;
        return r ? { returnPercent: r.metrics.returnPercent, winRate: r.metrics.winRate } : null;
      })(),
      riskGate: loadLatestSignalQualityScore() ? { riskStatus: loadLatestSignalQualityScore().input.riskStatus } : null,
    }),
    latestIntegrity: loadLatestMarketDataIntegrity(),
    autoCycleState: getAutoIntelligenceCycleState(),
    autoCycleActive: isAutoIntelligenceCycleActive(),
    latestAutoObs: getLatestAutoObservation(),
    futuresHistory: loadFuturesPaperHistory(),
    futuresPositions: loadFuturesPaperPositions(),
    futuresSettings: loadFuturesPaperSettings(),
    scenario: loadFuturesTestScenario(),
    candidateSummary: getCandidateSummary(),
    storage: getStorageHealth(),
    checkedAt: Date.now(),
  };
}

export default function CommandCenterDashboard() {
  const { state, coins, priceStatus, priceError, lastPriceUpdate } = useAppState();
  const { positions, totalPLPercent } = usePortfolio();
  const [localSnapshot, setLocalSnapshot] = useState(createLocalSnapshot);

  useEffect(() => {
    const refreshSnapshot = () => setLocalSnapshot(createLocalSnapshot());

    refreshSnapshot();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshSnapshot();
    };

    window.addEventListener("focus", refreshSnapshot);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshSnapshot);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

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
  const forwardTestSession = localSnapshot.forwardTestData.activeSession ??
    localSnapshot.forwardTestData.completedSessions[0] ?? null;
  const forwardTestSummary = getForwardTestSummary(forwardTestSession);
  const latestForwardTestObservation = getLatestForwardTestObservation(
    localSnapshot.forwardTestData,
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
      detail: `${signal.confidence} confidence  --  ${signal.reason}`,
    }));
    const backtests: JournalEvent[] = localSnapshot.backtests.map((run) => ({
      id: `backtest-${run.id}`,
      timestamp: run.createdAt,
      category: "Backtest",
      title: `${run.config.coinId === "all" ? "All supported coins" : run.config.coinId.toUpperCase()} simulation`,
      detail: `${run.metrics.totalTrades} trades  --  ${run.metrics.netReturnPercent.toFixed(2)}% net return`,
    }));
    const futures: JournalEvent[] = localSnapshot.futuresHistory.map((record) => ({
      id: `futures-${record.recordId}`,
      timestamp: record.timestamp,
      category: "Futures paper",
      title: `${record.action} ${record.direction} ${record.symbol}`,
      detail: `${record.leverage}x isolated  --  ${formatCurrency(record.marginAmount)} margin`,
    }));
    const futuresStrategyBacktests: JournalEvent[] = localSnapshot.futuresStrategyBacktests.map((run) => ({
      id: `futures-strategy-backtest-${run.id}`,
      timestamp: run.createdAt,
      category: "Strategy validation",
      title: `${run.config.profile}  --  ${run.config.symbol}`,
      detail: `${run.interpretation}  --  ${formatCurrency(run.metrics.netPnl)} net P/L`,
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
              <Metric label="Supported coins" value={`${coins.length}`} detail={coins.map((coin) => coin.symbol).join("  --  ")} />
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
          subtitle={`Deterministic local/mock structure  --  ${localSnapshot.scenario}`}
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
                      {analysis.futuresSymbol}  --  {analysis.source}
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
                  value={`${bestRecentFuturesStrategyBacktest.config.profile}  --  ${bestRecentFuturesStrategyBacktest.config.symbol}`}
                  detail={`${bestRecentFuturesStrategyBacktest.metrics.returnPercent.toFixed(2)}% simulated return`}
                />
                <Metric label="Latest win rate" value={`${latestFuturesStrategyBacktest.metrics.winRate.toFixed(2)}%`} />
                <Metric label="Latest net P/L" value={formatCurrency(latestFuturesStrategyBacktest.metrics.netPnl)} />
                <Metric label="Latest max drawdown" value={`${latestFuturesStrategyBacktest.metrics.maxDrawdown.toFixed(2)}%`} />
                <Metric label="Latest risk blocked" value={`${latestFuturesStrategyBacktest.metrics.riskBlockedCount}`} />
              </div>
              <p className="mt-4 text-xs leading-5" style={{ color: "#6b7280" }}>
                Latest: {latestFuturesStrategyBacktest.config.profile}  --  {latestFuturesStrategyBacktest.config.scenario}  --  {latestFuturesStrategyBacktest.interpretation}. Validation status is descriptive only.
              </p>
            </>
          ) : (
            <p className="rounded-lg p-4 text-sm" style={{ color: "#6b7280", background: "rgba(201, 215, 227, 0.025)" }}>
              No saved futures strategy validation runs are available. Run the 15m Futures Strategy Backtest from Analytics.
            </p>
          )}
        </SectionCard>

        <SectionCard
          id="forward-test-summary-title"
          title="Forward Test Observation"
          subtitle="Manual strategy and risk observations"
          icon={<Eye size={17} />}
          badge={localSnapshot.forwardTestData.activeSession
            ? "Active  --  observation only"
            : "Inactive  --  paper only"}
          className="mt-6"
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Metric
              label="Session status"
              value={localSnapshot.forwardTestData.activeSession ? "Active" : "Inactive"}
              detail="Manual ticks only"
            />
            <Metric
              label="Latest observation"
              value={latestForwardTestObservation
                ? `${latestForwardTestObservation.direction}  --  ${latestForwardTestObservation.riskStatus}`
                : "None"}
              detail={latestForwardTestObservation
                ? formatTimestamp(latestForwardTestObservation.timestamp)
                : "No observation recorded"}
            />
            <Metric label="Actionable" value={`${forwardTestSummary.actionableSignals}`} />
            <Metric label="Risk blocked" value={`${forwardTestSummary.riskBlockedCount}`} />
            <Metric label="WAIT" value={`${forwardTestSummary.waitCount}`} />
          </div>
          <p className="mt-4 text-xs leading-5" style={{ color: "#6b7280" }}>
            Observation only / paper only. Forward testing records data only when Add observation tick is clicked; no position is opened.
          </p>
        </SectionCard>

        <SectionCard
          id="signal-quality-summary-title"
          title="Signal Quality Intelligence"
          subtitle="Latest transparent paper-signal evaluation"
          icon={<Gauge size={17} />}
          badge={localSnapshot.latestSignalQuality?.evidenceCompleteness ? "Evidence: " + localSnapshot.latestSignalQuality.evidenceCompleteness : localSnapshot.evidenceStack.completeness === "complete" ? "Evidence: complete (live)" : localSnapshot.evidenceStack.completeness === "partial" ? "Evidence: partial (live)" : localSnapshot.latestSignalQuality ? "Evidence: legacy" : "Evidence: missing"}
          className="mt-6"
        >
          {localSnapshot.latestSignalQuality ? (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Metric label="Base score" value={`${localSnapshot.latestSignalQuality.score} / 100`} />
                <Metric label="Evidence score" value={(localSnapshot.latestSignalQuality?.finalScore ?? localSnapshot.evidenceAdjusted?.finalScore) ? `${localSnapshot.latestSignalQuality?.finalScore ?? localSnapshot.evidenceAdjusted.finalScore} / 100` : "N/A"} detail={localSnapshot.latestSignalQuality ? (localSnapshot.latestSignalQuality.evidenceCompleteness ? localSnapshot.latestSignalQuality.evidenceCompleteness : "legacy") + (localSnapshot.latestSignalQuality.evidenceCapsApplied && localSnapshot.latestSignalQuality.evidenceCapsApplied.length > 0 ? " (capped)" : "") : localSnapshot.evidenceAdjusted ? "live" : "no data"} />
                <Metric label="Quality label" value={localSnapshot.latestSignalQuality.label} />
                <Metric
                  label="Setup"
                  value={`${localSnapshot.latestSignalQuality.input.symbol}  --  ${localSnapshot.latestSignalQuality.input.profile}`}
                  detail={localSnapshot.latestSignalQuality.input.scenario}
                />
                <Metric label="Risk status" value={localSnapshot.latestSignalQuality.input.riskStatus} />
                <Metric label="Evidence" value={localSnapshot.latestSignalQuality.evidenceStatus} />
              </div>
              <p className="mt-4 text-xs leading-5" style={{ color: "#6b7280" }}>
                Signal Quality Score is informational only. Risk Engine remains the final gate and no order is created.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.06em]" style={{ color: "#6b7280" }}>Market integrity</p>
                  <p className="mt-1 text-xs" style={{ color: localSnapshot.evidenceStack.hasMarketIntegrity ? "#22c55e" : "#4b5563" }}>{localSnapshot.evidenceStack.hasMarketIntegrity ? "Available" : "Missing"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.06em]" style={{ color: "#6b7280" }}>Auto observations</p>
                  <p className="mt-1 text-xs" style={{ color: localSnapshot.evidenceStack.hasAutoObservations ? "#22c55e" : "#4b5563" }}>{localSnapshot.evidenceStack.hasAutoObservations ? localSnapshot.evidenceStack.autoObsCount + " records" : "None"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.06em]" style={{ color: "#6b7280" }}>Forward test</p>
                  <p className="mt-1 text-xs" style={{ color: localSnapshot.evidenceStack.hasForwardTest ? "#22c55e" : "#4b5563" }}>{localSnapshot.evidenceStack.hasForwardTest ? localSnapshot.evidenceStack.forwardObsCount + " obs" : "None"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.06em]" style={{ color: "#6b7280" }}>Backtest</p>
                  <p className="mt-1 text-xs" style={{ color: localSnapshot.evidenceStack.hasBacktest ? "#22c55e" : "#4b5563" }}>{localSnapshot.evidenceStack.hasBacktest ? localSnapshot.evidenceStack.backtestReturn?.toFixed(1) + "%" : "None"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.06em]" style={{ color: "#6b7280" }}>Risk gate</p>
                  <p className="mt-1 text-xs" style={{ color: localSnapshot.evidenceStack.hasRiskGate ? "#22c55e" : "#4b5563" }}>{localSnapshot.evidenceStack.hasRiskGate ? localSnapshot.evidenceStack.riskGateStatus : "N/A"}</p>
                </div>
              </div>
              <p className="mt-3 text-xs" style={{ color: "#6b7280" }}>
                Evidence stack does not generate trades or bypass risk gates.</p>
            </>
          ) : (
            <p className="rounded-lg p-4 text-sm" style={{ color: "#6b7280", background: "rgba(201, 215, 227, 0.025)" }}>
              No saved Signal Quality Score is available. Generate one from Analytics.
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
            id="market-data-integrity-title"
            title="Market Data Health"
            subtitle="15m candle dataset integrity summary"
            icon={<Database size={17} />}
            badge={localSnapshot.latestIntegrity?.readinessStatus.replace(/_/g, " ") ?? "Not checked"}
          >
            {localSnapshot.latestIntegrity ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Metric
                    label="Integrity Score"
                    value={`${localSnapshot.latestIntegrity.integrityScore}/100`}
                    detail={localSnapshot.latestIntegrity.integrityScore >= 85 ? "Clean" : localSnapshot.latestIntegrity.integrityScore >= 70 ? "Good" : localSnapshot.latestIntegrity.integrityScore >= 50 ? "Usable with caution" : "Weak or invalid"}
                  />
                  <Metric
                    label="Source"
                    value={localSnapshot.latestIntegrity.source.replace(/_/g, " ")}
                    detail={`${localSnapshot.latestIntegrity.symbol} / ${localSnapshot.latestIntegrity.timeframe}`}
                  />
                </div>
                <div className="flex items-center justify-between text-xs" style={{ color: "#6b7280" }}>
                  <span>Gaps: {localSnapshot.latestIntegrity.gapCount} / Anomalies: {localSnapshot.latestIntegrity.anomalyCount}</span>
                  <span>Checked: {formatTimestamp(localSnapshot.latestIntegrity.createdAt)}</span>
                </div>
                {localSnapshot.latestIntegrity.warnings.length > 0 && (
                  <p className="text-xs" style={{ color: "#a78b63" }}>
                    {localSnapshot.latestIntegrity.warnings[0]}
                  </p>
                )}
              </div>
            ) : (
              <p className="rounded-lg p-4 text-sm" style={{ color: "#6b7280", background: "rgba(201, 215, 227, 0.025)" }}>
                No integrity report available. Run a check from Analytics.
              </p>
            )}
          </SectionCard>

          <SectionCard
            id="auto-cycle-title"
            title="Auto Intelligence Cycle"
            subtitle="15-minute browser-local market data refresh"
            icon={<Zap size={17} />}
            badge={localSnapshot.autoCycleActive ? "Running" : localSnapshot.autoCycleState.lastStatus === "passed" ? "Last passed" : localSnapshot.autoCycleState.lastStatus === "failed" ? "Last failed" : "Off"}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
              <Metric
                label="Status"
                value={localSnapshot.autoCycleActive ? "Running" : localSnapshot.autoCycleState.enabled ? "Enabled" : "Off"}
                detail={localSnapshot.autoCycleState.lastStatus ? `Last: ${localSnapshot.autoCycleState.lastStatus}` : "No runs yet"}
              />
              <Metric
                label="Last completed"
                value={localSnapshot.autoCycleState.lastTickCompletedAt ? formatTimestamp(localSnapshot.autoCycleState.lastTickCompletedAt) : "Never"}
                detail={localSnapshot.autoCycleState.nextRunAt ? `Next: ${formatTimestamp(localSnapshot.autoCycleState.nextRunAt)}` : ""}
              />
              <Metric
                label="Last score"
                value={localSnapshot.autoCycleState.lastScore !== null ? `${localSnapshot.autoCycleState.lastScore}/100` : "N/A"}
                detail={localSnapshot.autoCycleState.lastReadiness ? localSnapshot.autoCycleState.lastReadiness.replace(/_/g, " ") : ""}
              />
              <Metric
                label="Symbols"
                value={localSnapshot.autoCycleState.symbolsScanned > 0 ? `${localSnapshot.autoCycleState.symbolsSucceeded}/${localSnapshot.autoCycleState.symbolsScanned} ok` : "N/A"}
                detail={localSnapshot.autoCycleState.symbolsFailed > 0 ? `${localSnapshot.autoCycleState.symbolsFailed} failed` : ""}
              />
              <Metric
                label="Observations"
                value={localSnapshot.autoCycleState.observationsCreated > 0 ? `${localSnapshot.autoCycleState.observationsCreated} created` : "0"}
                detail={localSnapshot.autoCycleState.observationsSkipped > 0 ? `${localSnapshot.autoCycleState.observationsSkipped} skipped` : ""}
              />
              <Metric
                label="Latest observed"
                value={localSnapshot.latestAutoObs ? localSnapshot.latestAutoObs.symbol : "N/A"}
                detail={localSnapshot.latestAutoObs ? `${localSnapshot.latestAutoObs.freshnessStatus} / ${localSnapshot.latestAutoObs.readinessStatus.replace(/_/g, " ")}` : "No observations yet"}
              />
            </div>
            {(() => {
              const w = getStaleWarning(localSnapshot.autoCycleState);
              if (!w) return null;
              return (
                <div className="mt-3 rounded-lg p-3" style={{ background: "rgba(245, 158, 11, 0.06)", border: "1px solid rgba(245, 158, 11, 0.16)" }}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} style={{ color: "#f59e0b" }} className="mt-0.5 shrink-0" />
                    <p className="text-xs leading-5" style={{ color: "#a78b63" }}>{w}</p>
                  </div>
                </div>
              );
            })()}
            {localSnapshot.autoCycleState.lastError && (
              <p className="mt-3 text-xs" style={{ color: "#a78b63" }}>
                {localSnapshot.autoCycleState.lastError}
              </p>
            )}
            <div className="mt-3 flex items-start gap-2 text-xs leading-5" style={{ color: "#5f6977" }}>
              <ShieldCheck className="mt-0.5 shrink-0" size={13} />
              <p>Paper-only automation. No wallet. No orders. No auto positions.</p>
            </div>
          </SectionCard>

<SectionCard
            id="candidate-queue-title"
            title="Candidate Review Queue"
            subtitle="Review-only intelligence candidates"
            icon={<ListChecks size={17} />}
            badge={localSnapshot.candidateSummary.total > 0 ? localSnapshot.candidateSummary.review + " review" : "Empty"}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
              <Metric
                label="Total active"
                value={`${localSnapshot.candidateSummary.total - localSnapshot.candidateSummary.dismissed}`}
                detail="All non-dismissed candidates"
              />
              <Metric
                label="Review"
                value={`${localSnapshot.candidateSummary.review}`}
                detail="High-priority candidates"
              />
              <Metric
                label="Watch"
                value={`${localSnapshot.candidateSummary.watch}`}
                detail="Moderate score candidates"
              />
              <Metric
                label="Blocked / Stale"
                value={`${localSnapshot.candidateSummary.blocked}/${localSnapshot.candidateSummary.stale}`}
                detail="Risk-blocked / data stale"
              />
              <Metric
                label="Latest symbol"
                value={localSnapshot.candidateSummary.latestSymbol ?? "N/A"}
                detail={localSnapshot.candidateSummary.latestScore !== null ? `Score: ${localSnapshot.candidateSummary.latestScore}` : ""}
              />
              <Metric
                label="Last update"
                value={localSnapshot.candidateSummary.lastUpdate ? formatTimestamp(localSnapshot.candidateSummary.lastUpdate) : "Never"}
                detail="Last queue modification"
              />
            </div>
            <div className="mt-3 flex items-start gap-2 text-xs leading-5" style={{ color: "#5f6977" }}>
              <ShieldCheck className="mt-0.5 shrink-0" size={13} />
              <p>Review-only. No orders. No paper positions. Not financial advice.</p>
            </div>
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