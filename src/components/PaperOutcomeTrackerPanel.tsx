import { useState, useMemo, useEffect, useCallback } from "react";
import { Activity, TrendingUp, TrendingDown, Minus, Clock, Ban, AlertCircle } from "lucide-react";
import {
  loadPaperOutcomeHistory,
  buildPaperOutcomeSummary,
  filterPaperOutcomes,
  sortPaperOutcomes,
  type OutcomeResult,
  type OutcomeFilter,
  buildPaperOutcomeSymbolSummary,
} from "@/lib/paperOutcomeTracker";

function outcomeColor(outcome: OutcomeResult): string {
  if (outcome === "WIN") return "#22c55e";
  if (outcome === "LOSS") return "#ef4444";
  if (outcome === "FLAT") return "#a78b63";
  if (outcome === "PENDING") return "#f59e0b";
  if (outcome === "BLOCKED") return "#ef4444";
  if (outcome === "NO_ACTION") return "#6b7280";
  if (outcome === "UNAVAILABLE") return "#4b5563";
  return "#9ca3af";
}

function outcomeIcon(outcome: OutcomeResult, size = 12) {
  if (outcome === "WIN") return <TrendingUp size={size} style={{ color: outcomeColor(outcome) }} />;
  if (outcome === "LOSS") return <TrendingDown size={size} style={{ color: outcomeColor(outcome) }} />;
  if (outcome === "FLAT") return <Minus size={size} style={{ color: outcomeColor(outcome) }} />;
  if (outcome === "PENDING") return <Clock size={size} style={{ color: outcomeColor(outcome) }} />;
  if (outcome === "BLOCKED") return <Ban size={size} style={{ color: outcomeColor(outcome) }} />;
  if (outcome === "NO_ACTION") return <Minus size={size} style={{ color: outcomeColor(outcome) }} />;
  return <AlertCircle size={size} style={{ color: outcomeColor(outcome) }} />;
}

const FILTERS: (OutcomeFilter)[] = ["ALL", "WIN", "LOSS", "FLAT", "PENDING", "NO_ACTION", "BLOCKED", "UNAVAILABLE"];

export default function PaperOutcomeTrackerPanel() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date().toISOString());

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setLastRefreshed(new Date().toISOString());
  }, []);

  // Refresh on visibility/focus
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", handler);
    window.addEventListener("focus", handler);
    return () => {
      document.removeEventListener("visibilitychange", handler);
      window.removeEventListener("focus", handler);
    };
  }, [refresh]);

  // Refresh on storage event from other tabs
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "chanter-paper-outcome-history") refresh();
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [refresh]);

  const records = useMemo(() => {
    void refreshKey; // trigger re-read on refresh
    return loadPaperOutcomeHistory();
  }, [refreshKey]);
  const summary = useMemo(() => buildPaperOutcomeSummary(records), [records]);
  const symbolSummaries = useMemo(() => buildPaperOutcomeSymbolSummary(records), [records]);
  const [filter, setFilter] = useState<OutcomeFilter>("ALL");

  const filtered = useMemo(() => {
    const sorted = sortPaperOutcomes(records);
    if (filter === "ALL") return sorted;
    return filterPaperOutcomes(sorted, filter);
  }, [records, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: records.length, WIN: 0, LOSS: 0, FLAT: 0, PENDING: 0, NO_ACTION: 0, BLOCKED: 0, UNAVAILABLE: 0 };
    for (const r of records) c[r.outcomeStatus]++;
    return c;
  }, [records]);

  return (
    <section
      className="card-surface mt-8 rounded-xl p-5 lg:p-6"
      style={{ border: "1px solid rgba(201,215,227,0.06)" }}
      aria-labelledby="paper-outcome-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Activity size={16} style={{ color: "#cc9258" }} />
            <h3 id="paper-outcome-title" className="section-title" style={{ fontSize: 22 }}>
              Paper Outcome Tracker
            </h3>
          </div>
          <p className="text-xs" style={{ color: "#6b7280" }}>
            Read-only forward outcome proof for ranked opportunities
          </p>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.08em]"
          style={{ color: "#cc9258", border: "1px solid rgba(204,146,88,0.24)" }}
        >
          Proof only -- no execution
        </span>
      </div>

      <div
        className="mt-5 rounded-lg p-4"
        style={{ backgroundColor: "rgba(201,215,227,0.02)", border: "1px solid rgba(201,215,227,0.05)" }}
      >
        <p className="text-xs" style={{ color: "#9ca3af" }}>Proof-only outcome tracking. No trades. No positions. Not financial advice.</p>
        <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>Outcomes are computed from available candle data after candidates appear. Missing data is marked UNAVAILABLE or PENDING, never fabricated.</p>
      </div>

      {records.length > 0 ? (
        <>
          {/* Summary cards */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
            <div className="rounded-lg p-3" style={{ background: "rgba(201,215,227,0.03)" }}>
              <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Tracked</p>
              <p className="data-mono text-lg" style={{ color: "#c9d7e3" }}>{summary.total}</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: "rgba(201,215,227,0.03)" }}>
              <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Pending</p>
              <p className="data-mono text-lg" style={{ color: "#f59e0b" }}>{summary.pending}</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: "rgba(201,215,227,0.03)" }}>
              <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Wins</p>
              <p className="data-mono text-lg" style={{ color: "#22c55e" }}>{summary.wins}</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: "rgba(201,215,227,0.03)" }}>
              <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Losses</p>
              <p className="data-mono text-lg" style={{ color: "#ef4444" }}>{summary.losses}</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: "rgba(201,215,227,0.03)" }}>
              <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Flat</p>
              <p className="data-mono text-lg" style={{ color: "#a78b63" }}>{summary.flat}</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: "rgba(201,215,227,0.03)" }}>
              <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Blocked/NA</p>
              <p className="data-mono text-lg" style={{ color: "#6b7280" }}>{summary.blocked + summary.noAction}</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: "rgba(201,215,227,0.03)" }}>
              <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Win rate</p>
              <p className="data-mono text-lg" style={{ color: summary.winRate >= 50 ? "#22c55e" : "#f59e0b" }}>
                {summary.measurable > 0 ? summary.winRate.toFixed(1) + "%" : "--"}
              </p>
            </div>
            <div className="rounded-lg p-3" style={{ background: "rgba(201,215,227,0.03)" }}>
              <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Avg move</p>
              <p className="data-mono text-lg" style={{ color: "#9ca3af" }}>
                {summary.avgChangePct !== null ? summary.avgChangePct.toFixed(2) + "%" : "--"}
              </p>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            {FILTERS.map((opt) => (
              <span
                key={opt}
                className="rounded px-2 py-0.5 text-[10px] uppercase tracking-[0.04em]"
                style={{
                  color: filter === opt ? "#cc9258" : "#4b5563",
                  border: filter === opt ? "1px solid rgba(204,146,88,0.3)" : "1px solid transparent",
                  background: filter === opt ? "rgba(204,146,88,0.06)" : "transparent",
                  cursor: "pointer",
                }}
                onClick={() => setFilter(opt)}
              >
                {opt} ({counts[opt] ?? 0})
              </span>
            ))}
          </div>

          {/* Main table */}
          {filtered.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-lg" style={{ border: "1px solid rgba(201,215,227,0.05)" }}>
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead style={{ backgroundColor: "#090d13" }}>
                  <tr>
                    {["Symbol", "Action", "Direction", "Score", "Baseline", "Latest", "Change", "15m", "1h", "4h", "Reason"].map((h) => (
                      <th key={h} className="px-3 py-3 label-upper" style={{ color: "#4b5563", fontSize: 9 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((record) => (
                    <tr key={record.id} style={{ borderTop: "1px solid rgba(201,215,227,0.04)" }}>
                      <td className="px-3 py-3 data-mono text-xs" style={{ color: "#9ca3af" }}>{record.symbol}</td>
                      <td className="px-3 py-3 text-xs uppercase" style={{ color: "#9ca3af" }}>{record.action}</td>
                      <td className="px-3 py-3 text-xs uppercase" style={{ color: "#9ca3af" }}>{record.direction}</td>
                      <td className="px-3 py-3 data-mono text-xs" style={{ color: "#9ca3af" }}>{record.rankScore}</td>
                      <td className="px-3 py-3 data-mono text-xs" style={{ color: "#6b7280" }}>
                        {record.baselinePrice !== null ? record.baselinePrice.toFixed(2) : "--"}
                      </td>
                      <td className="px-3 py-3 data-mono text-xs" style={{ color: "#6b7280" }}>
                        {record.latestPrice !== null ? record.latestPrice.toFixed(2) : "--"}
                      </td>
                      <td className="px-3 py-3 data-mono text-xs" style={{ color: record.changePct !== null && record.changePct > 0 ? "#22c55e" : record.changePct !== null && record.changePct < 0 ? "#ef4444" : "#6b7280" }}>
                        {record.changePct !== null ? record.changePct.toFixed(2) + "%" : "--"}
                      </td>
                      <td className="px-3 py-3">{outcomeIcon(record.outcome15m)}</td>
                      <td className="px-3 py-3">{outcomeIcon(record.outcome1h)}</td>
                      <td className="px-3 py-3">{outcomeIcon(record.outcome4h)}</td>
                      <td className="px-3 py-3 text-[10px]" style={{ color: "#6b7280", maxWidth: 200 }}>{record.outcomeSummary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="mt-6 rounded-lg p-7 text-center" style={{ border: "1px dashed rgba(201,215,227,0.1)" }}>
          <Activity size={16} className="mx-auto mb-2" style={{ color: "#4b5563" }} />
          <p className="text-sm" style={{ color: "#9ca3af" }}>No paper outcomes yet.</p>
          <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>Start the Auto Intelligence Cycle and wait for candidates to mature.</p>
        </div>
      )}

      {/* Per-symbol summary table */}
      {symbolSummaries.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-[10px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Per-Symbol Summary</p>
          <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid rgba(201,215,227,0.05)" }}>
            <table className="w-full min-w-[600px] border-collapse text-left">
              <thead style={{ backgroundColor: "#090d13" }}>
                <tr>
                  {["Symbol", "Total", "Win rate", "Avg move", "Pending", "Latest outcome"].map((h) => (
                    <th key={h} className="px-3 py-3 label-upper" style={{ color: "#4b5563", fontSize: 9 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {symbolSummaries.map((s) => (
                  <tr key={s.symbol} style={{ borderTop: "1px solid rgba(201,215,227,0.04)" }}>
                    <td className="px-3 py-3 data-mono text-xs" style={{ color: "#9ca3af" }}>{s.symbol}</td>
                    <td className="px-3 py-3 data-mono text-xs" style={{ color: "#9ca3af" }}>{s.total}</td>
                    <td className="px-3 py-3 data-mono text-xs" style={{ color: s.measurableWinRate >= 50 ? "#22c55e" : "#f59e0b" }}>
                      {s.measurable > 0 ? s.measurableWinRate.toFixed(1) + "%" : "--"}
                    </td>
                    <td className="px-3 py-3 data-mono text-xs" style={{ color: "#9ca3af" }}>
                      {s.averageMovePct !== null ? s.averageMovePct.toFixed(2) + "%" : "--"}
                    </td>
                    <td className="px-3 py-3 data-mono text-xs" style={{ color: "#f59e0b" }}>{s.pending}</td>
                    <td className="px-3 py-3 text-[10px]" style={{ color: "#6b7280" }}>{s.latestOutcomeAt ?? "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Last refreshed */}
      <p className="mt-3 text-[10px]" style={{ color: "#4b5563" }}>Last refreshed: {new Date(lastRefreshed).toLocaleTimeString()}</p>
    </section>
  );
}
