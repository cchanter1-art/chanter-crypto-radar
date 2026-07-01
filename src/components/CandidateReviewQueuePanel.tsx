import { useState, useMemo, useCallback } from "react";
import { CheckCircle, Eye, Trash2, XCircle, ListChecks, Filter, ArrowUpDown } from "lucide-react";
import {
  loadCandidateReviewQueue,
  markCandidateReviewed,
  dismissCandidate,
  clearDismissedCandidates,
  clearCandidateReviewQueue,
  getCandidateSummary,
  filterCandidates,
  sortCandidates,
  explainCandidateDecision,
  getTopReasonCode,
  type CandidateReviewRecord,
  type CandidateStatus,
  type CandidateFilter,
  type CandidateSort,
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

const REASON_LABELS: Record<string, string> = {
  RISK_BLOCKED: "Risk-blocked",
  LOW_FINAL_SCORE: "Low score",
  INTEGRITY_BLOCKED: "Integrity blocked",
  INTEGRITY_STALE: "Stale data",
  EVIDENCE_MISSING: "Missing evidence",
  WAIT_DIRECTION: "WAIT direction",
  REVIEW_READY: "Review ready",
  WATCH_ONLY: "Watch only",
  UNKNOWN_CONSERVATIVE: "Conservative",
};

const FILTER_OPTIONS: CandidateFilter[] = ["ALL", "REVIEW", "WATCH", "STALE", "BLOCKED", "DISMISSED"];
const SORT_OPTIONS: { value: CandidateSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "score-high", label: "Score: high to low" },
  { value: "score-low", label: "Score: low to high" },
  { value: "status-priority", label: "Status priority" },
];

export default function CandidateReviewQueuePanel() {
  const [records, setRecords] = useState<CandidateReviewRecord[]>(loadCandidateReviewQueue);
  const [filter, setFilter] = useState<CandidateFilter>("ALL");
  const [sort, setSort] = useState<CandidateSort>("newest");
  const [reviewNotesMap, setReviewNotesMap] = useState<Record<string, string>>({});
  const [dismissReasonMap, setDismissReasonMap] = useState<Record<string, string>>({});
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const summary = useMemo(() => getCandidateSummary(), []);

  const topReason = useMemo(() => {
    const active = records.filter((r) => r.candidateStatus !== "DISMISSED");
    const code = getTopReasonCode(active);
    if (!code) return null;
    return { code, label: REASON_LABELS[code] ?? code };
  }, [records]);

  const filteredSorted = useMemo(() => {
    const filtered = filterCandidates(records, filter);
    return sortCandidates(filtered, sort);
  }, [records, filter, sort]);

  const refresh = useCallback(() => setRecords(loadCandidateReviewQueue()), []);

  const handleMarkReviewed = useCallback((id: string) => {
    const notes = reviewNotesMap[id] ?? "";
    markCandidateReviewed(id, notes);
    setActiveNoteId(null);
    refresh();
  }, [reviewNotesMap, refresh]);

  const handleDismiss = useCallback((id: string) => {
    const reason = dismissReasonMap[id] ?? "";
    dismissCandidate(id, reason);
    setActiveNoteId(null);
    refresh();
  }, [dismissReasonMap, refresh]);

  const handleClearDismissed = useCallback(() => {
    if (!window.confirm("Clear all dismissed candidates from the queue?")) return;
    clearDismissedCandidates();
    refresh();
  }, [refresh]);

  const handleClearQueue = useCallback(() => {
    if (!window.confirm("Clear all candidate review records? This cannot be undone.")) return;
    clearCandidateReviewQueue();
    refresh();
  }, [refresh]);

  const filterCounts = useMemo(() => {
    const counts: Record<CandidateFilter, number> = { ALL: records.length, REVIEW: 0, WATCH: 0, STALE: 0, BLOCKED: 0, DISMISSED: 0 };
    for (const r of records) {
      counts[r.candidateStatus]++;
    }
    return counts;
  }, [records]);

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
          Review-only -- no execution
        </span>
      </div>

      <div
        className="mt-5 rounded-lg p-4"
        style={{ backgroundColor: "rgba(201,215,227,0.02)", border: "1px solid rgba(201,215,227,0.05)" }}
      >
        <p className="text-xs" style={{ color: "#9ca3af" }}>Review-only candidate queue. No orders. No paper positions. Not financial advice.</p>
        <p className="mt-1 text-xs" style={{ color: "#6b7280" }}>Candidates are generated from evidence-scored signal quality snapshots across tracked symbols.</p>
        <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>No buy, sell, execute, or open-position actions are available.</p>
      </div>

      {/* Summary cards */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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

      {/* Top reason summary */}
      {topReason && (
        <div className="mt-3 rounded-md p-3" style={{ background: "rgba(0,0,0,0.10)" }}>
          <span className="text-[10px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Most common reason: </span>
          <span className="text-[10px] font-medium" style={{ color: topReason.code === "REVIEW_READY" ? "#22c55e" : "#f59e0b" }}>{topReason.label}</span>
        </div>
      )}

      {/* Latest candidate */}
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

      {/* Filters + Sort */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Filter size={12} style={{ color: "#4b5563" }} />
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setFilter(opt)}
              className="rounded px-2 py-0.5 text-[10px] uppercase tracking-[0.04em] transition-colors"
              style={{
                color: filter === opt ? "#cc9258" : "#4b5563",
                border: filter === opt ? "1px solid rgba(204,146,88,0.3)" : "1px solid transparent",
                background: filter === opt ? "rgba(204,146,88,0.06)" : "transparent",
              }}
            >
              {opt} ({filterCounts[opt]})
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <ArrowUpDown size={12} style={{ color: "#4b5563" }} />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as CandidateSort)}
            className="rounded border-0 bg-transparent text-[10px] uppercase tracking-[0.04em] outline-none"
            style={{ color: "#9ca3af", background: "rgba(0,0,0,0.14)" }}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} style={{ color: "#c9d7e3", background: "#0a0e14" }}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {filteredSorted.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-lg" style={{ border: "1px solid rgba(201,215,227,0.05)" }}>
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead style={{ backgroundColor: "#090d13" }}>
              <tr>
                {["Symbol", "Status", "Score", "Direction", "Completeness", "Readiness", "Risk", "Candle", "Reason", "Actions"].map((h) => (
                  <th key={h} className="px-3 py-3 label-upper" style={{ color: "#4b5563", fontSize: 9 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredSorted.map((record) => {
                const exp = explainCandidateDecision(record);
                return (
                  <div key={record.id}>
                    <tr style={{ borderTop: "1px solid rgba(201,215,227,0.04)" }}>
                      <td className="px-3 py-3 data-mono text-xs" style={{ color: "#9ca3af" }}>{record.symbol}</td>
                      <td className="px-3 py-3 text-xs uppercase" style={{ color: statusColor(record.candidateStatus) }}>{record.candidateStatus}</td>
                      <td className="px-3 py-3 data-mono text-xs" style={{ color: scoreColor(record.finalScore) }}>{record.finalScore}</td>
                      <td className="px-3 py-3 text-xs" style={{ color: "#9ca3af" }}>{record.direction}</td>
                      <td className="px-3 py-3 text-xs" style={{ color: "#9ca3af" }}>{record.evidenceCompleteness}</td>
                      <td className="px-3 py-3 text-xs" style={{ color: "#9ca3af" }}>{record.integrityReadiness.replace(/_/g, " ")}</td>
                      <td className="px-3 py-3 text-xs" style={{ color: "#9ca3af" }}>{record.riskStatus}</td>
                      <td className="px-3 py-3 data-mono text-[10px]" style={{ color: "#4b5563" }}>{formatTimestamp(record.latestCandleAt)}</td>
                      <td className="px-3 py-3 text-[10px]" style={{ color: exp.severity === "blocked" ? "#ef4444" : exp.severity === "warning" ? "#f59e0b" : "#22c55e", maxWidth: 180 }}>{exp.shortSummary}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                            className="rounded p-1 transition-colors hover:bg-white/[0.06]"
                            title="Toggle explanation"
                          >
                            <Eye size={13} style={{ color: expandedId === record.id ? "#cc9258" : "#4b5563" }} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveNoteId(activeNoteId === record.id ? null : record.id)}
                            className="rounded p-1 transition-colors hover:bg-white/[0.06]"
                            title="Review / dismiss with notes"
                          >
                            <ListChecks size={13} style={{ color: activeNoteId === record.id ? "#cc9258" : "#4b5563" }} />
                          </button>
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
                        {record.dismissReason && (
                          <p className="text-[9px]" style={{ color: "#6b7280" }}>Dismissed: {record.dismissReason}</p>
                        )}
                      </td>
                    </tr>
                    {expandedId === record.id && (
                      <tr style={{ borderTop: "1px solid rgba(204,146,88,0.10)" }}>
                        <td colSpan={10} className="px-4 py-3" style={{ background: "rgba(0,0,0,0.08)" }}>
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <div>
                              <p className="text-[9px] uppercase tracking-[0.06em] mb-1" style={{ color: "#4b5563" }}>Primary Reason</p>
                              <p className="text-xs font-medium" style={{ color: exp.severity === "blocked" ? "#ef4444" : exp.severity === "warning" ? "#f59e0b" : "#22c55e" }}>{exp.primaryReasonLabel}</p>
                              <p className="mt-1 text-[10px] leading-4" style={{ color: "#6b7280" }}>{exp.explanation}</p>
                            </div>
                            <div>
                              <p className="text-[9px] uppercase tracking-[0.06em] mb-1" style={{ color: "#4b5563" }}>Blocking Factors</p>
                              {exp.blockingFactors.length > 0 ? (
                                exp.blockingFactors.map((f, i) => <p key={i} className="text-[10px]" style={{ color: "#ef4444" }}>- {f}</p>)
                              ) : (
                                <p className="text-[10px]" style={{ color: "#4b5563" }}>None</p>
                              )}
                            </div>
                            <div>
                              <p className="text-[9px] uppercase tracking-[0.06em] mb-1" style={{ color: "#4b5563" }}>Missing Evidence</p>
                              {exp.missingEvidence.length > 0 ? (
                                exp.missingEvidence.map((f, i) => <p key={i} className="text-[10px]" style={{ color: "#f59e0b" }}>- {f}</p>)
                              ) : (
                                <p className="text-[10px]" style={{ color: "#4b5563" }}>None</p>
                              )}
                            </div>
                            <div>
                              <p className="text-[9px] uppercase tracking-[0.06em] mb-1" style={{ color: "#4b5563" }}>Positive Factors</p>
                              {exp.positiveFactors.length > 0 ? (
                                exp.positiveFactors.map((f, i) => <p key={i} className="text-[10px]" style={{ color: "#22c55e" }}>- {f}</p>)
                              ) : (
                                <p className="text-[10px]" style={{ color: "#4b5563" }}>None</p>
                              )}
                            </div>
                            <div className="sm:col-span-2">
                              <p className="text-[9px] uppercase tracking-[0.06em] mb-1" style={{ color: "#4b5563" }}>Promotion Checklist (to reach REVIEW)</p>
                              <div className="grid gap-1 sm:grid-cols-2">
                                {exp.promotionChecklist.map((item, i) => (
                                  <div key={i} className="flex items-start gap-1.5">
                                    <span className="text-[10px]" style={{ color: item.passed ? "#22c55e" : "#ef4444" }}>{item.passed ? "[x]" : "[ ]"}</span>
                                    <div>
                                      <p className="text-[10px]" style={{ color: "#9ca3af" }}>{item.label}</p>
                                      <p className="text-[9px]" style={{ color: "#4b5563" }}>{item.detail}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-4 rounded p-2" style={{ background: "rgba(0,0,0,0.10)" }}>
                            <span className="text-[10px] data-mono" style={{ color: "#9ca3af" }}>Base: {record.baseScore}</span>
                            <span className="text-[10px] data-mono" style={{ color: record.evidenceModifier >= 0 ? "#22c55e" : "#ef4444" }}>Modifier: {record.evidenceModifier >= 0 ? "+" : ""}{record.evidenceModifier}</span>
                            <span className="text-[10px] data-mono" style={{ color: scoreColor(record.finalScore) }}>Final: {record.finalScore}</span>
                            <span className="text-[10px] data-mono" style={{ color: "#4b5563" }}>Integrity: {record.integrityScore}/100</span>
                            <span className="text-[10px]" style={{ color: "#4b5563" }}>Readiness: {record.integrityReadiness.replace(/_/g, " ")}</span>
                            <span className="text-[10px]" style={{ color: "#4b5563" }}>Risk: {record.riskStatus}</span>
                            <span className="text-[10px]" style={{ color: "#4b5563" }}>Evidence: {record.evidenceCompleteness}</span>
                            {record.evidenceCapsApplied.length > 0 && (
                              <span className="text-[10px]" style={{ color: "#f59e0b" }}>Caps: {record.evidenceCapsApplied.join(", ")}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </div>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6 rounded-lg p-7 text-center" style={{ border: "1px dashed rgba(201,215,227,0.1)" }}>
          <Eye size={16} className="mx-auto mb-2" style={{ color: "#4b5563" }} />
          <p className="text-sm" style={{ color: "#9ca3af" }}>
            {filter === "ALL" ? "No candidates in the queue." : `No ${filter} candidates.`}
          </p>
          <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>
            {filter === "ALL" ? "Start the Auto Intelligence Cycle to generate evidence-scored candidates." : "Try a different filter."}
          </p>
        </div>
      )}

      {/* Notes panel for selected candidate */}
      {activeNoteId && (
        <div className="mt-4 rounded-lg p-4" style={{ background: "rgba(0,0,0,0.14)", border: "1px solid rgba(201,215,227,0.06)" }}>
          {(() => {
            const record = records.find((r) => r.id === activeNoteId);
            if (!record) return null;
            return (
              <div>
                <p className="mb-2 text-xs font-medium" style={{ color: "#9ca3af" }}>
                  {record.symbol} -- Score: {record.finalScore} -- Status: {record.candidateStatus}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Review notes</label>
                    <textarea
                      value={reviewNotesMap[activeNoteId] ?? ""}
                      onChange={(e) => setReviewNotesMap((prev) => ({ ...prev, [activeNoteId]: e.target.value }))}
                      placeholder="Add review notes (optional)..."
                      rows={2}
                      className="w-full rounded border-0 p-2 text-xs outline-none"
                      style={{ background: "rgba(0,0,0,0.2)", color: "#c9d7e3", resize: "none" }}
                    />
                    <button
                      type="button"
                      onClick={() => handleMarkReviewed(activeNoteId)}
                      className="mt-1.5 rounded px-2.5 py-1 text-[10px] uppercase tracking-[0.04em] transition-colors"
                      style={{ color: "#22c55e", border: "1px solid rgba(34,197,94,0.24)" }}
                    >
                      Mark reviewed
                    </button>
                  </div>
                  <div>
                    <label className="mb-1 block text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Dismiss reason</label>
                    <textarea
                      value={dismissReasonMap[activeNoteId] ?? ""}
                      onChange={(e) => setDismissReasonMap((prev) => ({ ...prev, [activeNoteId]: e.target.value }))}
                      placeholder="Add dismiss reason (optional)..."
                      rows={2}
                      className="w-full rounded border-0 p-2 text-xs outline-none"
                      style={{ background: "rgba(0,0,0,0.2)", color: "#c9d7e3", resize: "none" }}
                    />
                    <button
                      type="button"
                      onClick={() => handleDismiss(activeNoteId)}
                      className="mt-1.5 rounded px-2.5 py-1 text-[10px] uppercase tracking-[0.04em] transition-colors"
                      style={{ color: "#ef4444", border: "1px solid rgba(239,68,68,0.24)" }}
                    >
                      Dismiss candidate
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Actions */}
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
