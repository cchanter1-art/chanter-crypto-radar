import { useState } from "react";
import { Activity, Clock3, Eye, History, Play, Square, Trash2 } from "lucide-react";
import { usePortfolio } from "@/context/AppContext";
import {
  SUPPORTED_FUTURES_LEVERAGE,
  SUPPORTED_FUTURES_SYMBOLS,
  SUPPORTED_FUTURES_TEST_SCENARIOS,
  loadFuturesPaperHistory,
  loadFuturesPaperPositions,
  loadFuturesPaperSettings,
  type FuturesLeverage,
  type FuturesSymbol,
  type FuturesTestScenario,
} from "@/lib/futuresPaperEngine";
import { loadPaperRiskSettings } from "@/lib/paperRiskController";
import {
  DEFAULT_FORWARD_TEST_CONFIG,
  FORWARD_TEST_PROFILES,
  MAX_FORWARD_TEST_COMPLETED_SESSIONS,
  MAX_FORWARD_TEST_OBSERVATIONS,
  addForwardTestObservation,
  clearForwardTestData,
  getForwardTestSummary,
  loadForwardTestData,
  saveForwardTestData,
  startForwardTestSession,
  stopForwardTestSession,
  type ForwardTestProfile,
  type ForwardTestRiskStatus,
  type ForwardTestSession,
} from "@/lib/forwardTestSession";

interface MetricCardProps {
  label: string;
  value: string;
  color?: string;
  detail?: string;
}

function MetricCard({ label, value, color = "#c9d7e3", detail }: MetricCardProps) {
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
      {detail && <p className="mt-1 text-[10px] leading-4" style={{ color: "#4b5563" }}>{detail}</p>}
    </div>
  );
}

function formatTimestamp(value: string | null): string {
  if (!value) return "No observations";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function riskColor(status: ForwardTestRiskStatus): string {
  if (status === "APPROVED") return "#22c55e";
  if (status === "BLOCKED") return "#ef4444";
  if (status === "REDUCED") return "#f59e0b";
  return "#9ca3af";
}

function directionColor(direction: string): string {
  if (direction === "LONG") return "#22c55e";
  if (direction === "SHORT") return "#ef4444";
  return "#9ca3af";
}

export default function ForwardTestSessionPanel() {
  const { totalValue } = usePortfolio();
  const [data, setData] = useState(loadForwardTestData);
  const [profile, setProfile] = useState<ForwardTestProfile>(DEFAULT_FORWARD_TEST_CONFIG.profile);
  const [scenario, setScenario] = useState<FuturesTestScenario>(DEFAULT_FORWARD_TEST_CONFIG.scenario);
  const [symbol, setSymbol] = useState<FuturesSymbol>(DEFAULT_FORWARD_TEST_CONFIG.symbol);
  const [leverage, setLeverage] = useState<FuturesLeverage>(DEFAULT_FORWARD_TEST_CONFIG.leverage);
  const [notes, setNotes] = useState(DEFAULT_FORWARD_TEST_CONFIG.notes);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    () => data.activeSession?.id ?? data.completedSessions[0]?.id ?? null,
  );
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const selectedSession = (
    data.activeSession?.id === selectedSessionId
      ? data.activeSession
      : data.completedSessions.find((session) => session.id === selectedSessionId)
  ) ?? data.activeSession ?? data.completedSessions[0] ?? null;
  const summary = getForwardTestSummary(selectedSession);
  const hasActiveSession = data.activeSession !== null;

  const applyData = (nextData: typeof data, successMessage: string) => {
    setData(nextData);
    setStatus(
      saveForwardTestData(nextData)
        ? { type: "success", message: successMessage }
        : {
            type: "error",
            message: `${successMessage} Browser storage could not be updated.`,
          },
    );
  };

  const handleStart = () => {
    const result = startForwardTestSession(
      data,
      { profile, scenario, symbol, leverage, notes: notes.trim() },
      new Date().toISOString(),
    );
    if (result.ok === false) {
      setStatus({ type: "error", message: result.message });
      return;
    }
    setSelectedSessionId(result.session.id);
    applyData(result.data, "Forward test session started. Observations remain manual.");
  };

  const handleStop = () => {
    const result = stopForwardTestSession(data, new Date().toISOString());
    if (result.ok === false) {
      setStatus({ type: "error", message: result.message });
      return;
    }
    setSelectedSessionId(result.session.id);
    applyData(result.data, "Forward test session stopped.");
  };

  const handleAddObservation = () => {
    const result = addForwardTestObservation(data, {
      timestamp: new Date().toISOString(),
      userNote: notes,
      paperPortfolioValue: totalValue,
      openPositions: loadFuturesPaperPositions(),
      futuresHistory: loadFuturesPaperHistory(),
      futuresSettings: loadFuturesPaperSettings(),
      riskSettings: loadPaperRiskSettings(),
    });
    if (result.ok === false) {
      setStatus({ type: "error", message: result.message });
      return;
    }
    setSelectedSessionId(result.observation.sessionId);
    applyData(
      result.data,
      `${result.observation.direction} observation recorded as ${result.observation.riskStatus}. No order was created.`,
    );
  };

  const handleClear = () => {
    if (!window.confirm("Clear all browser-local forward test sessions and observations?")) return;
    const emptyData = { activeSession: null, completedSessions: [] };
    setData(emptyData);
    setSelectedSessionId(null);
    setStatus(
      clearForwardTestData()
        ? { type: "success", message: "Forward test session history cleared." }
        : { type: "error", message: "History was cleared for this view, but browser storage could not be updated." },
    );
  };

  return (
    <section
      className="card-surface mt-8 rounded-xl p-5 lg:p-6"
      style={{ border: "1px solid rgba(201,215,227,0.06)" }}
      aria-labelledby="forward-test-session-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Eye size={16} style={{ color: "#cc9258" }} />
            <h3 id="forward-test-session-title" className="section-title" style={{ fontSize: 22 }}>
              Forward Test Session
            </h3>
          </div>
          <p className="text-xs" style={{ color: "#6b7280" }}>
            Command Center observation layer — manual ticks only
          </p>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.08em]"
          style={{
            color: hasActiveSession ? "#22c55e" : "#9ca3af",
            border: `1px solid ${hasActiveSession ? "rgba(34,197,94,0.24)" : "rgba(156,163,175,0.18)"}`,
          }}
        >
          {hasActiveSession ? "Active · observation only" : "Inactive · paper only"}
        </span>
      </div>

      <div
        className="mt-5 rounded-lg p-4"
        style={{ backgroundColor: "rgba(201,215,227,0.02)", border: "1px solid rgba(201,215,227,0.05)" }}
      >
        <p className="text-xs" style={{ color: "#9ca3af" }}>Forward testing records observations only.</p>
        <p className="mt-1 text-xs" style={{ color: "#6b7280" }}>No real orders are placed.</p>
        <p className="mt-1 text-xs" style={{ color: "#6b7280" }}>No paper positions are opened automatically.</p>
        <p className="mt-1 text-xs" style={{ color: "#6b7280" }}>Browser-local session data only.</p>
        <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>For tracking only. Not financial advice.</p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <label htmlFor="forward-test-profile" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>Strategy profile</label>
          <select id="forward-test-profile" value={profile} onChange={(event) => setProfile(event.target.value as ForwardTestProfile)} className="input-dark cursor-pointer" disabled={hasActiveSession}>
            {FORWARD_TEST_PROFILES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="forward-test-scenario" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>Strategy scenario</label>
          <select id="forward-test-scenario" value={scenario} onChange={(event) => setScenario(event.target.value as FuturesTestScenario)} className="input-dark cursor-pointer" disabled={hasActiveSession}>
            {SUPPORTED_FUTURES_TEST_SCENARIOS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="forward-test-symbol" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>Symbol</label>
          <select id="forward-test-symbol" value={symbol} onChange={(event) => setSymbol(event.target.value as FuturesSymbol)} className="input-dark cursor-pointer" disabled={hasActiveSession}>
            {SUPPORTED_FUTURES_SYMBOLS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="forward-test-leverage" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>Leverage</label>
          <select id="forward-test-leverage" value={leverage} onChange={(event) => setLeverage(Number(event.target.value) as FuturesLeverage)} className="input-dark cursor-pointer" disabled={hasActiveSession}>
            {SUPPORTED_FUTURES_LEVERAGE.map((item) => <option key={item} value={item}>{item}x</option>)}
          </select>
        </div>
        <div className="md:col-span-2 xl:col-span-4">
          <label htmlFor="forward-test-notes" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>Notes</label>
          <textarea
            id="forward-test-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="input-dark min-h-24 resize-y"
            maxLength={1_000}
            placeholder="Optional session context or manual observation note"
          />
          <p className="mt-1 text-[10px]" style={{ color: "#4b5563" }}>
            Notes are copied into each observation tick while the session is active.
          </p>
        </div>
      </div>

      {leverage === 5 && (
        <p className="mt-3 text-xs" style={{ color: "#f59e0b" }}>
          5x is a high-risk paper assumption and remains subject to all existing futures risk gates.
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={handleStart} className="btn-accent flex items-center gap-2" disabled={hasActiveSession}>
          <Play size={14} /> Start session
        </button>
        <button type="button" onClick={handleStop} className="btn-primary flex items-center gap-2" disabled={!hasActiveSession}>
          <Square size={13} /> Stop session
        </button>
        <button type="button" onClick={handleAddObservation} className="btn-primary flex items-center gap-2" disabled={!hasActiveSession}>
          <Activity size={14} /> Add observation tick
        </button>
        <button type="button" onClick={handleClear} className="btn-danger flex items-center gap-2" disabled={!data.activeSession && data.completedSessions.length === 0}>
          <Trash2 size={14} /> Clear forward test session history
        </button>
      </div>

      {status && (
        <p role={status.type === "error" ? "alert" : "status"} className="mt-4 text-xs" style={{ color: status.type === "error" ? "#ef4444" : "#22c55e" }}>
          {status.message}
        </p>
      )}

      {selectedSession ? (
        <>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="label-upper" style={{ color: "#4b5563", fontSize: 10 }}>Session summary</p>
              <p className="mt-1 text-xs" style={{ color: "#6b7280" }}>
                {selectedSession.config.profile} · {selectedSession.config.scenario} · {selectedSession.config.symbol} · {selectedSession.config.leverage}x
              </p>
            </div>
            <span className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.08em]" style={{ color: selectedSession.status === "ACTIVE" ? "#22c55e" : "#9ca3af", border: "1px solid rgba(201,215,227,0.1)" }}>
              {selectedSession.status}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <MetricCard label="Observations" value={String(summary.totalObservations)} detail={`${MAX_FORWARD_TEST_OBSERVATIONS} global cap`} />
            <MetricCard label="Actionable" value={String(summary.actionableSignals)} />
            <MetricCard label="WAIT" value={String(summary.waitCount)} />
            <MetricCard label="Risk blocked" value={String(summary.riskBlockedCount)} color={summary.riskBlockedCount > 0 ? "#ef4444" : "#c9d7e3"} />
            <MetricCard label="Approved" value={String(summary.approvedCount)} color="#22c55e" />
            <MetricCard label="Reduced" value={String(summary.reducedCount)} color="#f59e0b" />
            <MetricCard label="LONG" value={String(summary.longCount)} color="#22c55e" />
            <MetricCard label="SHORT" value={String(summary.shortCount)} color="#ef4444" />
            <MetricCard label="Average confidence" value={`${summary.averageConfidence.toFixed(2)} / 3`} />
            <MetricCard label="Latest observation" value={formatTimestamp(summary.latestObservationTime)} />
            <MetricCard label="Session duration" value={formatDuration(summary.sessionDurationSeconds)} />
            <MetricCard label="Common block reason" value={summary.mostCommonBlockReason ?? "None"} />
          </div>

          {selectedSession.observations.length > 0 ? (
            <div className="mt-6 overflow-auto rounded-lg" style={{ maxHeight: 560, border: "1px solid rgba(201,215,227,0.05)" }}>
              <table className="w-full min-w-[1500px] border-collapse text-left">
                <thead className="sticky top-0" style={{ backgroundColor: "#090d13" }}>
                  <tr>
                    {["Time", "Symbol", "Profile", "Scenario", "Direction", "Confidence", "Risk status", "Leverage", "Reason", "Note"].map((heading) => (
                      <th key={heading} className="px-4 py-3 label-upper" style={{ color: "#4b5563", fontSize: 9 }}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedSession.observations.map((observation) => (
                    <tr key={observation.id} style={{ borderTop: "1px solid rgba(201,215,227,0.04)" }}>
                      <td className="px-4 py-3 text-xs" style={{ color: "#6b7280" }}>{formatTimestamp(observation.timestamp)}</td>
                      <td className="px-4 py-3 data-mono text-xs" style={{ color: "#9ca3af" }}>{observation.symbol}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#9ca3af" }}>{observation.profile}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#9ca3af" }}>{observation.scenario}</td>
                      <td className="px-4 py-3 text-xs font-medium" style={{ color: directionColor(observation.direction) }}>{observation.direction}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#9ca3af" }}>{observation.confidence}</td>
                      <td className="px-4 py-3 text-xs font-medium" style={{ color: riskColor(observation.riskStatus) }}>{observation.riskStatus}</td>
                      <td className="px-4 py-3 data-mono text-xs" style={{ color: "#9ca3af" }}>{observation.leverage}x</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#6b7280", minWidth: 360, lineHeight: 1.5 }}>
                        {observation.setupReason}
                        <span className="mt-1 block" style={{ color: "#4b5563" }}>{observation.riskReason}</span>
                        <span className="mt-1 block" style={{ color: "#4b5563" }}>{observation.invalidationNote}</span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#6b7280", minWidth: 220 }}>{observation.userNote || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-6 rounded-lg p-7 text-center" style={{ border: "1px dashed rgba(201,215,227,0.1)" }}>
              <Clock3 size={16} className="mx-auto mb-2" style={{ color: "#4b5563" }} />
              <p className="text-sm" style={{ color: "#9ca3af" }}>No manual observations in this session.</p>
              <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>Add observation tick is the only action that records a setup.</p>
            </div>
          )}
        </>
      ) : (
        <div className="mt-6 rounded-lg p-7 text-center" style={{ border: "1px dashed rgba(201,215,227,0.1)" }}>
          <p className="text-sm" style={{ color: "#9ca3af" }}>No forward test session yet.</p>
          <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>Start a browser-local session, then add each observation manually.</p>
        </div>
      )}

      {data.completedSessions.length > 0 && (
        <details className="mt-6" style={{ borderTop: "1px solid rgba(201,215,227,0.05)", paddingTop: 16 }}>
          <summary className="flex cursor-pointer items-center gap-2 text-xs" style={{ color: "#6b7280" }}>
            <History size={13} />
            Completed sessions · {data.completedSessions.length} / {MAX_FORWARD_TEST_COMPLETED_SESSIONS}
          </summary>
          <div className="mt-3 grid gap-2">
            {data.completedSessions.map((session: ForwardTestSession) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setSelectedSessionId(session.id)}
                className="grid gap-2 rounded-md px-3 py-3 text-left transition-colors hover:bg-white/[0.03] sm:grid-cols-[1fr_auto_auto] sm:items-center"
                style={{ border: "1px solid rgba(201,215,227,0.04)" }}
              >
                <span className="text-xs" style={{ color: "#9ca3af" }}>
                  {session.config.profile} · {session.config.scenario} · {session.config.symbol}
                </span>
                <span className="text-xs" style={{ color: "#6b7280" }}>{session.observations.length} observations</span>
                <span className="text-[10px]" style={{ color: "#4b5563" }}>{formatTimestamp(session.stoppedAt ?? session.startedAt)}</span>
              </button>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
