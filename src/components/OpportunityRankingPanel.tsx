import { useState, useMemo } from "react";
import { Trophy, Eye } from "lucide-react";
import { loadCandidateReviewQueue } from "@/lib/candidateReviewQueue";
import {
  buildOpportunityRankings,
  explainOpportunityRank,
  filterRankingsByAction,
  type OpportunityAction,
} from "@/lib/opportunityRanking";

function actionColor(action: OpportunityAction): string {
  if (action === "REVIEW") return "#22c55e";
  if (action === "WATCH") return "#f59e0b";
  if (action === "WAIT") return "#a78b63";
  if (action === "BLOCKED") return "#ef4444";
  return "#9ca3af";
}

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

const ACTION_FILTERS: (OpportunityAction | "ALL")[] = ["ALL", "REVIEW", "WATCH", "WAIT", "BLOCKED"];

export default function OpportunityRankingPanel() {
  const records = loadCandidateReviewQueue();
  const [filter, setFilter] = useState<OpportunityAction | "ALL">("ALL");

  const rankings = useMemo(() => buildOpportunityRankings(records), [records]);
  const topOpportunity = useMemo(() => rankings[0] ?? null, [rankings]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return rankings;
    return filterRankingsByAction(rankings, filter);
  }, [rankings, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: rankings.length, REVIEW: 0, WATCH: 0, WAIT: 0, BLOCKED: 0 };
    for (const r of rankings) c[r.action]++;
    return c;
  }, [rankings]);

  const topExplanation = useMemo(() => topOpportunity ? explainOpportunityRank(topOpportunity) : null, [topOpportunity]);

  return (
    <section
      className="card-surface mt-8 rounded-xl p-5 lg:p-6"
      style={{ border: "1px solid rgba(201,215,227,0.06)" }}
      aria-labelledby="opportunity-ranking-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Trophy size={16} style={{ color: "#cc9258" }} />
            <h3 id="opportunity-ranking-title" className="section-title" style={{ fontSize: 22 }}>
              Opportunity Ranking
            </h3>
          </div>
          <p className="text-xs" style={{ color: "#6b7280" }}>
            Ranked opportunities from evidence-scored candidates
          </p>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.08em]"
          style={{ color: "#cc9258", border: "1px solid rgba(204,146,88,0.24)" }}
        >
          Review only -- no execution
        </span>
      </div>

      <div
        className="mt-5 rounded-lg p-4"
        style={{ backgroundColor: "rgba(201,215,227,0.02)", border: "1px solid rgba(201,215,227,0.05)" }}
      >
        <p className="text-xs" style={{ color: "#9ca3af" }}>Review-only opportunity ranking. No orders. No paper positions. Not financial advice.</p>
        <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>Rankings are computed live from the candidate queue. No buy, sell, execute, or open-position actions are available.</p>
      </div>

      {/* Top opportunity card */}
      {topOpportunity ? (
        <div
          className="mt-5 rounded-xl p-5"
          style={{
            background: "linear-gradient(135deg, rgba(204,146,88,0.06), rgba(0,0,0,0.14))",
            border: `1px solid ${actionColor(topOpportunity.action)}33`,
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Trophy size={14} style={{ color: "#cc9258" }} />
                <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#4b5563" }}>Top Opportunity</span>
              </div>
              <p className="data-mono mt-2 text-xl font-bold" style={{ color: "#c9d7e3" }}>{topOpportunity.symbol}</p>
              <p className="text-xs" style={{ color: "#6b7280" }}>{topOpportunity.timeframe} | {topOpportunity.direction}</p>
            </div>
            <div className="text-right">
              <span
                className="rounded-lg px-3 py-1 text-sm font-bold uppercase"
                style={{ color: actionColor(topOpportunity.action), border: `1px solid ${actionColor(topOpportunity.action)}44` }}
              >
                {topOpportunity.action}
              </span>
              <p className="data-mono mt-2 text-2xl" style={{ color: scoreColor(topOpportunity.finalScore) }}>{topOpportunity.rankScore}</p>
              <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Rank score</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Final Score</p>
              <p className="data-mono text-sm" style={{ color: scoreColor(topOpportunity.finalScore) }}>{topOpportunity.finalScore}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Integrity</p>
              <p className="data-mono text-sm" style={{ color: topOpportunity.integrityScore >= 70 ? "#22c55e" : "#f59e0b" }}>{topOpportunity.integrityScore}/100</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Risk</p>
              <p className="text-sm" style={{ color: topOpportunity.riskStatus === "BLOCKED" ? "#ef4444" : "#9ca3af" }}>{topOpportunity.riskStatus}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Evidence</p>
              <p className="text-sm" style={{ color: "#9ca3af" }}>{topOpportunity.evidenceCompleteness}</p>
            </div>
          </div>

          {topExplanation && (
            <div className="mt-3 rounded-lg p-3" style={{ background: "rgba(0,0,0,0.10)" }}>
              <p className="text-[10px] leading-4" style={{ color: "#6b7280" }}>{topExplanation}</p>
            </div>
          )}

          <p className="mt-2 text-[10px]" style={{ color: "#4b5563" }}>Reason: {topOpportunity.reasonSummary}</p>

          {topOpportunity.positiveFactors.length > 0 && (
            <div className="mt-2">
              <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Positive</p>
              {topOpportunity.positiveFactors.slice(0, 3).map((f, i) => (
                <p key={i} className="text-[10px]" style={{ color: "#22c55e" }}>- {f}</p>
              ))}
            </div>
          )}
          {topOpportunity.missingFactors.length > 0 && (
            <div className="mt-1">
              <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Missing</p>
              {topOpportunity.missingFactors.slice(0, 3).map((f, i) => (
                <p key={i} className="text-[10px]" style={{ color: "#f59e0b" }}>- {f}</p>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 rounded-lg p-7 text-center" style={{ border: "1px dashed rgba(201,215,227,0.1)" }}>
          <Eye size={16} className="mx-auto mb-2" style={{ color: "#4b5563" }} />
          <p className="text-sm" style={{ color: "#9ca3af" }}>No ranked opportunities yet.</p>
          <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>Start the Auto Intelligence Cycle to generate evidence-scored candidates.</p>
        </div>
      )}

      {/* Filter tabs */}
      {rankings.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-1.5">
          {ACTION_FILTERS.map((opt) => (
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
              {opt} ({counts[opt] ?? 0})
            </button>
          ))}
        </div>
      )}

      {/* Ranked table */}
      {filtered.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-lg" style={{ border: "1px solid rgba(201,215,227,0.05)" }}>
          <table className="w-full min-w-[700px] border-collapse text-left">
            <thead style={{ backgroundColor: "#090d13" }}>
              <tr>
                {["Rank", "Symbol", "Action", "Score", "Risk", "Evidence", "Integrity", "Reason"].map((h) => (
                  <th key={h} className="px-3 py-3 label-upper" style={{ color: "#4b5563", fontSize: 9 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((record, i) => (
                <tr key={record.id} style={{ borderTop: "1px solid rgba(201,215,227,0.04)" }}>
                  <td className="px-3 py-3 data-mono text-xs" style={{ color: "#4b5563" }}>#{i + 1}</td>
                  <td className="px-3 py-3 data-mono text-xs" style={{ color: "#9ca3af" }}>{record.symbol}</td>
                  <td className="px-3 py-3 text-xs uppercase" style={{ color: actionColor(record.action) }}>{record.action}</td>
                  <td className="px-3 py-3 data-mono text-xs" style={{ color: scoreColor(record.finalScore) }}>{record.finalScore}</td>
                  <td className="px-3 py-3 text-xs" style={{ color: record.riskStatus === "BLOCKED" ? "#ef4444" : "#9ca3af" }}>{record.riskStatus}</td>
                  <td className="px-3 py-3 text-xs" style={{ color: "#9ca3af" }}>{record.evidenceCompleteness}</td>
                  <td className="px-3 py-3 data-mono text-xs" style={{ color: record.integrityScore >= 70 ? "#22c55e" : "#f59e0b" }}>{record.integrityScore}</td>
                  <td className="px-3 py-3 text-[10px]" style={{ color: "#6b7280", maxWidth: 200 }}>{record.reasonSummary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
