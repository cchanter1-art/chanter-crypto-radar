import { useState } from "react";
import { AlertTriangle, Gauge, History, Sparkles, Trash2 } from "lucide-react";
import { useAppState, usePortfolio } from "@/context/AppContext";
import {
  SUPPORTED_FUTURES_LEVERAGE,
  SUPPORTED_FUTURES_SYMBOLS,
  SUPPORTED_FUTURES_TEST_SCENARIOS,
  evaluateFuturesPaperRisk,
  loadFuturesPaperHistory,
  loadFuturesPaperPositions,
  loadFuturesPaperSettings,
  type FuturesLeverage,
  type FuturesPaperTradeInput,
  type FuturesSymbol,
  type FuturesTestScenario,
} from "@/lib/futuresPaperEngine";
import { loadPaperRiskSettings } from "@/lib/paperRiskController";
import { generateFuturesStrategySetup } from "@/lib/futuresStrategyProfiles";
import { loadFuturesStrategyBacktestHistory } from "@/lib/futuresStrategyBacktest";
import { loadForwardTestData, type ForwardTestRiskStatus } from "@/lib/forwardTestSession";
import { loadLatestMarketDataIntegrity } from "@/lib/marketDataIntegrity";
import { getAutoIntelligenceCycleState } from "@/lib/autoIntelligenceCycle";
import { loadLatestFuturesStrategyBacktest } from "@/lib/futuresStrategyBacktest";
import {
  buildEvidenceStack,
  applyEvidenceModifier,
  MAX_SIGNAL_QUALITY_HISTORY,
  SIGNAL_QUALITY_PROFILES,
  clearSignalQualityHistory,
  createSignalQualityRecord,
  getSignalQualityBacktestEvidence,
  getSignalQualityDataFreshness,
  getSignalQualityForwardEvidence,
  loadSignalQualityHistory,
  saveSignalQualityHistory,
  type SignalQualityFactorEffect,
  type SignalQualityProfile,
  type SignalQualityRecord,
} from "@/lib/signalQualityScore";

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function scoreColor(score: number): string {
  if (score >= 85) return "#22c55e";
  if (score >= 70) return "#84cc16";
  if (score >= 50) return "#f59e0b";
  if (score >= 25) return "#f97316";
  return "#ef4444";
}

function effectColor(effect: SignalQualityFactorEffect): string {
  if (effect === "positive") return "#22c55e";
  if (effect === "negative") return "#ef4444";
  return "#9ca3af";
}

export default function SignalQualityScorePanel() {
  const { priceStatus, lastPriceUpdate } = useAppState();
  const { totalValue } = usePortfolio();
  const [profile, setProfile] = useState<SignalQualityProfile>("Trend Follow");
  const [scenario, setScenario] = useState<FuturesTestScenario>("Neutral / Current Mock");
  const [symbol, setSymbol] = useState<FuturesSymbol>("BTCUSDT");
  const [leverage, setLeverage] = useState<FuturesLeverage>(2);
  const [history, setHistory] = useState<SignalQualityRecord[]>(loadSignalQualityHistory);
  const [activeRecord, setActiveRecord] = useState<SignalQualityRecord | null>(
    () => history[0] ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [integrityReport] = useState(() => loadLatestMarketDataIntegrity());
  const [evidenceStack] = useState(() => buildEvidenceStack({
    integrity: loadLatestMarketDataIntegrity(),
    autoObs: getAutoIntelligenceCycleState(),
    forwardTest: (() => {
      const d = loadForwardTestData();
      const s = d.activeSession ?? d.completedSessions[0] ?? null;
      return s ? { observations: s.observations, latestDirection: s.observations[0]?.direction ?? null } : null;
    })(),
    backtest: (() => {
      const r = loadLatestFuturesStrategyBacktest();
      return r ? { returnPercent: r.metrics.returnPercent, winRate: r.metrics.winRate } : null;
    })(),
    riskGate: activeRecord ? { riskStatus: activeRecord.input.riskStatus } : null,
  }));
  const evidenceAdjusted = activeRecord ? applyEvidenceModifier(activeRecord, evidenceStack) : null;

  const handleGenerate = () => {
    setError(null);
    const createdAt = new Date().toISOString();
    const setup = generateFuturesStrategySetup(profile, symbol, scenario);
    const riskSettings = loadPaperRiskSettings();
    let riskStatus: ForwardTestRiskStatus = "WAIT";
    let riskReason = "Strategy profile returned WAIT. No actionable paper candidate was evaluated.";
    let riskRewardRatio = setup.suggestedDirection !== "WAIT" && setup.stopLossPercent > 0
      ? setup.takeProfitPercent / setup.stopLossPercent
      : 0;

    if (setup.suggestedDirection !== "WAIT") {
      const sizingCapital = totalValue > 0 ? totalValue : riskSettings.defaultPaperCapital;
      const maxNotional = sizingCapital * riskSettings.maxTradeSizePercent / 100;
      const trade: FuturesPaperTradeInput = {
        symbol,
        scenario,
        direction: setup.suggestedDirection,
        entryPrice: setup.entryReference,
        marginAmount: maxNotional / leverage,
        leverage,
        stopLossPercent: setup.stopLossPercent,
        takeProfitPercent: setup.takeProfitPercent,
        strategyReason: setup.strategyReason,
      };
      const preview = evaluateFuturesPaperRisk({
        trade,
        markPrice: setup.entryReference,
        openPositions: loadFuturesPaperPositions(),
        history: loadFuturesPaperHistory(),
        futuresSettings: loadFuturesPaperSettings(),
        riskSettings,
        paperPortfolioValue: totalValue,
        now: createdAt,
      });
      riskStatus = preview.decision;
      riskReason = preview.reason;
      riskRewardRatio = preview.riskRewardRatio;
    }

    const backtestEvidence = getSignalQualityBacktestEvidence(
      loadFuturesStrategyBacktestHistory(),
      profile,
      scenario,
      symbol,
      leverage,
    );
    const forwardEvidence = getSignalQualityForwardEvidence(
      loadForwardTestData(),
      profile,
      scenario,
      symbol,
      leverage,
      setup.suggestedDirection,
    );
    const liveStack = buildEvidenceStack({
      integrity: loadLatestMarketDataIntegrity(),
      autoObs: getAutoIntelligenceCycleState(),
      forwardTest: (() => {
        const d = loadForwardTestData();
        const s = d.activeSession ?? d.completedSessions[0] ?? null;
        return s ? { observations: s.observations, latestDirection: s.observations[0]?.direction ?? null } : null;
      })(),
      backtest: (() => {
        const r = loadLatestFuturesStrategyBacktest();
        return r ? { returnPercent: r.metrics.returnPercent, winRate: r.metrics.winRate } : null;
      })(),
      riskGate: { riskStatus },
    });
    // Compute the real evaluation to get correct base score
    const evalInput = {
      profile, scenario, symbol, leverage,
      direction: setup.suggestedDirection,
      confidence: setup.confidence,
      stopLossPercent: setup.stopLossPercent,
      takeProfitPercent: setup.takeProfitPercent,
      riskStatus, riskReason, riskRewardRatio,
      backtestEvidence, forwardEvidence,
      dataFreshness: getSignalQualityDataFreshness(priceStatus, lastPriceUpdate, createdAt),
      localMockOnly: true,
    };
    // Use a temporary record to get the base evaluation, then build evidence snapshot
    const tempRecord = createSignalQualityRecord(evalInput, createdAt);
    const adjusted = tempRecord ? applyEvidenceModifier(tempRecord, liveStack) : null;
    const record = createSignalQualityRecord(evalInput, createdAt,
      adjusted && tempRecord ? { adjusted: { ...adjusted, baseScore: tempRecord.score }, stack: liveStack } : undefined,
    );

    if (!record) {
      setError("Signal quality inputs could not be validated.");
      return;
    }
    const nextHistory = [
      record,
      ...history.filter((item) => item.id !== record.id),
    ].slice(0, MAX_SIGNAL_QUALITY_HISTORY);
    setActiveRecord(record);
    setHistory(nextHistory);
    if (!saveSignalQualityHistory(nextHistory)) {
      setError("Score generated, but browser-local history could not be saved.");
    }
  };

  const handleClear = () => {
    if (!window.confirm("Clear all browser-local Signal Quality Score history?")) return;
    setHistory([]);
    setActiveRecord(null);
    setError(
      clearSignalQualityHistory()
        ? null
        : "History was cleared for this view, but browser storage could not be updated.",
    );
  };

  const recordColor = activeRecord ? scoreColor(activeRecord.score) : "#9ca3af";

  return (
    <section
      className="card-surface mt-8 rounded-xl p-5 lg:p-6"
      style={{ border: "1px solid rgba(201,215,227,0.06)" }}
      aria-labelledby="signal-quality-score-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Gauge size={16} style={{ color: "#cc9258" }} />
            <h3 id="signal-quality-score-title" className="section-title" style={{ fontSize: 22 }}>
              Signal Quality Score
            </h3>
          </div>
          <p className="text-xs" style={{ color: "#6b7280" }}>
            Command Center signal evaluation -- informational only
          </p>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.08em]"
          style={{ color: "#cc9258", border: "1px solid rgba(204,146,88,0.24)" }}
        >
          Informational only -- paper only
        </span>
      </div>

      <div
        className="mt-5 rounded-lg p-4"
        style={{ backgroundColor: "rgba(201,215,227,0.02)", border: "1px solid rgba(201,215,227,0.05)" }}
      >
        <p className="text-xs" style={{ color: "#9ca3af" }}>Signal Quality Score is informational only.</p>
        <p className="mt-1 text-xs" style={{ color: "#6b7280" }}>Risk Engine remains the final gate.</p>
        <p className="mt-1 text-xs" style={{ color: "#6b7280" }}>Scores use local/mock and browser-local paper data.</p>
        <p className="mt-1 text-xs" style={{ color: "#6b7280" }}>Past simulated behavior does not predict future results.</p>
        <p className="mt-1 text-xs" style={{ color: "#6b7280" }}>No real orders are placed.</p>
        <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>For tracking only. Not financial advice.</p>
      </div>

      {integrityReport ? (
        <div
          className="mt-4 rounded-lg p-4"
          style={{ background: "rgba(201,215,227,0.02)", border: "1px solid rgba(201,215,227,0.06)" }}
        >
          <p className="label-upper" style={{ color: "#4b5563", fontSize: 9 }}>Market Data Integrity Context</p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.06em]" style={{ color: "#6b7280" }}>Integrity Score</p>
              <p className="mt-1 text-sm font-medium" style={{ color: integrityReport.integrityScore >= 70 ? "#22c55e" : integrityReport.integrityScore >= 50 ? "#f59e0b" : "#ef4444" }}>{integrityReport.integrityScore}/100</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.06em]" style={{ color: "#6b7280" }}>Source</p>
              <p className="mt-1 text-xs" style={{ color: "#9ca3af" }}>{integrityReport.source.replace(/_/g, " ")}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.06em]" style={{ color: "#6b7280" }}>Freshness</p>
              <p className="mt-1 text-xs" style={{ color: "#9ca3af" }}>{integrityReport.freshnessStatus}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.06em]" style={{ color: "#6b7280" }}>Readiness</p>
              <p className="mt-1 text-xs" style={{ color: "#9ca3af" }}>{integrityReport.readinessStatus.replace(/_/g, " ")}</p>
            </div>
          </div>
          {(integrityReport.gapCount > 0 || integrityReport.anomalyCount > 0) && (
            <p className="mt-2 text-xs" style={{ color: "#f59e0b" }}>
              {integrityReport.gapCount > 0 && `${integrityReport.gapCount} gap(s) detected. `}
              {integrityReport.anomalyCount > 0 && `${integrityReport.anomalyCount} anomaly/anomalies detected.`}
            </p>
          )}
          {integrityReport.source !== "LIVE_READ_ONLY" && (
            <p className="mt-1 text-xs" style={{ color: "#a78b63" }}>
              Data source is {integrityReport.source.replace(/_/g, " ")}. Not market-grade. Signal quality is evaluated without live data context.
            </p>
          )}
        </div>
      ) : (
        <div
          className="mt-4 rounded-lg p-3"
          style={{ background: "rgba(245, 158, 11, 0.04)", border: "1px solid rgba(245, 158, 11, 0.12)" }}
        >
          <p className="text-xs" style={{ color: "#a78b63" }}>
            No Market Data Integrity report available. Signal quality is evaluated without data-quality context. Run an integrity check from the Market Data Integrity panel.
          </p>
        </div>
      )}

      {/* Evidence Stack */}
      <div
        className="mt-4 rounded-lg p-4"
        style={{ background: "rgba(201,215,227,0.02)", border: "1px solid rgba(201,215,227,0.06)" }}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "#9ca3af" }}>Evidence Stack</h4>
          <span
            className="rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.06em]"
            style={{
              color: evidenceStack.completeness === "complete" ? "#22c55e" : evidenceStack.completeness === "partial" ? "#f59e0b" : "#ef4444",
              border: "1px solid rgba(156,163,175,0.18)",
            }}
          >
            {evidenceStack.completeness === "complete" ? "Complete" : evidenceStack.completeness === "partial" ? "Partial" : "Missing"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Market data quality */}
          <div className="rounded-md p-3" style={{ background: "rgba(0,0,0,0.14)" }}>
            <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Market data quality</p>
            {evidenceStack.hasMarketIntegrity ? (
              <div className="mt-1 space-y-0.5">
                <p className="data-mono text-[10px]" style={{ color: "#9ca3af" }}>Score: {evidenceStack.integrityScore}/100</p>
                <p className="text-[10px]" style={{ color: "#6b7280" }}>Source: {evidenceStack.integritySource?.replace(/_/g, " ")}</p>
                <p className="text-[10px]" style={{ color: "#6b7280" }}>Freshness: {evidenceStack.integrityFreshness}</p>
                <p className="text-[10px]" style={{ color: "#6b7280" }}>Readiness: {evidenceStack.integrityReadiness?.replace(/_/g, " ")}</p>
              </div>
            ) : (
              <p className="mt-1 text-[10px]" style={{ color: "#4b5563" }}>Not available</p>
            )}
          </div>
          {/* Auto observations */}
          <div className="rounded-md p-3" style={{ background: "rgba(0,0,0,0.14)" }}>
            <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Auto observations</p>
            {evidenceStack.hasAutoObservations ? (
              <div className="mt-1 space-y-0.5">
                <p className="data-mono text-[10px]" style={{ color: "#9ca3af" }}>Total: {evidenceStack.autoObsCount}</p>
                <p className="text-[10px]" style={{ color: "#6b7280" }}>Latest: {evidenceStack.autoObsLatestSymbol ?? "N/A"}</p>
                <p className="data-mono text-[10px]" style={{ color: "#6b7280" }}>Score: {evidenceStack.autoObsLatestScore ?? "N/A"}</p>
              </div>
            ) : (
              <p className="mt-1 text-[10px]" style={{ color: "#4b5563" }}>None recorded</p>
            )}
          </div>
          {/* Forward-test evidence */}
          <div className="rounded-md p-3" style={{ background: "rgba(0,0,0,0.14)" }}>
            <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Forward-test evidence</p>
            {evidenceStack.hasForwardTest ? (
              <div className="mt-1 space-y-0.5">
                <p className="data-mono text-[10px]" style={{ color: "#9ca3af" }}>Observations: {evidenceStack.forwardObsCount}</p>
                <p className="text-[10px]" style={{ color: "#6b7280" }}>Latest: {evidenceStack.forwardLatestDirection ?? "N/A"}</p>
              </div>
            ) : (
              <p className="mt-1 text-[10px]" style={{ color: "#4b5563" }}>No observations</p>
            )}
          </div>
          {/* Backtest evidence */}
          <div className="rounded-md p-3" style={{ background: "rgba(0,0,0,0.14)" }}>
            <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Backtest evidence</p>
            {evidenceStack.hasBacktest ? (
              <div className="mt-1 space-y-0.5">
                <p className="data-mono text-[10px]" style={{ color: evidenceStack.backtestReturn !== null && evidenceStack.backtestReturn >= 0 ? "#22c55e" : "#ef4444" }}>Return: {evidenceStack.backtestReturn?.toFixed(2)}%</p>
                <p className="data-mono text-[10px]" style={{ color: "#6b7280" }}>Win rate: {evidenceStack.backtestWinRate?.toFixed(1)}%</p>
              </div>
            ) : (
              <p className="mt-1 text-[10px]" style={{ color: "#4b5563" }}>No backtest</p>
            )}
          </div>
          {/* Risk gate state */}
          <div className="rounded-md p-3" style={{ background: "rgba(0,0,0,0.14)" }}>
            <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Risk gate state</p>
            {evidenceStack.hasRiskGate ? (
              <p className="mt-1 data-mono text-[10px]" style={{ color: "#9ca3af" }}>{evidenceStack.riskGateStatus}</p>
            ) : (
              <p className="mt-1 text-[10px]" style={{ color: "#4b5563" }}>Not evaluated</p>
            )}
          </div>
          {/* Score breakdown */}
          <div className="rounded-md p-3" style={{ background: "rgba(0,0,0,0.14)" }}>
            <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#4b5563" }}>Live evidence score</p>
            {activeRecord && evidenceAdjusted ? (
              <div className="mt-1 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px]" style={{ color: "#6b7280" }}>Base:</span>
                  <span className="data-mono text-[10px]" style={{ color: "#9ca3af" }}>{evidenceAdjusted.baseScore}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px]" style={{ color: "#6b7280" }}>Modifier:</span>
                  <span className="data-mono text-[10px]" style={{ color: evidenceAdjusted.evidenceModifier > 0 ? "#22c55e" : evidenceAdjusted.evidenceModifier < 0 ? "#ef4444" : "#9ca3af" }}>{evidenceAdjusted.evidenceModifier > 0 ? "+" : ""}{evidenceAdjusted.evidenceModifier}</span>
                </div>
                <div className="flex items-center justify-between" style={{ borderTop: "1px solid rgba(201,215,227,0.08)", paddingTop: 2, marginTop: 2 }}>
                  <span className="text-[10px] font-medium" style={{ color: "#9ca3af" }}>Final:</span>
                  <span className="data-mono text-[10px] font-medium" style={{ color: scoreColor(evidenceAdjusted.finalScore) }}>{evidenceAdjusted.finalScore}/100 -- {evidenceAdjusted.label}</span>
                </div>
                {evidenceAdjusted.capsApplied.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {evidenceAdjusted.capsApplied.map((cap, i) => (
                      <p key={i} className="text-[9px]" style={{ color: "#f59e0b" }}>CAP: {cap}</p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-1 text-[10px]" style={{ color: "#4b5563" }}>No score generated</p>
            )}
          </div>
        </div>

        {/* Positive / Negative / Missing factors */}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#22c55e" }}>Positive factors</p>
            {evidenceStack.positiveFactors.length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {evidenceStack.positiveFactors.map((f, i) => <li key={i} className="text-[10px]" style={{ color: "#9ca3af" }}>+ {f}</li>)}
              </ul>
            ) : <p className="mt-1 text-[10px]" style={{ color: "#4b5563" }}>None</p>}
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#ef4444" }}>Negative factors</p>
            {evidenceStack.negativeFactors.length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {evidenceStack.negativeFactors.map((f, i) => <li key={i} className="text-[10px]" style={{ color: "#9ca3af" }}>- {f}</li>)}
              </ul>
            ) : <p className="mt-1 text-[10px]" style={{ color: "#4b5563" }}>None</p>}
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#9ca3af" }}>Missing evidence</p>
            {evidenceStack.missingFactors.length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {evidenceStack.missingFactors.map((f, i) => <li key={i} className="text-[10px]" style={{ color: "#6b7280" }}>{f}</li>)}
              </ul>
            ) : <p className="mt-1 text-[10px]" style={{ color: "#22c55e" }}>All evidence present</p>}
          </div>
        </div>

        <p className="mt-3 text-[10px]" style={{ color: "#4b5563" }}>Paper-only / informational only. Evidence stack does not generate trades or bypass risk gates.</p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <label htmlFor="quality-profile" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>Strategy profile</label>
          <select id="quality-profile" value={profile} onChange={(event) => setProfile(event.target.value as SignalQualityProfile)} className="input-dark cursor-pointer">
            {SIGNAL_QUALITY_PROFILES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="quality-scenario" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>Strategy scenario</label>
          <select id="quality-scenario" value={scenario} onChange={(event) => setScenario(event.target.value as FuturesTestScenario)} className="input-dark cursor-pointer">
            {SUPPORTED_FUTURES_TEST_SCENARIOS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="quality-symbol" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>Symbol</label>
          <select id="quality-symbol" value={symbol} onChange={(event) => setSymbol(event.target.value as FuturesSymbol)} className="input-dark cursor-pointer">
            {SUPPORTED_FUTURES_SYMBOLS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="quality-leverage" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>Leverage</label>
          <select id="quality-leverage" value={leverage} onChange={(event) => setLeverage(Number(event.target.value) as FuturesLeverage)} className="input-dark cursor-pointer">
            {SUPPORTED_FUTURES_LEVERAGE.map((item) => <option key={item} value={item}>{item}x</option>)}
          </select>
        </div>
      </div>

      {leverage === 5 && (
        <div className="mt-3 flex items-start gap-2 text-xs" style={{ color: "#f59e0b" }}>
          <AlertTriangle className="mt-0.5 shrink-0" size={14} />
          <p>5x always receives a quality penalty. Strong matching evidence can reduce, but never remove, that penalty.</p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={handleGenerate} className="btn-accent flex items-center gap-2">
          <Sparkles size={14} /> Generate quality score
        </button>
        <button type="button" onClick={handleClear} className="btn-danger flex items-center gap-2" disabled={history.length === 0}>
          <Trash2 size={14} /> Clear quality score history
        </button>
      </div>

      {error && <p role="alert" className="mt-4 text-xs" style={{ color: "#ef4444" }}>{error}</p>}

      {!activeRecord ? (
        <div className="mt-6 rounded-lg p-7 text-center" style={{ border: "1px dashed rgba(201,215,227,0.1)" }}>
          <p className="text-sm" style={{ color: "#9ca3af" }}>No quality score generated yet.</p>
          <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>Generate a transparent local evaluation for the selected setup.</p>
        </div>
      ) : (
        <>
          <div className="mt-7 grid gap-5 lg:grid-cols-[220px_1fr]">
            <div
              className="flex min-h-52 flex-col items-center justify-center rounded-xl p-5 text-center"
              style={{ background: `${recordColor}0d`, border: `1px solid ${recordColor}33` }}
            >
              <p className="data-mono text-5xl" style={{ color: recordColor }}>{activeRecord.score}</p>
              <p className="mt-1 text-xs" style={{ color: "#6b7280" }}>/ 100</p>
              <p className="mt-4 text-sm font-medium" style={{ color: recordColor }}>{activeRecord.label}</p>
              <p className="mt-2 text-[10px] uppercase tracking-[0.08em]" style={{ color: "#4b5563" }}>
                {activeRecord.input.symbol} -- {activeRecord.input.direction} -- {activeRecord.input.riskStatus}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg p-4" style={{ background: "rgba(34,197,94,0.03)", border: "1px solid rgba(34,197,94,0.1)" }}>
                <p className="label-upper" style={{ color: "#22c55e", fontSize: 9 }}>Top positive factors</p>
                <div className="mt-3 space-y-2">
                  {activeRecord.topPositiveFactors.length > 0
                    ? activeRecord.topPositiveFactors.map((item) => <p key={item.id} className="text-xs" style={{ color: "#9ca3af" }}>+{item.pointsImpact} -- {item.factor}</p>)
                    : <p className="text-xs" style={{ color: "#6b7280" }}>No positive factor contribution.</p>}
                </div>
              </div>
              <div className="rounded-lg p-4" style={{ background: "rgba(239,68,68,0.03)", border: "1px solid rgba(239,68,68,0.1)" }}>
                <p className="label-upper" style={{ color: "#ef4444", fontSize: 9 }}>Top negative factors</p>
                <div className="mt-3 space-y-2">
                  {activeRecord.topNegativeFactors.length > 0
                    ? activeRecord.topNegativeFactors.map((item) => <p key={item.id} className="text-xs" style={{ color: "#9ca3af" }}>{item.pointsImpact} -- {item.factor}</p>)
                    : <p className="text-xs" style={{ color: "#6b7280" }}>No negative factor contribution.</p>}
                </div>
              </div>
              <div className="rounded-lg p-4 sm:col-span-2" style={{ background: "rgba(201,215,227,0.02)", border: "1px solid rgba(201,215,227,0.05)" }}>
                <p className="label-upper" style={{ color: "#4b5563", fontSize: 9 }}>Final interpretation</p>
                <p className="mt-2 text-sm leading-6" style={{ color: "#9ca3af" }}>{activeRecord.interpretation}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="rounded-lg p-4" style={{ background: "rgba(201,215,227,0.02)", border: "1px solid rgba(201,215,227,0.05)" }}>
              <p className="label-upper" style={{ color: "#4b5563", fontSize: 9 }}>Risk notes</p>
              {activeRecord.riskNotes.map((note) => <p key={note} className="mt-2 text-xs leading-5" style={{ color: "#6b7280" }}>{note}</p>)}
            </div>
            <div className="rounded-lg p-4" style={{ background: "rgba(201,215,227,0.02)", border: "1px solid rgba(201,215,227,0.05)" }}>
              <p className="label-upper" style={{ color: "#4b5563", fontSize: 9 }}>Backtest evidence</p>
              <p className="mt-2 text-xs leading-5" style={{ color: "#6b7280" }}>{activeRecord.backtestEvidenceSummary}</p>
            </div>
            <div className="rounded-lg p-4" style={{ background: "rgba(201,215,227,0.02)", border: "1px solid rgba(201,215,227,0.05)" }}>
              <p className="label-upper" style={{ color: "#4b5563", fontSize: 9 }}>Forward-test evidence</p>
              <p className="mt-2 text-xs leading-5" style={{ color: "#6b7280" }}>{activeRecord.forwardEvidenceSummary}</p>
            </div>
          </div>

          <div className="mt-7">
            <h4 className="section-title mb-1" style={{ fontSize: 18 }}>Traceable score factors</h4>
            <p className="text-xs" style={{ color: "#4b5563" }}>Every score adjustment is listed below. Risk caps apply after factor totals.</p>
          </div>
          <div className="mt-4 overflow-auto rounded-lg" style={{ border: "1px solid rgba(201,215,227,0.05)" }}>
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead style={{ backgroundColor: "#090d13" }}>
                <tr>
                  {["Factor", "Effect", "Points impact", "Reason"].map((heading) => (
                    <th key={heading} className="px-4 py-3 label-upper" style={{ color: "#4b5563", fontSize: 9 }}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeRecord.factors.map((item) => (
                  <tr key={item.id} style={{ borderTop: "1px solid rgba(201,215,227,0.04)" }}>
                    <td className="px-4 py-3 text-xs" style={{ color: "#9ca3af" }}>{item.factor}</td>
                    <td className="px-4 py-3 text-xs uppercase" style={{ color: effectColor(item.effect) }}>{item.effect}</td>
                    <td className="px-4 py-3 data-mono text-xs" style={{ color: effectColor(item.effect) }}>{item.pointsImpact > 0 ? "+" : ""}{item.pointsImpact}</td>
                    <td className="px-4 py-3 text-xs leading-5" style={{ color: "#6b7280" }}>{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {history.length > 0 && (
        <details className="mt-6" style={{ borderTop: "1px solid rgba(201,215,227,0.05)", paddingTop: 16 }}>
          <summary className="flex cursor-pointer items-center gap-2 text-xs" style={{ color: "#6b7280" }}>
            <History size={13} />
            Saved quality scores (with evidence snapshot) -- {history.length} / {MAX_SIGNAL_QUALITY_HISTORY}
          </summary>
          <div className="mt-3 grid gap-2">
            {history.map((record) => (
              <button
                key={record.id}
                type="button"
                onClick={() => setActiveRecord(record)}
                className="grid gap-2 rounded-md px-3 py-3 text-left transition-colors hover:bg-white/[0.03] sm:grid-cols-[1fr_auto_auto] sm:items-center"
                style={{ border: "1px solid rgba(201,215,227,0.04)" }}
              >
                <span className="text-xs" style={{ color: "#9ca3af" }}>{record.input.profile} -- {record.input.scenario} -- {record.input.symbol}</span>
                <span className="data-mono text-xs" style={{ color: scoreColor(record.finalScore ?? record.score) }}>{record.finalScore ?? record.score} -- {record.label}</span>
                <span className="text-[10px]" style={{ color: "#4b5563" }}>{formatTimestamp(record.createdAt)}</span>
              </button>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
