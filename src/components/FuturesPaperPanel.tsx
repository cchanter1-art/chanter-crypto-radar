import { useState } from "react";
import { Activity, ShieldAlert, Sparkles, Trash2, XCircle } from "lucide-react";
import { usePortfolio } from "@/context/AppContext";
import {
  clearFuturesPaperHistory,
  createFuturesHistoryRecord,
  createFuturesPaperPosition,
  evaluateFuturesPaperRisk,
  getFuturesMockMarkPrice,
  getFuturesPositionMetrics,
  getFuturesPositionState,
  loadFuturesPaperHistory,
  loadFuturesPaperPositions,
  loadFuturesPaperSettings,
  MAX_FUTURES_PAPER_HISTORY,
  recordFuturesDailyLoss,
  saveFuturesPaperHistory,
  saveFuturesPaperPositions,
  saveFuturesPaperSettings,
  SUPPORTED_FUTURES_LEVERAGE,
  SUPPORTED_FUTURES_SYMBOLS,
  type FuturesDirection,
  type FuturesLeverage,
  type FuturesPaperPosition,
  type FuturesPaperTradeInput,
  type FuturesRiskDecisionType,
  type FuturesSymbol,
} from "@/lib/futuresPaperEngine";
import { loadPaperRiskSettings } from "@/lib/paperRiskController";
import {
  FUTURES_STRATEGY_PROFILES,
  generateFuturesStrategySetup,
  loadFuturesStrategyProfile,
  saveFuturesStrategyProfile,
  type FuturesStrategyProfile,
  type FuturesStrategySetup,
} from "@/lib/futuresStrategyProfiles";

interface FuturesPaperPanelProps {
  className?: string;
}

interface FuturesFormState {
  symbol: FuturesSymbol;
  direction: FuturesDirection;
  entryPrice: string;
  marginAmount: string;
  leverage: FuturesLeverage;
  stopLossPercent: string;
  takeProfitPercent: string;
  strategyReason: string;
}

const DECISION_COLORS: Record<FuturesRiskDecisionType, string> = {
  APPROVED: "#22c55e",
  BLOCKED: "#ef4444",
  WAIT: "#9ca3af",
};

function createInitialForm(): FuturesFormState {
  const symbol: FuturesSymbol = "BTCUSDT";
  return {
    symbol,
    direction: "LONG",
    entryPrice: String(getFuturesMockMarkPrice(symbol)),
    marginAmount: "500",
    leverage: 1,
    stopLossPercent: "5",
    takeProfitPercent: "10",
    strategyReason: "",
  };
}

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const decimals = value >= 1_000 ? 2 : value >= 10 ? 4 : 6;
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export default function FuturesPaperPanel({ className = "" }: FuturesPaperPanelProps) {
  const { totalValue } = usePortfolio();
  const [form, setForm] = useState<FuturesFormState>(createInitialForm);
  const [positions, setPositions] = useState(loadFuturesPaperPositions);
  const [history, setHistory] = useState(loadFuturesPaperHistory);
  const [settings, setSettings] = useState(loadFuturesPaperSettings);
  const [dailyLossInput, setDailyLossInput] = useState(String(settings.maxDailyLossPercent));
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [riskSettings] = useState(loadPaperRiskSettings);
  const [selectedProfile, setSelectedProfile] =
    useState<FuturesStrategyProfile>(loadFuturesStrategyProfile);
  const [generatedSetup, setGeneratedSetup] = useState<FuturesStrategySetup | null>(null);

  const markPrice = getFuturesMockMarkPrice(form.symbol);
  const trade: FuturesPaperTradeInput = {
    symbol: form.symbol,
    direction: form.direction,
    entryPrice: Number(form.entryPrice),
    marginAmount: Number(form.marginAmount),
    leverage: form.leverage,
    stopLossPercent: Number(form.stopLossPercent),
    takeProfitPercent: Number(form.takeProfitPercent),
    strategyReason: form.strategyReason,
  };
  const preview = evaluateFuturesPaperRisk({
    trade,
    markPrice,
    openPositions: positions,
    history,
    futuresSettings: settings,
    riskSettings,
    paperPortfolioValue: totalValue,
  });
  const decisionColor = DECISION_COLORS[preview.decision];
  const selectedPositionState = getFuturesPositionState(form.symbol, positions);

  const updateForm = <K extends keyof FuturesFormState>(
    key: K,
    value: FuturesFormState[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    setStatus(null);
  };

  const handleSymbolChange = (symbol: FuturesSymbol) => {
    setForm((current) => ({
      ...current,
      symbol,
      entryPrice: String(getFuturesMockMarkPrice(symbol)),
    }));
    setGeneratedSetup(null);
    setStatus(null);
  };

  const handleProfileChange = (profile: FuturesStrategyProfile) => {
    setSelectedProfile(profile);
    setGeneratedSetup(null);
    setStatus(
      saveFuturesStrategyProfile(profile)
        ? null
        : { type: "error", message: "The selected futures strategy profile could not be saved." },
    );
  };

  const handleGenerateSetup = () => {
    if (selectedProfile === "Manual") return;

    const setup = generateFuturesStrategySetup(selectedProfile, form.symbol);
    setGeneratedSetup(setup);

    if (setup.suggestedDirection === "WAIT") {
      setStatus(null);
      return;
    }
    const suggestedDirection: FuturesDirection = setup.suggestedDirection;

    setForm((current) => ({
      ...current,
      symbol: setup.symbol,
      direction: suggestedDirection,
      entryPrice: String(setup.entryReference),
      leverage: setup.leverageSuggestion,
      stopLossPercent: String(setup.stopLossPercent),
      takeProfitPercent: String(setup.takeProfitPercent),
      strategyReason: setup.strategyReason,
    }));
    setStatus({
      type: "success",
      message: `${setup.profile} paper setup generated. Review the Futures Risk Preview before opening manually.`,
    });
  };

  const handleSaveDailyLoss = () => {
    const maxDailyLossPercent = Number(dailyLossInput);
    const nextSettings = {
      ...settings,
      maxDailyLossPercent,
    };

    if (!saveFuturesPaperSettings(nextSettings)) {
      setStatus({ type: "error", message: "Maximum daily loss must be greater than 0% and no more than 100%." });
      return;
    }

    setSettings(nextSettings);
    setStatus({ type: "success", message: "Futures paper settings saved locally." });
  };

  const handleOpenPosition = () => {
    if (generatedSetup?.suggestedDirection === "WAIT") {
      setStatus({ type: "error", message: "The generated strategy setup is WAIT and cannot open a futures paper position." });
      return;
    }

    const latestPreview = evaluateFuturesPaperRisk({
      trade,
      markPrice,
      openPositions: positions,
      history,
      futuresSettings: settings,
      riskSettings,
      paperPortfolioValue: totalValue,
    });

    if (latestPreview.decision !== "APPROVED") {
      setStatus({ type: "error", message: latestPreview.reason });
      return;
    }

    const position = createFuturesPaperPosition(trade, latestPreview);
    if (!position) {
      setStatus({ type: "error", message: "The futures paper position could not be created." });
      return;
    }

    const record = createFuturesHistoryRecord(position, "OPEN", markPrice);
    const nextPositions = [position, ...positions];
    const nextHistory = [record, ...history].slice(0, MAX_FUTURES_PAPER_HISTORY);
    const didSave = saveFuturesPaperPositions(nextPositions) &&
      saveFuturesPaperHistory(nextHistory);

    if (!didSave) {
      saveFuturesPaperPositions(positions);
      saveFuturesPaperHistory(history);
      setStatus({ type: "error", message: "The position could not be saved in browser storage." });
      return;
    }

    setPositions(nextPositions);
    setHistory(nextHistory);
    setForm((current) => ({ ...current, strategyReason: "" }));
    setStatus({ type: "success", message: `${position.symbol} ${position.direction} futures paper position opened.` });
  };

  const handleClosePosition = (position: FuturesPaperPosition) => {
    const closeMarkPrice = getFuturesMockMarkPrice(position.symbol);
    const record = createFuturesHistoryRecord(position, "CLOSE", closeMarkPrice);
    const nextPositions = positions.filter((item) => item.id !== position.id);
    const nextHistory = [record, ...history].slice(0, MAX_FUTURES_PAPER_HISTORY);
    const nextSettings = recordFuturesDailyLoss(settings, record.realizedPnl, record.timestamp);
    const didSave = saveFuturesPaperPositions(nextPositions) &&
      saveFuturesPaperHistory(nextHistory) &&
      saveFuturesPaperSettings(nextSettings);

    if (!didSave) {
      saveFuturesPaperPositions(positions);
      saveFuturesPaperHistory(history);
      saveFuturesPaperSettings(settings);
      setStatus({ type: "error", message: "The position could not be closed in browser storage." });
      return;
    }

    setPositions(nextPositions);
    setHistory(nextHistory);
    setSettings(nextSettings);
    setStatus({ type: "success", message: `${position.symbol} futures paper position closed at the local mock mark.` });
  };

  const handleClearHistory = () => {
    if (!window.confirm("Clear all browser-local futures paper history? Open positions will remain.")) return;

    if (!clearFuturesPaperHistory()) {
      setStatus({ type: "error", message: "Futures paper history could not be cleared." });
      return;
    }
    setHistory([]);
    setStatus({ type: "success", message: "Futures paper history cleared." });
  };

  return (
    <section
      className={`card-surface rounded-xl p-5 lg:p-6 ${className}`}
      style={{ border: "1px solid rgba(201,215,227,0.06)" }}
      aria-labelledby="futures-paper-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Activity size={16} style={{ color: "#cc9258" }} />
            <h3 id="futures-paper-title" className="section-title" style={{ fontSize: 22 }}>
              15m Futures Paper Mode
            </h3>
          </div>
          <p className="text-xs" style={{ color: "#6b7280" }}>
            Local isolated-margin strategy simulator
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.08em]" style={{ color: "#9ca3af", border: "1px solid rgba(201,215,227,0.12)" }}>
            15m / Mock
          </span>
          <span className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.08em]" style={{ color: "#cc9258", border: "1px solid rgba(204,146,88,0.24)" }}>
            Isolated / Paper
          </span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <p style={{ color: "#9ca3af" }}>Futures Paper Mode only. No real orders are placed.</p>
        <p style={{ color: "#9ca3af" }}>Strategy profiles generate paper setups only.</p>
        <p style={{ color: "#9ca3af" }}>15m profiles use local/mock candle data.</p>
        <p style={{ color: "#6b7280" }}>Leverage increases liquidation risk.</p>
        <p style={{ color: "#6b7280" }}>Isolated margin simulation only.</p>
        <p style={{ color: "#6b7280" }}>Past simulated behavior does not predict future results.</p>
        <p style={{ color: "#4b5563" }}>For tracking only. Not financial advice.</p>
      </div>

      <div
        className="mt-6 rounded-xl p-4 lg:p-5"
        style={{ backgroundColor: "rgba(201,215,227,0.02)", border: "1px solid rgba(201,215,227,0.05)" }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label htmlFor="futures-strategy-profile" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
              Futures strategy profile
            </label>
            <select
              id="futures-strategy-profile"
              value={selectedProfile}
              onChange={(event) => handleProfileChange(event.target.value as FuturesStrategyProfile)}
              className="input-dark cursor-pointer"
            >
              {FUTURES_STRATEGY_PROFILES.map((profile) => (
                <option key={profile} value={profile}>{profile}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleGenerateSetup}
            className="btn-accent flex items-center justify-center gap-2"
            disabled={selectedProfile === "Manual"}
          >
            <Sparkles size={14} />
            Generate futures paper setup
          </button>
        </div>

        {generatedSetup && (
          <div className="mt-5" style={{ borderTop: "1px solid rgba(201,215,227,0.05)", paddingTop: 16 }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="data-mono text-sm" style={{ color: "#c9d7e3" }}>
                  {generatedSetup.symbol} · {generatedSetup.profile}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.08em]" style={{ color: "#6b7280" }}>
                  Confidence · {generatedSetup.confidence}
                </p>
              </div>
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em]"
                style={{
                  color: generatedSetup.suggestedDirection === "LONG"
                    ? "#22c55e"
                    : generatedSetup.suggestedDirection === "SHORT"
                      ? "#ef4444"
                      : "#9ca3af",
                  border: "1px solid rgba(201,215,227,0.12)",
                }}
              >
                {generatedSetup.suggestedDirection}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <PreviewMetric label="Entry reference" value={formatPrice(generatedSetup.entryReference)} />
              <PreviewMetric label="Stop-loss" value={`${generatedSetup.stopLossPercent.toFixed(2)}%`} />
              <PreviewMetric label="Take-profit" value={`${generatedSetup.takeProfitPercent.toFixed(2)}%`} />
              <PreviewMetric label="Leverage suggestion" value={`${generatedSetup.leverageSuggestion}x`} />
            </div>
            <p className="mt-4 text-xs" style={{ color: "#9ca3af", lineHeight: 1.6 }}>
              {generatedSetup.strategyReason}
            </p>
            <p className="mt-2 text-xs" style={{ color: "#6b7280", lineHeight: 1.6 }}>
              Invalidation: {generatedSetup.invalidationNote}
            </p>
            <p className="mt-2 text-xs" style={{ color: "#4b5563", lineHeight: 1.6 }}>
              Risk note: {generatedSetup.riskNote}
            </p>
            {generatedSetup.suggestedDirection === "WAIT" && (
              <p className="mt-3 text-xs" style={{ color: "#f59e0b" }}>
                WAIT setups do not modify the actionable futures paper form.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr]">
        <div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="futures-symbol" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>Symbol</label>
              <select id="futures-symbol" value={form.symbol} onChange={(event) => handleSymbolChange(event.target.value as FuturesSymbol)} className="input-dark cursor-pointer">
                {SUPPORTED_FUTURES_SYMBOLS.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="futures-direction" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>Direction</label>
              <select id="futures-direction" value={form.direction} onChange={(event) => updateForm("direction", event.target.value as FuturesDirection)} className="input-dark cursor-pointer">
                <option value="LONG">LONG</option>
                <option value="SHORT">SHORT</option>
              </select>
            </div>
            <div>
              <label htmlFor="futures-entry" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>Entry price (USD)</label>
              <input id="futures-entry" type="number" min="0" step="any" value={form.entryPrice} onChange={(event) => updateForm("entryPrice", event.target.value)} className="input-dark" />
              <button type="button" onClick={() => updateForm("entryPrice", String(markPrice))} className="mt-2 text-[10px]" style={{ color: "#cc9258" }}>
                Use local mock mark · {formatPrice(markPrice)}
              </button>
            </div>
            <div>
              <label htmlFor="futures-margin" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>Margin amount (USD)</label>
              <input id="futures-margin" type="number" min="0" step="any" value={form.marginAmount} onChange={(event) => updateForm("marginAmount", event.target.value)} className="input-dark" />
            </div>
            <div>
              <label htmlFor="futures-leverage" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>Leverage</label>
              <select id="futures-leverage" value={form.leverage} onChange={(event) => updateForm("leverage", Number(event.target.value) as FuturesLeverage)} className="input-dark cursor-pointer">
                {SUPPORTED_FUTURES_LEVERAGE.map((leverage) => <option key={leverage} value={leverage}>{leverage}x</option>)}
              </select>
              {form.leverage === 5 && (
                <p className="mt-2 flex items-center gap-1 text-[10px]" style={{ color: "#ef4444" }}>
                  <ShieldAlert size={11} /> 5x is the highest-risk paper leverage setting.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="futures-stop" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>Stop-loss (%)</label>
              <input id="futures-stop" type="number" min="0" max="99.99" step="any" value={form.stopLossPercent} onChange={(event) => updateForm("stopLossPercent", event.target.value)} className="input-dark" />
            </div>
            <div>
              <label htmlFor="futures-target" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>Take-profit (%)</label>
              <input id="futures-target" type="number" min="0" step="any" value={form.takeProfitPercent} onChange={(event) => updateForm("takeProfitPercent", event.target.value)} className="input-dark" />
            </div>
            <div>
              <label htmlFor="futures-daily-loss" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>Max daily loss (%)</label>
              <div className="flex gap-2">
                <input id="futures-daily-loss" type="number" min="0.1" max="100" step="0.1" value={dailyLossInput} onChange={(event) => setDailyLossInput(event.target.value)} className="input-dark" />
                <button type="button" onClick={handleSaveDailyLoss} className="btn-accent shrink-0" style={{ padding: "10px 12px" }}>Save</button>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="futures-reason" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>Strategy reason</label>
            <textarea id="futures-reason" value={form.strategyReason} onChange={(event) => updateForm("strategyReason", event.target.value)} className="input-dark min-h-24 resize-y" placeholder="Describe the local paper setup..." />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleOpenPosition}
              className="btn-accent"
              disabled={
                preview.decision !== "APPROVED" ||
                generatedSetup?.suggestedDirection === "WAIT"
              }
            >
              Open futures paper position
            </button>
            <span className="text-xs" style={{ color: "#4b5563" }}>
              {form.symbol} position model · {selectedPositionState}
            </span>
          </div>
        </div>

        <div
          className="rounded-xl p-4 lg:p-5"
          style={{ backgroundColor: "rgba(201,215,227,0.02)", border: `1px solid ${decisionColor}24` }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="label-upper" style={{ color: "#6b7280", fontSize: 10 }}>Futures Risk Preview</p>
              <p className="mt-1 data-mono text-sm" style={{ color: "#c9d7e3" }}>{preview.symbol} · {preview.direction}</p>
            </div>
            <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em]" style={{ color: decisionColor, border: `1px solid ${decisionColor}40` }}>
              {preview.decision}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
            <PreviewMetric label="Leverage" value={`${preview.leverage}x`} />
            <PreviewMetric label="Margin" value={formatUsd(preview.marginAmount)} />
            <PreviewMetric label="Notional size" value={formatUsd(preview.notionalSize)} />
            <PreviewMetric label="Liquidation estimate" value={formatPrice(preview.liquidationPrice)} />
            <PreviewMetric label="Stop-loss price" value={formatPrice(preview.stopLossPrice)} />
            <PreviewMetric label="Take-profit price" value={formatPrice(preview.takeProfitPrice)} />
            <PreviewMetric label="Estimated loss at stop" value={formatUsd(preview.estimatedLossAtStop)} color="#ef4444" />
            <PreviewMetric label="Estimated gain at target" value={formatUsd(preview.estimatedGainAtTarget)} color="#22c55e" />
            <PreviewMetric label="Risk / reward" value={`1 : ${preview.riskRewardRatio.toFixed(2)}`} />
            <PreviewMetric label="Unrealized P/L" value={formatUsd(preview.unrealizedPnl)} color={preview.unrealizedPnl >= 0 ? "#22c55e" : "#ef4444"} />
            <PreviewMetric label="Leveraged return" value={`${preview.leveragedReturnPercent.toFixed(2)}%`} color={preview.leveragedReturnPercent >= 0 ? "#22c55e" : "#ef4444"} />
            <PreviewMetric label="Margin mode" value="Isolated" />
          </div>
          <p className="mt-5 text-xs" style={{ color: decisionColor, lineHeight: 1.6 }}>{preview.reason}</p>
        </div>
      </div>

      {status && (
        <p role={status.type === "error" ? "alert" : "status"} className="mt-5 text-xs" style={{ color: status.type === "success" ? "#22c55e" : "#ef4444" }}>
          {status.message}
        </p>
      )}

      <div className="mt-7" style={{ borderTop: "1px solid rgba(201,215,227,0.05)", paddingTop: 20 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="label-upper" style={{ color: "#6b7280", fontSize: 10 }}>Open futures paper positions</p>
            <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>{positions.length} active · isolated margin only</p>
          </div>
        </div>

        {positions.length === 0 ? (
          <div className="mt-4 rounded-lg p-5 text-center" style={{ border: "1px dashed rgba(201,215,227,0.1)" }}>
            <p className="text-sm" style={{ color: "#9ca3af" }}>Position model · FLAT</p>
            <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>No futures paper positions are open.</p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {positions.map((position) => {
              const positionMark = getFuturesMockMarkPrice(position.symbol);
              const metrics = getFuturesPositionMetrics(position, positionMark);
              return (
                <article key={position.id} className="rounded-lg p-4" style={{ backgroundColor: "rgba(201,215,227,0.018)", border: "1px solid rgba(201,215,227,0.05)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="data-mono text-sm" style={{ color: "#c9d7e3" }}>{position.symbol}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-[0.08em]" style={{ color: position.direction === "LONG" ? "#22c55e" : "#ef4444" }}>{position.direction} · {position.leverage}x</p>
                    </div>
                    <button type="button" onClick={() => handleClosePosition(position)} className="btn-danger flex items-center gap-2">
                      <XCircle size={13} /> Close
                    </button>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <PreviewMetric label="Entry" value={formatPrice(position.entryPrice)} />
                    <PreviewMetric label="Mock mark" value={formatPrice(positionMark)} />
                    <PreviewMetric label="Margin" value={formatUsd(position.marginAmount)} />
                    <PreviewMetric label="Notional" value={formatUsd(metrics.notionalSize)} />
                    <PreviewMetric label="Unrealized P/L" value={formatUsd(metrics.unrealizedPnl)} color={metrics.unrealizedPnl >= 0 ? "#22c55e" : "#ef4444"} />
                    <PreviewMetric label="Leveraged return" value={`${metrics.leveragedReturnPercent.toFixed(2)}%`} color={metrics.leveragedReturnPercent >= 0 ? "#22c55e" : "#ef4444"} />
                  </div>
                  <p className="mt-3 text-xs" style={{ color: "#6b7280", lineHeight: 1.5 }}>{position.strategyReason}</p>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-7" style={{ borderTop: "1px solid rgba(201,215,227,0.05)", paddingTop: 20 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="label-upper" style={{ color: "#6b7280", fontSize: 10 }}>Futures paper history</p>
            <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>{history.length} / {MAX_FUTURES_PAPER_HISTORY} local records</p>
          </div>
          <button type="button" onClick={handleClearHistory} className="btn-danger flex items-center gap-2" disabled={history.length === 0}>
            <Trash2 size={13} /> Clear futures paper history
          </button>
        </div>

        {history.length === 0 ? (
          <div className="mt-4 rounded-lg p-4 text-center" style={{ border: "1px dashed rgba(201,215,227,0.1)" }}>
            <p className="text-xs" style={{ color: "#6b7280" }}>No futures paper history yet.</p>
          </div>
        ) : (
          <div className="mt-4 grid gap-2">
            {history.map((record) => (
              <div key={record.recordId} className="flex flex-wrap items-center justify-between gap-3 rounded-md px-3 py-2" style={{ backgroundColor: "rgba(201,215,227,0.018)" }}>
                <span className="data-mono text-xs" style={{ color: "#c9d7e3" }}>{record.symbol}</span>
                <span className="text-[10px] font-semibold" style={{ color: record.action === "OPEN" ? "#cc9258" : record.realizedPnl >= 0 ? "#22c55e" : "#ef4444" }}>
                  {record.action} · {record.direction} · {record.leverage}x
                </span>
                <span className="data-mono text-xs" style={{ color: record.realizedPnl >= 0 ? "#22c55e" : "#ef4444" }}>
                  {record.action === "CLOSE" ? formatUsd(record.realizedPnl) : formatUsd(record.marginAmount)}
                </span>
                <time className="text-[10px]" style={{ color: "#4b5563" }} dateTime={record.timestamp}>{formatTimestamp(record.timestamp)}</time>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PreviewMetric({
  label,
  value,
  color = "#c9d7e3",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>{label}</p>
      <p className="mt-1 data-mono text-xs" style={{ color }}>{value}</p>
    </div>
  );
}
