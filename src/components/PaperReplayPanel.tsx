import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Activity } from "lucide-react";
import {
  runPaperReplay,
  explainReplayResult,
  type ReplayResult,
} from "@/lib/paperReplayEngine";
import {
  buildReplayWindows,
  summarizeReplayWindows,
  explainReplayDataset,
  type ReplayDatasetSummary,
} from "@/lib/replayDataset";
import {
  getCandleStoreMap,
  buildCandleStoreReplayWindows,
  summarizeCandleStore,
  type CandleStoreSummary,
  type HistoricalReplayWindow,
} from "@/lib/candleStore";

export default function PaperReplayPanel() {
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [datasetSummary, setDatasetSummary] = useState<ReplayDatasetSummary | null>(null);
  const [candleStoreSummary, setCandleStoreSummary] = useState<CandleStoreSummary | null>(null);
  const [candleWindows, setCandleWindows] = useState<HistoricalReplayWindow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    try {
      const r = runPaperReplay();
      setResult(r);
      try {
        const windows = buildReplayWindows();
        setDatasetSummary(summarizeReplayWindows(windows));
      } catch {
        setDatasetSummary(null);
      }
      try {
        const map = getCandleStoreMap();
        setCandleStoreSummary(summarizeCandleStore(map));
        const symbols = [...map.keys()].map((k) => k.split("|")[0]);
        const uniqueSymbols = [...new Set(symbols)];
        setCandleWindows(buildCandleStoreReplayWindows(map, uniqueSymbols, "LONG"));
      } catch {
        setCandleStoreSummary(null);
        setCandleWindows([]);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(refresh, 0);
    const handler = () => refresh();
    window.addEventListener("visibilitychange", handler);
    window.addEventListener("focus", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("visibilitychange", handler);
      window.removeEventListener("focus", handler);
      window.removeEventListener("storage", handler);
      clearTimeout(id);
    };
  }, [refresh]);

  const summary = result?.summary;
  const steps = result?.steps ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-amber-400" />
          <h3 className="text-sm font-semibold text-gray-200">Paper Replay Proof</h3>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400 transition-colors hover:text-gray-200 disabled:opacity-50"
          style={{ border: "1px solid rgba(201,215,227,0.08)" }}
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {summary ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Total Decisions" value={String(summary.totalSteps)} />
            <Metric label="Symbols" value={String(summary.totalSymbols)} />
            <Metric label="Confidence" value={summary.confidenceLabel} highlight={summary.confidenceLabel === "HIGH"} />
            <Metric
              label="Win Rate"
              value={summary.measurableWinRate !== null ? `${summary.measurableWinRate.toFixed(1)}%` : "--"}
              highlight={summary.measurableWinRate !== null && summary.measurableWinRate >= 60}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Review" value={String(summary.reviewCount)} />
            <Metric label="Watch" value={String(summary.watchCount)} />
            <Metric label="Wait" value={String(summary.waitCount)} />
            <Metric label="Ignore" value={String(summary.ignoreCount)} />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Favorable" value={String(summary.favorableCount)} highlight={summary.favorableCount > 0} />
            <Metric label="Unfavorable" value={String(summary.unfavorableCount)} />
            <Metric label="Flat" value={String(summary.flatCount)} />
            <Metric label="Unavailable" value={String(summary.unavailableCount)} />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Metric label="Avg Move" value={summary.averageMovePct !== null ? `${summary.averageMovePct.toFixed(2)}%` : "--"} />
            <Metric label="Best Symbol" value={summary.bestSymbol ?? "--"} />
            <Metric label="Worst Symbol" value={summary.worstSymbol ?? "--"} />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Metric label="Blocked" value={String(summary.blockedCount)} />
            <Metric label="Missing Data" value={String(summary.missingDataCount)} />
            <Metric label="Pending" value={String(summary.pendingCount)} />
          </div>

          <div className="rounded-lg p-3 text-xs leading-5" style={{ backgroundColor: "rgba(245, 158, 11, 0.04)", border: "1px solid rgba(245, 158, 11, 0.1)" }}>
            <p style={{ color: "#9ca3af" }}>{explainReplayResult(summary)}</p>
          </div>

          {datasetSummary && datasetSummary.totalWindows > 0 && (
            <div className="rounded-lg p-3 space-y-3" style={{ backgroundColor: "rgba(99, 102, 241, 0.03)", border: "1px solid rgba(99, 102, 241, 0.1)" }}>
              <div className="text-xs font-semibold" style={{ color: "#818cf8" }}>Replay Windows Dataset</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Windows Scanned" value={String(datasetSummary.totalWindows)} />
                <Metric label="Measurable" value={String(datasetSummary.measurableWindows)} />
                <Metric label="Unavailable" value={String(datasetSummary.unavailableWindows)} />
                <Metric label="Symbols" value={String(datasetSummary.symbolsScanned)} />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Favorable" value={String(datasetSummary.favorableCount)} highlight={datasetSummary.favorableCount > 0} />
                <Metric label="Unfavorable" value={String(datasetSummary.unfavorableCount)} />
                <Metric label="Flat" value={String(datasetSummary.flatCount)} />
                <Metric label="Avg Move" value={datasetSummary.averageMovePct !== null ? datasetSummary.averageMovePct.toFixed(2) + "%" : "--"} />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="15m Windows" value={String(datasetSummary.horizonCounts["15m"])} />
                <Metric label="1h Windows" value={String(datasetSummary.horizonCounts["1h"])} />
                <Metric label="4h Windows" value={String(datasetSummary.horizonCounts["4h"])} />
                <Metric label="Best Symbol" value={datasetSummary.bestSymbol ?? "--"} />
              </div>
              {datasetSummary.bySymbol.length > 0 && (
                <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid rgba(201,215,227,0.05)" }}>
                  <table className="w-full min-w-[600px] border-collapse text-left">
                    <thead style={{ backgroundColor: "#090d13" }}>
                      <tr>
                        {["Symbol", "Total", "Measurable", "Unavailable", "Favorable", "Unfavorable", "Win Rate", "Best Horizon"].map((h) => (
                          <th key={h} className="px-3 py-2 label-upper" style={{ color: "#4b5563", fontSize: 9 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {datasetSummary.bySymbol.map((s) => (
                        <tr key={s.symbol} style={{ borderTop: "1px solid rgba(201,215,227,0.04)" }}>
                          <td className="px-3 py-2 data-mono text-xs" style={{ color: "#9ca3af" }}>{s.symbol}</td>
                          <td className="px-3 py-2 data-mono text-xs" style={{ color: "#6b7280" }}>{s.total}</td>
                          <td className="px-3 py-2 data-mono text-xs" style={{ color: "#9ca3af" }}>{s.measurable}</td>
                          <td className="px-3 py-2 data-mono text-xs" style={{ color: "#6b7280" }}>{s.unavailable}</td>
                          <td className="px-3 py-2 data-mono text-xs" style={{ color: "#22c55e" }}>{s.favorable}</td>
                          <td className="px-3 py-2 data-mono text-xs" style={{ color: "#ef4444" }}>{s.unfavorable}</td>
                          <td className="px-3 py-2 data-mono text-xs" style={{ color: s.winRate !== null && s.winRate >= 60 ? "#22c55e" : "#9ca3af" }}>{s.winRate !== null ? s.winRate.toFixed(0) + "%" : "--"}</td>
                          <td className="px-3 py-2 text-xs" style={{ color: "#6b7280" }}>{s.bestHorizon ?? "--"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="text-xs leading-5" style={{ color: "#9ca3af" }}>
                {explainReplayDataset(datasetSummary)}
              </div>
              {datasetSummary.unavailableWindows > 0 && (
                <div className="text-xs" style={{ color: "#f59e0b" }}>
                  ⚠ {datasetSummary.unavailableWindows} window(s) missing candle data. Run Auto Intelligence Cycle to collect more data.
                </div>
              )}
            </div>
          )}

          {candleStoreSummary && candleStoreSummary.totalCandles > 0 && (
            <div className="rounded-lg p-3 space-y-3" style={{ backgroundColor: "rgba(34, 197, 94, 0.03)", border: "1px solid rgba(34, 197, 94, 0.1)" }}>
              <div className="text-xs font-semibold" style={{ color: "#22c55e" }}>Historical Candle Store</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Total Candles" value={String(candleStoreSummary.totalCandles)} />
                <Metric label="Records" value={String(candleStoreSummary.totalRecords)} />
                <Metric label="15m Candles" value={String(candleStoreSummary.byTimeframe["15m"])} />
                <Metric label="1h Candles" value={String(candleStoreSummary.byTimeframe["1h"])} />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="4h Candles" value={String(candleStoreSummary.byTimeframe["4h"])} />
                <Metric label="Symbols" value={String(candleStoreSummary.bySymbol.length)} />
                <Metric label="Oldest" value={candleStoreSummary.oldestCandle ? new Date(candleStoreSummary.oldestCandle).toLocaleDateString() : "--"} />
                <Metric label="Newest" value={candleStoreSummary.newestCandle ? new Date(candleStoreSummary.newestCandle).toLocaleDateString() : "--"} />
              </div>
              {candleStoreSummary.bySymbol.length > 0 && (
                <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid rgba(201,215,227,0.05)" }}>
                  <table className="w-full min-w-[500px] border-collapse text-left">
                    <thead style={{ backgroundColor: "#090d13" }}>
                      <tr>
                        {["Symbol", "15m", "1h", "4h", "Total"].map((h) => (
                          <th key={h} className="px-3 py-2 label-upper" style={{ color: "#4b5563", fontSize: 9 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {candleStoreSummary.bySymbol.map((s) => (
                        <tr key={s.symbol} style={{ borderTop: "1px solid rgba(201,215,227,0.04)" }}>
                          <td className="px-3 py-2 data-mono text-xs" style={{ color: "#9ca3af" }}>{s.symbol}</td>
                          <td className="px-3 py-2 data-mono text-xs" style={{ color: "#6b7280" }}>{s["15m"]}</td>
                          <td className="px-3 py-2 data-mono text-xs" style={{ color: "#6b7280" }}>{s["1h"]}</td>
                          <td className="px-3 py-2 data-mono text-xs" style={{ color: "#6b7280" }}>{s["4h"]}</td>
                          <td className="px-3 py-2 data-mono text-xs" style={{ color: "#9ca3af" }}>{s.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {candleWindows.length > 0 && (
                <div className="text-xs" style={{ color: "#6b7280" }}>
                  {candleWindows.filter((w) => w.available).length} measurable historical windows from candle store.
                  {candleWindows.filter((w) => !w.available).length > 0 && (
                    <span style={{ color: "#f59e0b" }}> {candleWindows.filter((w) => !w.available).length} unavailable.</span>
                  )}
                </div>
              )}
            </div>
          )}

          {steps.length > 0 && (
            <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid rgba(201,215,227,0.05)" }}>
              <table className="w-full min-w-[800px] border-collapse text-left">
                <thead style={{ backgroundColor: "#090d13" }}>
                  <tr>
                    {["Symbol", "Time", "Integrity", "Signal", "Candidate", "Decision", "Outcome", "Ref Price", "Move %", "Favorable"].map((h) => (
                      <th key={h} className="px-3 py-3 label-upper" style={{ color: "#4b5563", fontSize: 9 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {steps.slice(0, 50).map((s, i) => (
                    <tr key={i} style={{ borderTop: "1px solid rgba(201,215,227,0.04)" }}>
                      <td className="px-3 py-3 data-mono text-xs" style={{ color: "#9ca3af" }}>{s.symbol}</td>
                      <td className="px-3 py-3 text-[10px]" style={{ color: "#4b5563" }}>{new Date(s.timestamp).toLocaleString()}</td>
                      <td className="px-3 py-3 data-mono text-xs" style={{ color: s.integrityScore !== null && s.integrityScore >= 70 ? "#22c55e" : s.integrityScore !== null && s.integrityScore >= 40 ? "#f59e0b" : "#6b7280" }}>{s.integrityScore !== null ? s.integrityScore.toFixed(0) : "--"}</td>
                      <td className="px-3 py-3 data-mono text-xs" style={{ color: s.signalScore !== null && s.signalScore >= 70 ? "#22c55e" : s.signalScore !== null && s.signalScore >= 50 ? "#f59e0b" : "#6b7280" }}>{s.signalScore !== null ? s.signalScore.toFixed(0) : "--"}</td>
                      <td className="px-3 py-3 text-xs uppercase" style={{ color: "#6b7280" }}>{s.candidateStatus ?? "--"}</td>
                      <td className="px-3 py-3 text-xs uppercase" style={{ color: s.decisionAction === "REVIEW" ? "#22c55e" : s.decisionAction === "WATCH" ? "#f59e0b" : "#6b7280" }}>{s.decisionAction ?? "--"}</td>
                      <td className="px-3 py-3 text-xs uppercase" style={{ color: s.outcomeStatus === "WIN" || s.outcomeStatus === "CONFIRMED" ? "#22c55e" : s.outcomeStatus === "LOSS" || s.outcomeStatus === "INVALIDATED" ? "#ef4444" : "#6b7280" }}>{s.outcomeStatus ?? "--"}</td>
                      <td className="px-3 py-3 data-mono text-xs" style={{ color: "#6b7280" }}>{s.referencePrice !== null ? s.referencePrice.toFixed(2) : "--"}</td>
                      <td className="px-3 py-3 data-mono text-xs" style={{ color: s.movePct !== null && s.movePct > 0 ? "#22c55e" : s.movePct !== null && s.movePct < 0 ? "#ef4444" : "#6b7280" }}>{s.movePct !== null ? s.movePct.toFixed(2) + "%" : "--"}</td>
                      <td className="px-3 py-3 text-xs" style={{ color: s.favorable === true ? "#22c55e" : s.favorable === false ? "#ef4444" : "#6b7280" }}>{s.favorable === true ? "Yes" : s.favorable === false ? "No" : "--"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-start gap-2 text-xs leading-5" style={{ color: "#5f6977" }}>
            <p>No wallet connection. No real trades. Paper-only tracking. Not financial advice.</p>
          </div>
        </>
      ) : (
        <div className="rounded-lg p-4 text-center" style={{ border: "1px dashed rgba(201,215,227,0.1)" }}>
          <p className="text-sm" style={{ color: "#6b7280" }}>No replay data available.</p>
          <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>Run the Auto Intelligence Cycle to generate historical data for replay analysis.</p>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md p-2" style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(201,215,227,0.04)" }}>
      <div className="label-upper" style={{ color: "#4b5563", fontSize: 9 }}>{label}</div>
      <div className="mt-1 data-mono text-sm" style={{ color: highlight ? "#22c55e" : "#9ca3af" }}>{value}</div>
    </div>
  );
}
