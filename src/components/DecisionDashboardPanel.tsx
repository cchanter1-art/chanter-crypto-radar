import { useMemo } from "react";
import { Crosshair, Eye, Clock, Ban, CheckCircle, AlertTriangle, XCircle, ShieldCheck } from "lucide-react";
import {
  buildDecisionDashboardSnapshot,
  type DecisionAction,
} from "@/lib/decisionDashboard";
import { loadCandidateReviewQueue } from "@/lib/candidateReviewQueue";
import { buildOpportunityRankings } from "@/lib/opportunityRanking";
import { loadSignalQualityHistory } from "@/lib/signalQualityScore";
import { loadMarketDataIntegrityHistory } from "@/lib/marketDataIntegrity";
import {
  loadPaperOutcomeHistory,
  buildPaperOutcomeSummary,
  buildPaperOutcomeSymbolSummary,
} from "@/lib/paperOutcomeTracker";

function actionColor(action: DecisionAction): string {
  if (action === "REVIEW") return "#22c55e";
  if (action === "WATCH") return "#f59e0b";
  if (action === "WAIT") return "#a78b63";
  return "#6b7280";
}

function actionIcon(action: DecisionAction, size = 14) {
  if (action === "REVIEW") return <CheckCircle size={size} style={{ color: actionColor(action) }} />;
  if (action === "WATCH") return <Eye size={size} style={{ color: actionColor(action) }} />;
  if (action === "WAIT") return <Clock size={size} style={{ color: actionColor(action) }} />;
  return <Ban size={size} style={{ color: actionColor(action) }} />;
}

function confidenceColor(conf: string): string {
  if (conf === "HIGH") return "#22c55e";
  if (conf === "MEDIUM") return "#f59e0b";
  return "#6b7280";
}

export default function DecisionDashboardPanel() {
  const snapshot = useMemo(() => {
    const candidates = loadCandidateReviewQueue().filter((c) => c.candidateStatus !== "DISMISSED");
    const rankings = buildOpportunityRankings(candidates);
    const sqHistory = loadSignalQualityHistory();
    const latestSignal = sqHistory.length > 0 ? sqHistory[0] : null;
    const integrityHistory = loadMarketDataIntegrityHistory();
    const latestIntegrity = integrityHistory.length > 0 ? integrityHistory[0] : null;
    const outcomes = loadPaperOutcomeHistory();
    const outcomeSummary = outcomes.length > 0 ? buildPaperOutcomeSummary(outcomes) : null;
    const outcomeSymbolSummaries = buildPaperOutcomeSymbolSummary(outcomes);

    return buildDecisionDashboardSnapshot({
      candidates,
      rankings,
      latestSignalQuality: latestSignal,
      latestIntegrity,
      outcomeSummary,
      outcomeSymbolSummaries,
      cycleState: null,
    });
  }, []);

  const primary = snapshot.primary;

  return (
    <section
      className="card-surface mt-8 rounded-xl p-5 lg:p-6"
      style={{ border: "1px solid rgba(201,215,227,0.06)" }}
      aria-labelledby="decision-dashboard-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Crosshair size={16} style={{ color: "#cc9258" }} />
            <h3 id="decision-dashboard-title" className="section-title" style={{ fontSize: 22 }}>
              Decision Dashboard
            </h3>
          </div>
          <p className="text-xs" style={{ color: "#6b7280" }}>
            Clear actionable intelligence from all evidence layers
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
        <p className="text-xs" style={{ color: "#9ca3af" }}>Decision-only dashboard. No trades. No orders. Not financial advice.</p>
        <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>Actions: WATCH, REVIEW, WAIT, IGNORE. No buy, sell, execute, or open-position controls.</p>
      </div>

      {primary ? (
        <>
          {/* Primary Decision Card */}
          <div
            className="mt-5 rounded-xl p-5"
            style={{
              background: "linear-gradient(135deg, rgba(204,146,88,0.06), rgba(0,0,0,0.14))",
              border: `1px solid ${actionColor(primary.action)}33`,
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Crosshair size={14} style={{ color: "#cc9258" }} />
                  <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#4b5563" }}>Primary Decision</span>
                </div>
                <p className="data-mono mt-2 text-xl font-bold" style={{ color: "#c9d7e3" }}>{primary.symbol}</p>
                <p className="text-xs" style={{ color: "#6b7280" }}>{primary.reasonTitle}</p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2">
                  {actionIcon(primary.action)}
                  <span
                    className="rounded-lg px-3 py-1 text-sm font-bold uppercase"
                    style={{ color: actionColor(primary.action), border: `1px solid ${actionColor(primary.action)}44` }}
                  >
                    {primary.action}
                  </span>
                </div>
                <span
                  className="mt-2 inline-block rounded px-2 py-0.5 text-[10px] uppercase tracking-[0.04em]"
                  style={{ color: confidenceColor(primary.confidenceLabel), border: `1px solid ${confidenceColor(primary.confidenceLabel)}33` }}
                >
                  {primary.confidenceLabel}
                </span>
                <p className="data-mono mt-2 text-2xl" style={{ color: "#9ca3af" }}>{primary.priorityScore}</p>
                <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Priority score</p>
              </div>
            </div>

            <p className="mt-3 text-sm" style={{ color: "#9ca3af" }}>{primary.reasonSummary}</p>

            {/* Evidence section */}
            <div className="mt-4">
              <p className="mb-1 text-[10px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>
                <CheckCircle size={11} className="mr-1 inline" style={{ color: "#22c55e" }} />
                Why this matters
              </p>
              {primary.evidenceBullets.map((b, i) => (
                <p key={i} className="ml-4 text-[11px] leading-5" style={{ color: "#9ca3af" }}>- {b}</p>
              ))}
            </div>

            {/* Risk section */}
            {primary.riskBullets.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-[10px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>
                  <AlertTriangle size={11} className="mr-1 inline" style={{ color: "#f59e0b" }} />
                  Risk / blockers
                </p>
                {primary.riskBullets.map((b, i) => (
                  <p key={i} className="ml-4 text-[11px] leading-5" style={{ color: "#f59e0b" }}>- {b}</p>
                ))}
              </div>
            )}

            {/* Proof section */}
            <div className="mt-3">
              <p className="mb-1 text-[10px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>
                <ShieldCheck size={11} className="mr-1 inline" style={{ color: "#cc9258" }} />
                Proof so far
              </p>
              {primary.proofBullets.map((b, i) => (
                <p key={i} className="ml-4 text-[11px] leading-5" style={{ color: "#9ca3af" }}>- {b}</p>
              ))}
            </div>

            {/* Missing data section */}
            {primary.missingDataBullets.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-[10px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>
                  <XCircle size={11} className="mr-1 inline" style={{ color: "#6b7280" }} />
                  Missing data
                </p>
                {primary.missingDataBullets.map((b, i) => (
                  <p key={i} className="ml-4 text-[11px] leading-5" style={{ color: "#6b7280" }}>- {b}</p>
                ))}
              </div>
            )}

            <p className="mt-3 text-[10px]" style={{ color: "#4b5563" }}>Updated: {primary.updatedAt}</p>
          </div>

          {/* Top 5 decisions list */}
          {snapshot.topDecisions.length > 1 && (
            <div className="mt-5">
              <p className="mb-2 text-[10px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>All Decisions</p>
              <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid rgba(201,215,227,0.05)" }}>
                <table className="w-full min-w-[600px] border-collapse text-left">
                  <thead style={{ backgroundColor: "#090d13" }}>
                    <tr>
                      {["Symbol", "Action", "Confidence", "Priority", "Score", "Reason"].map((h) => (
                        <th key={h} className="px-3 py-3 label-upper" style={{ color: "#4b5563", fontSize: 9 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.topDecisions.map((d) => (
                      <tr key={d.symbol} style={{ borderTop: "1px solid rgba(201,215,227,0.04)" }}>
                        <td className="px-3 py-3 data-mono text-xs" style={{ color: "#9ca3af" }}>{d.symbol}</td>
                        <td className="px-3 py-3">
                          <span className="flex items-center gap-1.5 text-xs uppercase" style={{ color: actionColor(d.action) }}>
                            {actionIcon(d.action, 10)} {d.action}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs" style={{ color: confidenceColor(d.confidenceLabel) }}>{d.confidenceLabel}</td>
                        <td className="px-3 py-3 data-mono text-xs" style={{ color: "#9ca3af" }}>{d.priorityScore}</td>
                        <td className="px-3 py-3 data-mono text-xs" style={{ color: "#9ca3af" }}>{d.finalScore}</td>
                        <td className="px-3 py-3 text-[10px]" style={{ color: "#6b7280", maxWidth: 250 }}>{d.reasonSummary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="mt-6 rounded-lg p-7 text-center" style={{ border: "1px dashed rgba(201,215,227,0.1)" }}>
          <Crosshair size={16} className="mx-auto mb-2" style={{ color: "#4b5563" }} />
          <p className="text-sm" style={{ color: "#9ca3af" }}>No ranked decision yet.</p>
          <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>Run the Auto Intelligence Cycle to generate candidates and evidence.</p>
        </div>
      )}

      <div className="mt-3 flex items-start gap-2 text-xs leading-5" style={{ color: "#5f6977" }}>
        <ShieldCheck className="mt-0.5 shrink-0" size={13} />
        <p>Review-only. No execution. No financial advice. Actions are WATCH, REVIEW, WAIT, or IGNORE only.</p>
      </div>
    </section>
  );
}
