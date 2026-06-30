import { useState } from "react";
import { Activity, AlertTriangle, Database, ShieldCheck, Trash2 } from "lucide-react";
import {
  loadLatestMarketDataIntegrity,
  loadMarketDataIntegrityHistory,
  runIntegrityCheckForMock,
  saveMarketDataIntegrityHistory,
  clearMarketDataIntegrityHistory,
  type MarketDataIntegrityReport,
} from "@/lib/marketDataIntegrity";
import {
  fetchLive15mCandles,
  runIntegrityCheckForLive,
} from "@/lib/liveCandleProvider";
import { loadFuturesTestScenario } from "@/lib/futuresPaperEngine";
import type { FuturesSymbol } from "@/lib/futuresPaperEngine";

const SYMBOLS: FuturesSymbol[] = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "ADAUSDT", "AVAXUSDT"];

function getStatusColor(value: string): string {
  const v = value.toLowerCase();
  if (v.includes("blocked") || v.includes("invalid") || v.includes("stale")) return "#ef4444";
  if (v.includes("ready") && !v.includes("warnings")) return "#22c55e";
  if (v.includes("warnings") || v.includes("delayed") || v.includes("unknown")) return "#f59e0b";
  return "#94a3b8";
}

function getScoreColor(score: number): string {
  if (score >= 85) return "#22c55e";
  if (score >= 70) return "#84cc16";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function getScoreLabel(score: number): string {
  if (score <= 24) return "Invalid";
  if (score <= 49) return "Weak";
  if (score <= 69) return "Usable with caution";
  if (score <= 84) return "Good";
  return "Clean";
}

function formatAge(ms: number | null): string {
  if (ms === null) return "Unknown";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "<1 min ago";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "Not available";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Not available";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

interface ReadinessRowProps {
  label: string;
  ready: boolean;
}

function ReadinessRow({ label, ready }: ReadinessRowProps) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
      <span className="text-xs" style={{ color: "#6b7280" }}>{label}</span>
      <span className="text-xs font-medium" style={{ color: ready ? "#22c55e" : "#ef4444" }}>
        {ready ? "Ready" : "Not ready"}
      </span>
    </div>
  );
}

export default function MarketDataIntegrityPanel() {
  const [symbol, setSymbol] = useState<FuturesSymbol>("BTCUSDT");
  const [report, setReport] = useState<MarketDataIntegrityReport | null>(
    () => loadLatestMarketDataIntegrity(),
  );
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<"mock" | "live">("mock");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const handleRunCheck = async () => {
    setError(null);
    setFetchError(null);

    if (dataSource === "live") {
      setLoading(true);
      try {
        const result = await fetchLive15mCandles({ symbol, limit: 100 });
        if (!result.ok) {
          setFetchError(
            `Live fetch failed: ${result.error}. ` +
            `Data source remains ${report ? report.source.replace(/_/g, " ") : "unavailable"}. ` +
            `Try Local Mock or retry later.`,
          );
          return;
        }
        const newReport = runIntegrityCheckForLive(symbol, result.candles, result.fetchedAt);
        const history = loadMarketDataIntegrityHistory();
        const updated = [newReport, ...history.filter((r) => r.id !== newReport.id)];
        saveMarketDataIntegrityHistory(updated);
        setReport(newReport);
      } catch {
        setFetchError("Live fetch encountered an unexpected error. Try Local Mock or retry later.");
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const scenario = loadFuturesTestScenario();
      const newReport = runIntegrityCheckForMock(symbol, scenario);
      const history = loadMarketDataIntegrityHistory();
      const updated = [newReport, ...history.filter((r) => r.id !== newReport.id)];
      saveMarketDataIntegrityHistory(updated);
      setReport(newReport);
    } catch {
      setError("Could not run the integrity check. Ensure mock candle data is available.");
    }
  };

  const handleClearHistory = () => {
    clearMarketDataIntegrityHistory();
    setReport(null);
  };

  const scoreColor = report ? getScoreColor(report.integrityScore) : "#94a3b8";
  const statusColor = report ? getStatusColor(report.readinessStatus) : "#94a3b8";

  return (
    <div
      className="rounded-xl p-5 lg:p-6 mt-8"
      style={{
        background: "rgba(7, 13, 22, 0.88)",
        border: "1px solid rgba(201, 215, 227, 0.08)",
        boxShadow: "0 18px 60px rgba(0, 0, 0, 0.22)",
      }}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 rounded-lg p-2"
            style={{ color: "#c9d7e3", background: "rgba(201, 215, 227, 0.05)" }}
          >
            <Database size={17} />
          </span>
          <div>
            <h2 className="text-lg font-medium tracking-tight" style={{ color: "#e5e7eb" }}>
              Market Data Integrity Engine
            </h2>
            <p className="mt-1 text-xs leading-5" style={{ color: "#6b7280" }}>
              15m candle dataset validation before strategy, backtest, or quality use
            </p>
          </div>
        </div>
        {report && (
          <span
            className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em]"
            style={{ color: statusColor, border: `1px solid ${statusColor}33`, background: `${statusColor}0d` }}
          >
            {report.readinessStatus.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-[10px] uppercase tracking-[0.08em] mb-1.5" style={{ color: "#6b7280" }}>
            Symbol
          </label>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value as FuturesSymbol)}
            className="rounded-lg px-3 py-2 text-sm"
            style={{
              background: "rgba(201, 215, 227, 0.05)",
              border: "1px solid rgba(201, 215, 227, 0.1)",
              color: "#c9d7e3",
            }}
          >
            {SYMBOLS.map((s) => (
              <option key={s} value={s} style={{ background: "#0d1117" }}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-[0.08em] mb-1.5" style={{ color: "#6b7280" }}>
            Timeframe
          </label>
          <select
            disabled
            className="rounded-lg px-3 py-2 text-sm opacity-60"
            style={{
              background: "rgba(201, 215, 227, 0.05)",
              border: "1px solid rgba(201, 215, 227, 0.1)",
              color: "#c9d7e3",
            }}
          >
            <option style={{ background: "#0d1117" }}>15m</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-[0.08em] mb-1.5" style={{ color: "#6b7280" }}>
            Source
          </label>
          <select
            value={dataSource}
            onChange={(e) => setDataSource(e.target.value as "mock" | "live")}
            className="rounded-lg px-3 py-2 text-sm cursor-pointer"
            style={{
              background: "rgba(201, 215, 227, 0.05)",
              border: "1px solid rgba(201, 215, 227, 0.1)",
              color: "#c9d7e3",
            }}
          >
            <option value="mock" style={{ background: "#0d1117" }}>Local Mock</option>
            <option value="live" style={{ background: "#0d1117" }}>Live Read-Only</option>
          </select>
        </div>

        <button
          onClick={handleRunCheck}
          disabled={loading}
          className="rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          style={{
            background: "rgba(204, 146, 88, 0.12)",
            border: "1px solid rgba(204, 146, 88, 0.3)",
            color: "#cc9258",
          }}
        >
          <Activity size={14} className="inline mr-1.5" />
          {loading ? "Fetching..." : "Run Integrity Check"}
        </button>

        <button
          onClick={handleClearHistory}
          className="rounded-lg px-3 py-2 text-sm transition-colors"
          style={{
            background: "rgba(239, 68, 68, 0.06)",
            border: "1px solid rgba(239, 68, 68, 0.16)",
            color: "#ef4444",
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg p-3" style={{ background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.16)" }}>
          <p className="text-xs" style={{ color: "#ef4444" }}>{error}</p>
        </div>
      )}

      {fetchError && (
        <div className="mb-4 rounded-lg p-3" style={{ background: "rgba(245, 158, 11, 0.06)", border: "1px solid rgba(245, 158, 11, 0.16)" }}>
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} style={{ color: "#f59e0b" }} className="mt-0.5 shrink-0" />
            <p className="text-xs leading-5" style={{ color: "#a78b63" }}>{fetchError}</p>
          </div>
        </div>
      )}

      {dataSource === "live" && !loading && !fetchError && (
        <div className="mb-4 rounded-lg p-3" style={{ background: "rgba(201, 215, 227, 0.02)", border: "1px solid rgba(201, 215, 227, 0.05)" }}>
          <p className="text-xs" style={{ color: "#6b7280" }}>
            Live Read-Only fetches public 15m candles from Binance public API. No authentication. No orders. If the fetch fails, no live data is stored.
          </p>
        </div>
      )}

      {loading && (
        <div className="mb-4 rounded-lg p-3" style={{ background: "rgba(201, 215, 227, 0.02)", border: "1px solid rgba(201, 215, 227, 0.05)" }}>
          <p className="text-xs" style={{ color: "#9ca3af" }}>Fetching live 15m candles for {symbol}...</p>
        </div>
      )}

      {/* Report Display */}
      {report ? (
        <div className="space-y-5">
          {/* Score + Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg p-4" style={{ background: "rgba(201, 215, 227, 0.025)", border: "1px solid rgba(201, 215, 227, 0.06)" }}>
              <p className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#6b7280" }}>Integrity Score</p>
              <p className="mt-2 text-2xl font-bold" style={{ color: scoreColor }}>{report.integrityScore}</p>
              <p className="mt-1 text-xs" style={{ color: "#6b7280" }}>{getScoreLabel(report.integrityScore)}</p>
            </div>
            <div className="rounded-lg p-4" style={{ background: "rgba(201, 215, 227, 0.025)", border: "1px solid rgba(201, 215, 227, 0.06)" }}>
              <p className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#6b7280" }}>Source</p>
              <p className="mt-2 text-sm font-medium" style={{ color: "#d1d5db" }}>{report.source.replace(/_/g, " ")}</p>
              <p className="mt-1 text-xs" style={{ color: "#6b7280" }}>{report.symbol} / {report.timeframe}</p>
            </div>
            <div className="rounded-lg p-4" style={{ background: "rgba(201, 215, 227, 0.025)", border: "1px solid rgba(201, 215, 227, 0.06)" }}>
              <p className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#6b7280" }}>Latest Candle</p>
              <p className="mt-2 text-sm font-medium" style={{ color: "#d1d5db" }}>{formatTimestamp(report.latestCandleTime)}</p>
              <p className="mt-1 text-xs" style={{ color: "#6b7280" }}>{formatAge(report.latestCandleAgeMs)}</p>
            </div>
            <div className="rounded-lg p-4" style={{ background: "rgba(201, 215, 227, 0.025)", border: "1px solid rgba(201, 215, 227, 0.06)" }}>
              <p className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#6b7280" }}>Candle Count</p>
              <p className="mt-2 text-sm font-medium" style={{ color: "#d1d5db" }}>{report.candleCount}</p>
              <p className="mt-1 text-xs" style={{ color: "#6b7280" }}>{report.gapCount} gaps / {report.anomalyCount} anomalies</p>
            </div>
          </div>

          {/* Warnings */}
          {report.warnings.length > 0 && (
            <div className="rounded-lg p-4" style={{ background: "rgba(245, 158, 11, 0.06)", border: "1px solid rgba(245, 158, 11, 0.16)" }}>
              <div className="flex gap-2 mb-2">
                <AlertTriangle size={14} style={{ color: "#f59e0b" }} className="mt-0.5 shrink-0" />
                <p className="text-[10px] uppercase tracking-[0.08em] font-medium" style={{ color: "#a78b63" }}>Warnings</p>
              </div>
              <ul className="space-y-1.5 ml-6">
                {report.warnings.map((w, i) => (
                  <li key={i} className="text-xs leading-5" style={{ color: "#a78b63" }}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Readiness */}
          <div className="rounded-lg p-4" style={{ background: "rgba(201, 215, 227, 0.025)", border: "1px solid rgba(201, 215, 227, 0.06)" }}>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={14} style={{ color: "#6b7280" }} />
              <p className="text-[10px] uppercase tracking-[0.08em] font-medium" style={{ color: "#6b7280" }}>Readiness by Use Case</p>
            </div>
            <ReadinessRow label="Basic Signal" ready={report.readinessFlags.basicSignal} />
            <ReadinessRow label="EMA" ready={report.readinessFlags.ema} />
            <ReadinessRow label="RSI" ready={report.readinessFlags.rsi} />
            <ReadinessRow label="Backtest" ready={report.readinessFlags.backtest} />
            <ReadinessRow label="Multi-Timeframe" ready={report.readinessFlags.multiTimeframe} />
          </div>

          {/* Check Results */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "Shape Valid", ok: report.checks.shapeValid },
              { label: "OHLC Consistent", ok: report.checks.ohlcConsistent },
              { label: "Timestamp Ordered", ok: report.checks.timestampOrdered },
              { label: "Interval Valid", ok: report.checks.intervalValid },
              { label: "Freshness OK", ok: report.checks.freshnessOk },
              { label: "Sample Size OK", ok: report.checks.sampleSizeOk },
            ].map((check) => (
              <div key={check.label} className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: check.ok ? "#22c55e" : "#ef4444" }}
                />
                <span className="text-xs" style={{ color: check.ok ? "#9ca3af" : "#ef4444" }}>{check.label}</span>
              </div>
            ))}
          </div>

          <p className="text-xs" style={{ color: "#5f6977" }}>
            Checked at {formatTimestamp(report.createdAt)}. For tracking only. Not financial advice.
          </p>
        </div>
      ) : (
        <div className="rounded-lg p-8 text-center" style={{ background: "rgba(201, 215, 227, 0.025)", border: "1px solid rgba(201, 215, 227, 0.06)" }}>
          <Database size={32} style={{ color: "#4b5563" }} className="mx-auto mb-3" />
          <p className="text-sm" style={{ color: "#6b7280" }}>No integrity report yet. Run a check to evaluate candle data.</p>
        </div>
      )}
    </div>
  );
}
