import { useState } from "react";
import { Activity, ArrowRight, RefreshCw, Trash2 } from "lucide-react";
import AddTradeModal from "@/components/AddTradeModal";
import { useAppState, usePortfolio } from "@/context/AppContext";
import {
  clearPaperSignalHistory,
  generatePaperSignals,
  loadPaperSignalHistory,
  MAX_PAPER_SIGNAL_HISTORY,
  savePaperSignalHistory,
  type PaperSignal,
  type PaperSignalLabel,
} from "@/lib/paperSignalEngine";
import type { PaperTrade } from "@/types";

interface PaperSignalEngineProps {
  className?: string;
}

const SIGNAL_COLORS: Record<PaperSignalLabel, string> = {
  BUY: "#22c55e",
  SELL: "#ef4444",
  HOLD: "#c9d7e3",
  AVOID: "#f59e0b",
};

function formatSignalTime(timestamp: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export default function PaperSignalEngine({ className = "" }: PaperSignalEngineProps) {
  const { state, dispatch, coins, priceStatus } = useAppState();
  const { positions, totalValue, totalPLPercent } = usePortfolio();
  const [history, setHistory] = useState<PaperSignal[]>(loadPaperSignalHistory);
  const [selectedSignal, setSelectedSignal] = useState<PaperSignal | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  const latestTimestamp = history[0]?.timestamp;
  const latestSignals = latestTimestamp
    ? history.filter((signal) => signal.timestamp === latestTimestamp)
    : [];
  const liveDataUnavailable = priceStatus !== "live";

  const handleGenerate = () => {
    const generatedSignals = generatePaperSignals({
      coins,
      positions,
      alerts: state.alerts,
      priceStatus,
      totalValue,
      totalPLPercent,
    });
    const nextHistory = [...generatedSignals, ...history].slice(0, MAX_PAPER_SIGNAL_HISTORY);

    setHistory(nextHistory);
    setStorageError(
      savePaperSignalHistory(nextHistory)
        ? null
        : "Signal history could not be saved in this browser.",
    );
  };

  const handleClear = () => {
    if (!window.confirm("Clear all browser-local paper signal history?")) return;

    setHistory([]);
    setStorageError(
      clearPaperSignalHistory()
        ? null
        : "Signal history was cleared for this session, but browser storage could not be updated.",
    );
  };

  const handleAddTrade = (trade: PaperTrade) => {
    dispatch({ type: "ADD_TRADE", payload: trade });
  };

  return (
    <section
      className={`card-surface rounded-xl p-5 lg:p-6 ${className}`}
      style={{ border: "1px solid rgba(201,215,227,0.06)" }}
      aria-labelledby="paper-signal-engine-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Activity size={16} style={{ color: "#cc9258" }} />
            <h3 id="paper-signal-engine-title" className="section-title" style={{ fontSize: 22 }}>
              Signal Engine
            </h3>
          </div>
          <p className="text-xs" style={{ color: "#6b7280" }}>
            Local rule-based market and paper-portfolio tracking
          </p>
        </div>

        <span
          className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.08em]"
          style={{ color: "#cc9258", border: "1px solid rgba(204,146,88,0.24)" }}
        >
          Local / Paper
        </span>
      </div>

      <div
        className="mt-5 rounded-lg p-4"
        style={{
          backgroundColor: liveDataUnavailable ? "rgba(245,158,11,0.05)" : "rgba(201,215,227,0.02)",
          border: `1px solid ${liveDataUnavailable ? "rgba(245,158,11,0.16)" : "rgba(201,215,227,0.05)"}`,
        }}
      >
        <p className="text-xs" style={{ color: liveDataUnavailable ? "#f59e0b" : "#9ca3af" }}>
          {liveDataUnavailable
            ? "HOLD / unavailable — live price data is not ready. Mock fallback values will never create a directional signal."
            : "Live displayed prices are available for a local signal snapshot."}
        </p>
        <p className="mt-2 text-xs" style={{ color: "#6b7280" }}>
          Paper signal only. No real orders are placed.
        </p>
        <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>
          For tracking only. Not financial advice.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={handleGenerate} className="btn-accent flex items-center gap-2">
          <RefreshCw size={14} />
          Generate Signals
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="btn-danger flex items-center gap-2"
          disabled={history.length === 0}
        >
          <Trash2 size={14} />
          Clear Signal History
        </button>
      </div>

      {storageError && (
        <p role="alert" className="mt-4 text-xs" style={{ color: "#ef4444" }}>
          {storageError}
        </p>
      )}

      {latestSignals.length === 0 ? (
        <div
          className="mt-5 rounded-lg p-6 text-center"
          style={{ border: "1px dashed rgba(201,215,227,0.1)" }}
        >
          <p className="text-sm" style={{ color: "#9ca3af" }}>
            No paper signals generated yet.
          </p>
          <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>
            Generate a local snapshot for BTC, ETH, SOL, ADA, and AVAX.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {latestSignals.map((signal) => {
            const signalColor = SIGNAL_COLORS[signal.label];
            const isActionable = signal.label === "BUY" || signal.label === "SELL";

            return (
              <article
                key={signal.id}
                className="rounded-lg p-4"
                style={{
                  backgroundColor: "rgba(201,215,227,0.02)",
                  border: "1px solid rgba(201,215,227,0.05)",
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="data-mono text-sm" style={{ color: "#c9d7e3" }}>
                      {signal.symbol}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.08em]" style={{ color: "#4b5563" }}>
                      Confidence · {signal.confidence}
                    </p>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em]"
                    style={{ color: signalColor, border: `1px solid ${signalColor}40` }}
                  >
                    {signal.label}
                  </span>
                </div>

                <p className="mt-4 text-sm" style={{ color: "#9ca3af", lineHeight: 1.6 }}>
                  {signal.reason}
                </p>
                <p className="mt-3 text-xs" style={{ color: "#6b7280", lineHeight: 1.6 }}>
                  Risk note: {signal.riskNote}
                </p>
                <time className="mt-3 block text-[10px]" style={{ color: "#4b5563" }} dateTime={signal.timestamp}>
                  {formatSignalTime(signal.timestamp)}
                </time>

                {isActionable ? (
                  <button
                    type="button"
                    onClick={() => setSelectedSignal(signal)}
                    className="mt-4 flex items-center gap-2 text-xs transition-colors hover:text-[#cc9258]"
                    style={{ color: "#9ca3af" }}
                  >
                    Create paper trade from signal
                    <ArrowRight size={13} />
                  </button>
                ) : (
                  <p className="mt-4 text-[10px] uppercase tracking-[0.08em]" style={{ color: "#4b5563" }}>
                    No paper trade action for {signal.label}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}

      {history.length > 0 && (
        <details className="mt-6" style={{ borderTop: "1px solid rgba(201,215,227,0.05)", paddingTop: 16 }}>
          <summary className="cursor-pointer text-xs" style={{ color: "#6b7280" }}>
            Signal history · {history.length} / {MAX_PAPER_SIGNAL_HISTORY}
          </summary>
          <div className="mt-3 grid gap-2">
            {history.map((signal) => (
              <div
                key={signal.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md px-3 py-2"
                style={{ backgroundColor: "rgba(201,215,227,0.018)" }}
              >
                <span className="data-mono text-xs" style={{ color: "#9ca3af" }}>
                  {signal.symbol}
                </span>
                <span className="text-[10px] font-semibold" style={{ color: SIGNAL_COLORS[signal.label] }}>
                  {signal.label} · {signal.confidence}
                </span>
                <time className="text-[10px]" style={{ color: "#4b5563" }} dateTime={signal.timestamp}>
                  {formatSignalTime(signal.timestamp)}
                </time>
              </div>
            ))}
          </div>
        </details>
      )}

      {selectedSignal && (selectedSignal.label === "BUY" || selectedSignal.label === "SELL") && (
        <AddTradeModal
          initialCoinId={selectedSignal.coinId}
          initialType={selectedSignal.label === "BUY" ? "buy" : "sell"}
          onAdd={handleAddTrade}
          onClose={() => setSelectedSignal(null)}
        />
      )}
    </section>
  );
}
