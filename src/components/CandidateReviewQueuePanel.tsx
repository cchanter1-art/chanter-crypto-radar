import { useState } from "react";
import { CheckCircle, Eye, Trash2, XCircle, ListChecks } from "lucide-react";
import {
  loadCandidateReviewQueue,
  markCandidateReviewed,
  dismissCandidate,
  clearDismissedCandidates,
  clearCandidateReviewQueue,
  getCandidateSummary,
  type CandidateReviewRecord,
  type CandidateStatus,
} from "@/lib/candidateReviewQueue";

function statusColor(status: CandidateStatus): string {
  if (status === "REVIEW") return "#22c55e";
  if (status === "WATCH") return "#f59e0b";
  if (status === "BLOCKED") return "#ef4444";
  if (status === "STALE") return "#a78b63";
  if (status === "DISMISSED") return "#4b5563";
  return "#9ca3af";
}

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

function formatTimestamp(value: string | null): string {
  if (!value) return "N/A";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function CandidateReviewQueuePanel() {
  const [records, setRecords] = useState<CandidateReviewRecord[]>(loadCandidateReviewQueue);
  const [reviewNotes] = useState<Record<string, string>>({});

  const summary = getCandidateSummary();
  const activeRecords = records.filter((r) => r.candidateStatus !== "DISMISSED");

  const refresh = () => setRecords(loadCandidateReviewQueue());

  const handleMarkReviewed = (id: string) => {
    const notes = reviewNotes[id] ?? "";
    markCandidateReviewed(id, notes);
    refresh();
  };

  const handleDismiss = (id: string) => {
    dismissCandidate(id);
    refresh();
  };

  const handleClearDismissed = () => {
    if (!window.confirm("Clear all dismissed candidates from the queue?")) return;
    clearDismissedCandidates();
    refresh();
  };

  const handleClearQueue = () => {
    if (!window.confirm("Clear all candidate review records? This cannot be undone.")) return;
    clearCandidateReviewQueue();
    refresh();
  };

  return (
    <section
      className="card-surface mt-8 rounded-xl p-5 lg:p-6"
      style={{ border: "1px solid rgba(201,215,227,0.06)" }}
      aria-labelledby="candidate-review-queue-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <ListChecks size={16} style={{ color: "#cc9258" }} />
            <h3 id="candidate-review-queue-title" className="section-title" style={{ fontSize: 22 }}>
              Candidate Review Queue
            </h3>
          </div>
          <p className="text-xs" style={{ color: "#6b7280" }}>
            Review-only candidate queue from evidence-scored intelligence
          </p>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.08em]"
          style={{ color: "#cc9258", border: "1px solid rgba(204,146,88,0.24)" }}
        >
          Review-only -- paper only
        </span>
      </div>

      <div
        className="mt-5 rounded-lg p-4"
        style={{ backgroundColor: "rgba(201,215,227,0.02)", border: "1px solid rgba(201,215,227,0.05)" }}
      >
        <p className="text-xs" style={{ color: "#9ca3af" }}>Review-only candidate queue. No orders. No paper positions. Not financial advice.</p>
        <p className="mt-1 text-xs" style={{ color: "#6b7280" }}>Candidates are generated from evidence-scored signal quality snapshots.</p>
        <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>No buy, sell, execute, or open-position actions are available.</p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <div className="rounded-lg p-3" style={{ background: "rgba(0,0,0,0.14)" }}>
          <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Total</p>
          <p className="data-mono mt-1 text-lg" style={{ color: "#c9d7e3" }}>{summary.total}</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: "rgba(0,0,0,0.14)" }}>
          <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Review</p>
          <p className="data-mono mt-1 text-lg" style={{ color: "#22c55e" }}>{summary.review}</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: "rgba(0,0,0,0.14)" }}>
          <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Watch</p>
          <p className="data-mono mt-1 text-lg" style={{ color: "#f59e0b" }}>{summary.watch}</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: "rgba(0,0,0,0.14)" }}>
          <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Blocked</p>
          <p className="data-mono mt-1 text-lg" style={{ color: "#ef4444" }}>{summary.blocked}</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: "rgba(0,0,0,0.14)" }}>
          <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Stale</p>
          <p className="data-mono mt-1 text-lg" style={{ color: "#a78b63" }}>{summary.stale}</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: "rgba(0,0,0,0.14)" }}>
          <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Dismissed</p>
          <p className="data-mono mt-1 text-lg" style={{ color: "#4b5563" }}>{summary.dismissed}</p>
        </div>
      </div>

      {summary.latestSymbol && (
        <div className="mt-3 rounded-md p-3" style={{ background: "rgba(0,0,0,0.14)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium" style={{ color: "#9ca3af" }}>Latest: {summary.latestSymbol}</span>
            <span className="data-mono text-[10px]" style={{ color: scoreColor(summary.latestScore ?? 0) }}>Score: {summary.latestScore ?? "N/A"}</span>
            {summary.lastUpdate && (
              <span className="data-mono text-[10px]" style={{ color: "#4b5563" }}>Updated: {formatTimestamp(summary.lastUpdate)}</span>
            )}
          </div>
        </div>
      )}

      {activeRecords.length > 0 ? (
        <div className="mt-5 overflow-x-auto rounded-lg" style={{ border: "1px solid rgba(201,215,227,0.05)" }}>
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead style={{ backgroundColor: "#090d13" }}>
              <tr>
                {["Symbol", "Status", "Score", "Direction", "Completeness", "Readiness", "Risk", "Candle", "Reason", "Actions"].map((h) => (
                  <th key={h} className="px-3 py-3 label-upper" style={{ color: "#4b5563", fontSize: 9 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeRecords.map((record) => (
                <tr key={record.id} style={{ borderTop: "1px solid rgba(201,215,227,0.04)" }}>
                  <td className="px-3 py-3 data-mono text-xs" style={{ color: "#9ca3af" }}>{record.symbol}</td>
                  <td className="px-3 py-3 text-xs uppercase" style={{ color: statusColor(record.candidateStatus) }}>{record.candidateStatus}</td>
                  <td className="px-3 py-3 data-mono text-xs" style={{ color: scoreColor(record.finalScore) }}>{record.finalScore}</td>
                  <td className="px-3 py-3 text-xs" style={{ color: "#9ca3af" }}>{record.direction}</td>
                  <td className="px-3 py-3 text-xs" style={{ color: "#9ca3af" }}>{record.evidenceCompleteness}</td>
                  <td className="px-3 py-3 text-xs" style={{ color: "#9ca3af" }}>{record.integrityReadiness.replace(/_/g, " ")}</td>
                  <td className="px-3 py-3 text-xs" style={{ color: "#9ca3af" }}>{record.riskStatus}</td>
                  <td className="px-3 py-3 data-mono text-[10px]" style={{ color: "#4b5563" }}>{formatTimestamp(record.latestCandleAt)}</td>
                  <td className="px-3 py-3 text-[10px]" style={{ color: "#6b7280", maxWidth: 200 }}>{record.reasonSummary}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleMarkReviewed(record.id)}
                        className="rounded p-1 transition-colors hover:bg-white/[0.06]"
                        title="Mark reviewed"
                      >
                        <CheckCircle size={13} style={{ color: record.reviewedAt ? "#22c55e" : "#4b5563" }} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDismiss(record.id)}
                        className="rounded p-1 transition-colors hover:bg-white/[0.06]"
                        title="Dismiss"
                      >
                        <XCircle size={13} style={{ color: "#4b5563" }} />
                      </button>
                    </div>
                    {record.reviewedAt && (
                      <p className="mt-1 text-[9px]" style={{ color: "#4b5563" }}>Reviewed {formatTimestamp(record.reviewedAt)}</p>
                    )}
                    {record.reviewNotes && (
                      <p className="text-[9px]" style={{ color: "#6b7280" }}>{record.reviewNotes}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6 rounded-lg p-7 text-center" style={{ border: "1px dashed rgba(201,215,227,0.1)" }}>
          <Eye size={16} className="mx-auto mb-2" style={{ color: "#4b5563" }} />
          <p className="text-sm" style={{ color: "#9ca3af" }}>No active review candidates.</p>
          <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>Start the Auto Intelligence Cycle to generate evidence-scored candidates.</p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={handleClearDismissed} className="btn-primary flex items-center gap-2" disabled={summary.dismissed === 0}>
          <Trash2 size={13} /> Clear dismissed
        </button>
        <button type="button" onClick={handleClearQueue} className="btn-danger flex items-center gap-2" disabled={records.length === 0}>
          <Trash2 size={13} /> Clear queue
        </button>
      </div>
    </section>
  );
}
