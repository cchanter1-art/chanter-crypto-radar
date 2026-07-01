import { useEffect, useState } from "react";
import { AlertTriangle, Play, RotateCcw, Square, Zap } from "lucide-react";
import {
  clearAutoIntelligenceCycleHistory,
  getAutoIntelligenceCycleState,
  getStaleWarning,
  isAutoIntelligenceCycleActive,
  isTickRunning,
  runAutoIntelligenceTick,
  startAutoIntelligenceCycle,
  stopAutoIntelligenceCycle,
  type AutoIntelligenceCycleState,
} from "@/lib/autoIntelligenceCycle";

function formatTimestamp(value: string | null): string {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Invalid";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.round((ms % 60000) / 1000);
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

function statusLabel(state: AutoIntelligenceCycleState, active: boolean, tickRunning: boolean): string {
  if (tickRunning) return "Running tick...";
  if (active) return "Running";
  if (state.enabled && !active) return "Enabled (click Start to resume)";
  if (state.lastStatus === "passed") return "Last run passed";
  if (state.lastStatus === "failed") return "Last run failed";
  return "Off";
}

function statusColor(state: AutoIntelligenceCycleState, active: boolean, tickRunning: boolean): string {
  if (tickRunning) return "#22c55e";
  if (active) return "#22c55e";
  if (state.lastStatus === "failed") return "#ef4444";
  if (state.lastStatus === "passed") return "#84cc16";
  return "#6b7280";
}

export default function AutoIntelligenceCyclePanel() {
  const [state, setState] = useState<AutoIntelligenceCycleState>(() => getAutoIntelligenceCycleState());
  const [active, setActive] = useState<boolean>(() => isAutoIntelligenceCycleActive());
  const [tickRunning, setTickRunning] = useState<boolean>(() => isTickRunning());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const poll = () => {
      setState(getAutoIntelligenceCycleState());
      setActive(isAutoIntelligenceCycleActive());
      setTickRunning(isTickRunning());
    };
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, []);

  const handleStart = () => {
    setError(null);
    const ok = startAutoIntelligenceCycle();
    if (!ok) {
      setError("Cycle is already running.");
    }
    setState(getAutoIntelligenceCycleState());
    setActive(isAutoIntelligenceCycleActive());
  };

  const handleStop = () => {
    setError(null);
    stopAutoIntelligenceCycle();
    setState(getAutoIntelligenceCycleState());
    setActive(isAutoIntelligenceCycleActive());
  };

  const handleRunNow = async () => {
    setError(null);
    setLoading(true);
    const result = await runAutoIntelligenceTick();
    if (!result.ok) {
      setError(result.error ?? "Tick failed");
    }
    setState(getAutoIntelligenceCycleState());
    setActive(isAutoIntelligenceCycleActive());
    setLoading(false);
  };

  const handleClear = () => {
    if (!window.confirm("Clear auto intelligence cycle history?")) return;
    clearAutoIntelligenceCycleHistory();
    setState(getAutoIntelligenceCycleState());
  };

  const label = statusLabel(state, active, tickRunning);
  const color = statusColor(state, active, tickRunning);
  const intervalMin = Math.round(state.intervalMs / 60000);
  const staleWarning = getStaleWarning(state);

  // Calculate tick duration if available
  let tickDuration: string | null = null;
  if (state.lastTickStartedAt && state.lastTickCompletedAt) {
    const startMs = Date.parse(state.lastTickStartedAt);
    const endMs = Date.parse(state.lastTickCompletedAt);
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
      tickDuration = formatDuration(endMs - startMs);
    }
  }

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
            <Zap size={17} />
          </span>
          <div>
            <h2 className="text-lg font-medium tracking-tight" style={{ color: "#e5e7eb" }}>
              Auto Intelligence Cycle
            </h2>
            <p className="mt-1 text-xs leading-5" style={{ color: "#6b7280" }}>
              Browser-local 15-minute market data refresh -- paper-only automation
            </p>
          </div>
        </div>
        <span
          className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em]"
          style={{ color, border: `1px solid ${color}33`, background: `${color}0d` }}
        >
          {label}
        </span>
      </div>

      {/* Safety indicators */}
      <div
        className="mb-4 rounded-lg p-3"
        style={{ background: "rgba(201, 215, 227, 0.02)", border: "1px solid rgba(201, 215, 227, 0.05)" }}
      >
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            "Paper-only automation",
            "No wallet connection",
            "No real orders",
            "No paper positions opened automatically",
            "Manual approval required for any position",
            "Read-only public market data",
          ].map((text) => (
            <p key={text} className="text-[11px] leading-4" style={{ color: "#6b7280" }}>
              <span style={{ color: "#22c55e" }}>{"\u2713"}</span> {text}
            </p>
          ))}
        </div>
      </div>

      {/* Stale warning */}
      {staleWarning && (
        <div className="mb-4 rounded-lg p-3" style={{ background: "rgba(245, 158, 11, 0.06)", border: "1px solid rgba(245, 158, 11, 0.16)" }}>
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} style={{ color: "#f59e0b" }} className="mt-0.5 shrink-0" />
            <p className="text-xs leading-5" style={{ color: "#a78b63" }}>{staleWarning}</p>
          </div>
        </div>
      )}

      {/* Metrics row 1 */}
      <div className="mb-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg p-3" style={{ background: "rgba(201, 215, 227, 0.025)", border: "1px solid rgba(201, 215, 227, 0.06)" }}>
          <p className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#6b7280" }}>Interval</p>
          <p className="mt-1.5 text-sm font-medium" style={{ color: "#d1d5db" }}>{intervalMin} min</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: "rgba(201, 215, 227, 0.025)", border: "1px solid rgba(201, 215, 227, 0.06)" }}>
          <p className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#6b7280" }}>Last Completed</p>
          <p className="mt-1.5 text-sm font-medium" style={{ color: "#d1d5db" }}>{formatTimestamp(state.lastTickCompletedAt)}</p>
          {tickDuration && <p className="mt-0.5 text-[10px]" style={{ color: "#5f6977" }}>Duration: {tickDuration}</p>}
        </div>
        <div className="rounded-lg p-3" style={{ background: "rgba(201, 215, 227, 0.025)", border: "1px solid rgba(201, 215, 227, 0.06)" }}>
          <p className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#6b7280" }}>Last Score</p>
          <p className="mt-1.5 text-sm font-medium" style={{ color: state.lastScore !== null ? (state.lastScore >= 70 ? "#22c55e" : state.lastScore >= 50 ? "#f59e0b" : "#ef4444") : "#6b7280" }}>
            {state.lastScore !== null ? `${state.lastScore}/100` : "N/A"}
          </p>
        </div>
        <div className="rounded-lg p-3" style={{ background: "rgba(201, 215, 227, 0.025)", border: "1px solid rgba(201, 215, 227, 0.06)" }}>
          <p className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#6b7280" }}>Next Run</p>
          <p className="mt-1.5 text-sm font-medium" style={{ color: active ? "#d1d5db" : "#6b7280" }}>
            {state.nextRunAt ? formatTimestamp(state.nextRunAt) : "N/A"}
          </p>
        </div>
      </div>

      {/* Metrics row 2: symbols + source */}
      <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg p-3" style={{ background: "rgba(201, 215, 227, 0.025)", border: "1px solid rgba(201, 215, 227, 0.06)" }}>
          <p className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#6b7280" }}>Symbols Scanned</p>
          <p className="mt-1.5 text-sm font-medium" style={{ color: "#d1d5db" }}>{state.symbolsScanned}</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: "rgba(201, 215, 227, 0.025)", border: "1px solid rgba(201, 215, 227, 0.06)" }}>
          <p className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#6b7280" }}>Succeeded</p>
          <p className="mt-1.5 text-sm font-medium" style={{ color: state.symbolsSucceeded > 0 ? "#22c55e" : "#6b7280" }}>{state.symbolsSucceeded}</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: "rgba(201, 215, 227, 0.025)", border: "1px solid rgba(201, 215, 227, 0.06)" }}>
          <p className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#6b7280" }}>Failed</p>
          <p className="mt-1.5 text-sm font-medium" style={{ color: state.symbolsFailed > 0 ? "#ef4444" : "#6b7280" }}>{state.symbolsFailed}</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: "rgba(201, 215, 227, 0.025)", border: "1px solid rgba(201, 215, 227, 0.06)" }}>
          <p className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#6b7280" }}>Source</p>
          <p className="mt-1.5 text-xs" style={{ color: "#9ca3af" }}>{state.lastSource?.replace(/_/g, " ") ?? "N/A"}</p>
        </div>
      </div>

      {/* Metrics row 3: observations */}
      <div className="mb-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-lg p-3" style={{ background: "rgba(201, 215, 227, 0.025)", border: "1px solid rgba(201, 215, 227, 0.06)" }}>
          <p className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#6b7280" }}>Observations Created</p>
          <p className="mt-1.5 text-sm font-medium" style={{ color: state.observationsCreated > 0 ? "#84cc16" : "#6b7280" }}>{state.observationsCreated}</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: "rgba(201, 215, 227, 0.025)", border: "1px solid rgba(201, 215, 227, 0.06)" }}>
          <p className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#6b7280" }}>Observations Skipped</p>
          <p className="mt-1.5 text-sm font-medium" style={{ color: state.observationsSkipped > 0 ? "#f59e0b" : "#6b7280" }}>{state.observationsSkipped}</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: "rgba(201, 215, 227, 0.025)", border: "1px solid rgba(201, 215, 227, 0.06)" }}>
          <p className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#6b7280" }}>Total Auto Obs</p>
          <p className="mt-1.5 text-sm font-medium" style={{ color: "#d1d5db" }}>{state.autoObservations?.length ?? 0}</p>
        </div>
      </div>

      {/* Metrics row 4: signal quality + candidates */}
      <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg p-3" style={{ background: "rgba(201, 215, 227, 0.025)", border: "1px solid rgba(201, 215, 227, 0.06)" }}>
          <p className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#6b7280" }}>Signal Records</p>
          <p className="mt-1.5 text-sm font-medium" style={{ color: state.signalRecordsCreated > 0 ? "#84cc16" : "#6b7280" }}>{state.signalRecordsCreated ?? 0}</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: "rgba(201, 215, 227, 0.025)", border: "1px solid rgba(201, 215, 227, 0.06)" }}>
          <p className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#6b7280" }}>Signals Skipped</p>
          <p className="mt-1.5 text-sm font-medium" style={{ color: state.signalRecordsSkipped > 0 ? "#f59e0b" : "#6b7280" }}>{state.signalRecordsSkipped ?? 0}</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: "rgba(201, 215, 227, 0.025)", border: "1px solid rgba(201, 215, 227, 0.06)" }}>
          <p className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#6b7280" }}>Candidates Created</p>
          <p className="mt-1.5 text-sm font-medium" style={{ color: state.candidatesCreated > 0 ? "#84cc16" : "#6b7280" }}>{state.candidatesCreated ?? 0}</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: "rgba(201, 215, 227, 0.025)", border: "1px solid rgba(201, 215, 227, 0.06)" }}>
          <p className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "#6b7280" }}>Candidates Skipped</p>
          <p className="mt-1.5 text-sm font-medium" style={{ color: state.candidatesSkipped > 0 ? "#f59e0b" : "#6b7280" }}>{state.candidatesSkipped ?? 0}</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg p-3" style={{ background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.16)" }}>
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} style={{ color: "#ef4444" }} className="mt-0.5 shrink-0" />
            <p className="text-xs leading-5" style={{ color: "#ef4444" }}>{error}</p>
          </div>
        </div>
      )}

      {/* Last error from cycle */}
      {state.lastError && !error && (
        <div className="mb-4 rounded-lg p-3" style={{ background: "rgba(245, 158, 11, 0.06)", border: "1px solid rgba(245, 158, 11, 0.16)" }}>
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} style={{ color: "#f59e0b" }} className="mt-0.5 shrink-0" />
            <p className="text-xs leading-5" style={{ color: "#a78b63" }}>Last tick error: {state.lastError}</p>
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="flex flex-wrap gap-3">
        {!active ? (
          <button
            onClick={handleStart}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
            style={{ background: "rgba(34, 197, 94, 0.12)", border: "1px solid rgba(34, 197, 94, 0.3)", color: "#22c55e" }}
          >
            <Play size={14} /> Start cycle
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
            style={{ background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#ef4444" }}
          >
            <Square size={14} /> Stop cycle
          </button>
        )}
        <button
          onClick={handleRunNow}
          disabled={loading || tickRunning}
          className="rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
          style={{ background: "rgba(204, 146, 88, 0.12)", border: "1px solid rgba(204, 146, 88, 0.3)", color: "#cc9258" }}
        >
          <RotateCcw size={14} /> {loading || tickRunning ? "Running..." : "Run now"}
        </button>
        <button
          onClick={handleClear}
          disabled={state.history.length === 0}
          className="rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50"
          style={{ background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.16)", color: "#ef4444" }}
        >
          Clear history
        </button>
      </div>

      {/* Recent auto observations */}
      {state.autoObservations && state.autoObservations.length > 0 && (
        <details className="mt-4" style={{ borderTop: "1px solid rgba(201, 215, 227, 0.05)", paddingTop: 12 }}>
          <summary className="cursor-pointer text-xs" style={{ color: "#6b7280" }}>
            Auto observations -- {state.autoObservations.length} total (latest 10)
          </summary>
          <div className="mt-2 space-y-1.5 max-h-48 overflow-auto">
            {state.autoObservations.slice(0, 10).map((obs, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5" style={{ background: "rgba(201, 215, 227, 0.02)" }}>
                <span className="text-[11px] font-medium" style={{ color: "#9ca3af" }}>AUTO OBSERVATION - PAPER ONLY</span>
                <span className="text-[11px]" style={{ color: "#6b7280" }}>{obs.symbol}</span>
                <span className="text-[11px]" style={{ color: obs.integrityScore >= 70 ? "#22c55e" : obs.integrityScore >= 50 ? "#f59e0b" : "#ef4444" }}>{obs.integrityScore}/100</span>
                <span className="text-[10px]" style={{ color: "#5f6977" }}>{formatTimestamp(obs.timestamp)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* History */}
      {state.history.length > 0 && (
        <details className="mt-4" style={{ borderTop: "1px solid rgba(201, 215, 227, 0.05)", paddingTop: 12 }}>
          <summary className="cursor-pointer text-xs" style={{ color: "#6b7280" }}>
            Tick history -- {state.history.length} / {50}
          </summary>
          <div className="mt-2 space-y-1.5 max-h-48 overflow-auto">
            {state.history.slice(0, 20).map((run, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5" style={{ background: "rgba(201, 215, 227, 0.02)" }}>
                <span className="text-[11px]" style={{ color: run.status === "passed" ? "#84cc16" : "#ef4444" }}>{run.status}</span>
                <span className="text-[11px]" style={{ color: "#9ca3af" }}>{run.symbol}</span>
                <span className="text-[11px]" style={{ color: "#6b7280" }}>{run.score !== null ? `${run.score}/100` : "--"}</span>
                <span className="text-[10px]" style={{ color: "#5f6977" }}>{formatTimestamp(run.runAt)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <p className="mt-4 text-[10px]" style={{ color: "#4b5563" }}>
        Paper-only automation. No wallet connection. No real orders. No paper positions opened automatically.
      </p>
    </div>
  );
}
