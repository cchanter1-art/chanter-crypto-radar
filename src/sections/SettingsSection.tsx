import { useRef, useState, type ChangeEvent } from "react";
import { useAppState } from "@/context/AppContext";
import ToggleSwitch from "@/components/ToggleSwitch";
import { Download, RotateCcw, ShieldCheck, Trash2, Upload } from "lucide-react";
import {
  createEmptyLocalAppState,
  createLocalDataBackup,
  parseLocalDataBackup,
} from "@/lib/localDataBackup";
import {
  clearPaperSignalSensitivity,
  clearPaperSignalHistory,
  DEFAULT_PAPER_SIGNAL_SENSITIVITY,
  isPaperSignalSensitivity,
  loadPaperSignalSensitivity,
  loadPaperSignalHistory,
  savePaperSignalSensitivity,
  savePaperSignalHistory,
  type PaperSignalSensitivity,
} from "@/lib/paperSignalEngine";
import {
  clearBacktestHistory,
  loadBacktestHistory,
  saveBacktestHistory,
} from "@/lib/paperBacktestEngine";
import {
  clearPaperRiskJournal,
  clearPaperRiskSettings,
  DEFAULT_PAPER_RISK_SETTINGS,
  loadPaperRiskJournal,
  loadPaperRiskSettings,
  MAX_PAPER_RISK_JOURNAL,
  savePaperRiskJournal,
  savePaperRiskSettings,
  validatePaperRiskSettings,
  type PaperRiskSettings,
} from "@/lib/paperRiskController";
import {
  clearFuturesPaperData,
  loadFuturesPaperHistory,
  loadFuturesPaperPositions,
  loadFuturesPaperSettings,
  loadFuturesTestScenario,
  saveFuturesPaperHistory,
  saveFuturesPaperPositions,
  saveFuturesPaperSettings,
  saveFuturesTestScenario,
} from "@/lib/futuresPaperEngine";
import {
  clearFuturesStrategyProfile,
  loadFuturesStrategyProfile,
  saveFuturesStrategyProfile,
} from "@/lib/futuresStrategyProfiles";
import {
  clearFuturesStrategyBacktestHistory,
  loadFuturesStrategyBacktestHistory,
  saveFuturesStrategyBacktestHistory,
} from "@/lib/futuresStrategyBacktest";
import {
  clearForwardTestData,
  loadForwardTestData,
  saveForwardTestData,
} from "@/lib/forwardTestSession";

type DataStatus = {
  type: "success" | "error";
  message: string;
};

function formatRiskJournalTime(timestamp: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function getRiskDecisionColor(decision: string): string {
  if (decision === "APPROVED") return "#22c55e";
  if (decision === "BLOCKED") return "#ef4444";
  if (decision === "REDUCED") return "#f59e0b";
  return "#9ca3af";
}

export default function SettingsSection() {
  const { state, dispatch } = useAppState();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [formData, setFormData] = useState({
    displayName: state.settings.displayName,
    email: state.settings.email,
  });
  const [saved, setSaved] = useState(false);
  const [dataStatus, setDataStatus] = useState<DataStatus | null>(null);
  const [riskSettings, setRiskSettings] = useState<PaperRiskSettings>(loadPaperRiskSettings);
  const [riskJournal, setRiskJournal] = useState(loadPaperRiskJournal);
  const [riskStatus, setRiskStatus] = useState<DataStatus | null>(null);
  const [signalSensitivity, setSignalSensitivity] =
    useState<PaperSignalSensitivity>(loadPaperSignalSensitivity);
  const [signalSensitivityStatus, setSignalSensitivityStatus] =
    useState<DataStatus | null>(null);

  const handleSave = () => {
    dispatch({
      type: "UPDATE_SETTINGS",
      payload: {
        displayName: formData.displayName,
        email: formData.email,
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleExport = () => {
    const backup = createLocalDataBackup(
      state,
      loadPaperSignalHistory(),
      loadBacktestHistory(),
      loadPaperRiskSettings(),
      loadPaperRiskJournal(),
      loadPaperSignalSensitivity(),
      loadFuturesPaperSettings(),
      loadFuturesPaperPositions(),
      loadFuturesPaperHistory(),
      loadFuturesStrategyProfile(),
      loadFuturesTestScenario(),
      loadFuturesStrategyBacktestHistory(),
      loadForwardTestData(),
    );
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chanter-crypto-radar-backup-${backup.exportedAt.slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setDataStatus({ type: "success", message: "Local data backup exported." });
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) return;

    try {
      const rawJson = await file.text();
      const result = parseLocalDataBackup(rawJson);

      if (result.ok === false) {
        setDataStatus({ type: "error", message: result.message });
        return;
      }

      const previousPaperSignals = loadPaperSignalHistory();
      const previousBacktests = loadBacktestHistory();
      const previousRiskSettings = loadPaperRiskSettings();
      const previousRiskJournal = loadPaperRiskJournal();
      const previousSignalSensitivity = loadPaperSignalSensitivity();
      const previousFuturesSettings = loadFuturesPaperSettings();
      const previousFuturesPositions = loadFuturesPaperPositions();
      const previousFuturesHistory = loadFuturesPaperHistory();
      const previousFuturesStrategyProfile = loadFuturesStrategyProfile();
      const previousFuturesTestScenario = loadFuturesTestScenario();
      const previousFuturesStrategyBacktests = loadFuturesStrategyBacktestHistory();
      const previousForwardTestData = loadForwardTestData();

      const didSaveLocalHistories =
        savePaperSignalHistory(result.value.paperSignals) &&
        saveBacktestHistory(result.value.backtestRuns) &&
        savePaperRiskSettings(result.value.riskSettings) &&
        savePaperRiskJournal(result.value.riskJournal) &&
        savePaperSignalSensitivity(result.value.signalSensitivity) &&
        saveFuturesPaperSettings(result.value.futuresSettings) &&
        saveFuturesPaperPositions(result.value.futuresPositions) &&
        saveFuturesPaperHistory(result.value.futuresHistory) &&
        saveFuturesStrategyProfile(result.value.futuresStrategyProfile) &&
        saveFuturesTestScenario(result.value.futuresTestScenario) &&
        saveFuturesStrategyBacktestHistory(result.value.futuresStrategyBacktests) &&
        saveForwardTestData(result.value.forwardTestData);

      if (!didSaveLocalHistories) {
        savePaperSignalHistory(previousPaperSignals);
        saveBacktestHistory(previousBacktests);
        savePaperRiskSettings(previousRiskSettings);
        savePaperRiskJournal(previousRiskJournal);
        savePaperSignalSensitivity(previousSignalSensitivity);
        saveFuturesPaperSettings(previousFuturesSettings);
        saveFuturesPaperPositions(previousFuturesPositions);
        saveFuturesPaperHistory(previousFuturesHistory);
        saveFuturesStrategyProfile(previousFuturesStrategyProfile);
        saveFuturesTestScenario(previousFuturesTestScenario);
        saveFuturesStrategyBacktestHistory(previousFuturesStrategyBacktests);
        saveForwardTestData(previousForwardTestData);
        setDataStatus({
          type: "error",
          message: "Import failed. Local signal, backtest, futures, forward-test, sensitivity, or risk data could not be saved in this browser.",
        });
        return;
      }

      dispatch({ type: "LOAD_STATE", payload: result.value.state });
      setFormData({
        displayName: result.value.state.settings.displayName,
        email: result.value.state.settings.email,
      });
      setRiskSettings(result.value.riskSettings);
      setRiskJournal(result.value.riskJournal);
      setSignalSensitivity(result.value.signalSensitivity);
      setSignalSensitivityStatus(null);
      setRiskStatus(null);
      setDataStatus({ type: "success", message: "Local backup imported." });
    } catch {
      setDataStatus({
        type: "error",
        message: "Import failed. The selected file could not be read.",
      });
    }
  };

  const handleClear = () => {
    if (
      window.confirm(
        "Clear all local CHANTER Crypto Radar data from this browser? This cannot be undone.",
      )
    ) {
      const emptyState = createEmptyLocalAppState();
      dispatch({ type: "LOAD_STATE", payload: emptyState });
      clearPaperSignalHistory();
      clearPaperSignalSensitivity();
      clearBacktestHistory();
      clearPaperRiskSettings();
      clearPaperRiskJournal();
      clearFuturesPaperData();
      clearFuturesStrategyProfile();
      clearFuturesStrategyBacktestHistory();
      clearForwardTestData();
      setFormData({
        displayName: emptyState.settings.displayName,
        email: emptyState.settings.email,
      });
      setRiskSettings({ ...DEFAULT_PAPER_RISK_SETTINGS });
      setRiskJournal([]);
      setSignalSensitivity(DEFAULT_PAPER_SIGNAL_SENSITIVITY);
      setSignalSensitivityStatus(null);
      setRiskStatus(null);
      setDataStatus({ type: "success", message: "Local app data cleared." });
    }
  };

  const handleSaveRiskRules = () => {
    const error = validatePaperRiskSettings(riskSettings);
    if (error) {
      setRiskStatus({ type: "error", message: error });
      return;
    }

    setRiskStatus(
      savePaperRiskSettings(riskSettings)
        ? { type: "success", message: "Paper risk rules saved locally." }
        : { type: "error", message: "Paper risk rules could not be saved in this browser." },
    );
  };

  const handleRestoreRiskRules = () => {
    const defaults = { ...DEFAULT_PAPER_RISK_SETTINGS };
    setRiskSettings(defaults);
    setRiskStatus(
      savePaperRiskSettings(defaults)
        ? { type: "success", message: "Default paper risk rules restored." }
        : { type: "error", message: "Default paper risk rules could not be saved." },
    );
  };

  const handleClearRiskJournal = () => {
    if (!window.confirm("Clear the browser-local Paper Risk Journal?")) return;

    if (clearPaperRiskJournal()) {
      setRiskJournal([]);
      setRiskStatus({ type: "success", message: "Paper Risk Journal cleared." });
    } else {
      setRiskStatus({ type: "error", message: "Paper Risk Journal could not be cleared." });
    }
  };

  const updateRiskSetting = (key: keyof PaperRiskSettings, value: string) => {
    setRiskSettings((current) => ({ ...current, [key]: Number(value) }));
    setRiskStatus(null);
  };

  const handleSignalSensitivityChange = (value: string) => {
    if (!isPaperSignalSensitivity(value)) return;

    setSignalSensitivity(value);
    setSignalSensitivityStatus(
      savePaperSignalSensitivity(value)
        ? { type: "success", message: `Signal sensitivity set to ${value}.` }
        : { type: "error", message: "Signal sensitivity could not be saved in this browser." },
    );
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <div className="mb-8">
        <h2 className="section-title mb-2">Settings</h2>
        <p className="section-subtitle">Manage your account preferences and data</p>
      </div>

      <div className="flex flex-col gap-8">
        {/* Profile */}
        <div
          className="card-surface rounded-xl p-5 lg:p-6"
          style={{ border: "1px solid rgba(201,215,227,0.06)" }}
        >
          <h3
            className="label-upper mb-5"
            style={{ color: "#4b5563" }}
          >
            Profile
          </h3>
          <div className="flex flex-col gap-4">
            <div>
              <label
                className="label-upper block mb-2"
                style={{ color: "#4b5563", fontSize: 11 }}
              >
                Display Name
              </label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                placeholder="Your name"
                className="input-dark"
              />
            </div>
            <div>
              <label
                className="label-upper block mb-2"
                style={{ color: "#4b5563", fontSize: 11 }}
              >
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="you@example.com"
                className="input-dark"
              />
            </div>
          </div>
        </div>

        {/* Preferences */}
        <div
          className="card-surface rounded-xl p-5 lg:p-6"
          style={{ border: "1px solid rgba(201,215,227,0.06)" }}
        >
          <h3
            className="label-upper mb-5"
            style={{ color: "#4b5563" }}
          >
            Preferences
          </h3>
          <div className="flex flex-col gap-5">
            <ToggleSwitch
              label="Price Alerts"
              description="Enable local in-app checks when coins hit target prices"
              checked={state.settings.priceAlerts}
              onChange={(checked) =>
                dispatch({ type: "UPDATE_SETTINGS", payload: { priceAlerts: checked } })
              }
            />
            <div
              style={{ borderTop: "1px solid rgba(201,215,227,0.06)" }}
              className="pt-5"
            >
              <ToggleSwitch
                label="Dark Mode"
                description="Always on — this is the way"
                checked={true}
                onChange={() => {}}
                disabled
              />
            </div>
            <div
              style={{ borderTop: "1px solid rgba(201,215,227,0.06)" }}
              className="pt-5"
            >
              <ToggleSwitch
                label="Auto-refresh"
                description="Automatically refresh prices every 60 seconds"
                checked={state.settings.autoRefresh}
                onChange={(checked) =>
                  dispatch({ type: "UPDATE_SETTINGS", payload: { autoRefresh: checked } })
                }
              />
            </div>
            <div
              style={{ borderTop: "1px solid rgba(201,215,227,0.06)" }}
              className="pt-5"
            >
              <label htmlFor="signal-sensitivity" className="label-upper mb-2 block" style={{ color: "#9ca3af", fontSize: 12 }}>
                Signal Sensitivity
              </label>
              <select
                id="signal-sensitivity"
                value={signalSensitivity}
                onChange={(event) => handleSignalSensitivityChange(event.target.value)}
                className="input-dark cursor-pointer"
              >
                <option value="Conservative">Conservative</option>
                <option value="Balanced">Balanced</option>
                <option value="Aggressive">Aggressive</option>
              </select>
              <p className="mt-2 text-xs" style={{ color: "#4b5563", lineHeight: 1.6 }}>
                Signal sensitivity only affects paper signals. No real orders are placed.
              </p>
              {signalSensitivityStatus && (
                <p
                  role={signalSensitivityStatus.type === "error" ? "alert" : "status"}
                  className="mt-2 text-xs"
                  style={{ color: signalSensitivityStatus.type === "success" ? "#22c55e" : "#ef4444" }}
                >
                  {signalSensitivityStatus.message}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Paper Risk Controller */}
        <div
          className="card-surface rounded-xl p-5 lg:p-6"
          style={{ border: "1px solid rgba(201,215,227,0.06)" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <ShieldCheck size={16} style={{ color: "#cc9258" }} />
                <h3 className="label-upper" style={{ color: "#c9d7e3" }}>
                  Paper Risk Controller
                </h3>
              </div>
              <p className="text-sm" style={{ color: "#9ca3af", lineHeight: 1.6 }}>
                Local thresholds applied before a paper trade form can open from a signal.
              </p>
            </div>
            <span
              className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.08em]"
              style={{ color: "#cc9258", border: "1px solid rgba(204,146,88,0.24)" }}
            >
              Local / Paper
            </span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="risk-default-capital" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
                Default paper capital (USD)
              </label>
              <input
                id="risk-default-capital"
                type="number"
                min="100"
                max="1000000000"
                step="100"
                value={riskSettings.defaultPaperCapital}
                onChange={(event) => updateRiskSetting("defaultPaperCapital", event.target.value)}
                className="input-dark"
              />
              <p className="mt-2 text-[10px]" style={{ color: "#4b5563", lineHeight: 1.5 }}>
                Default paper capital is used only for sizing first signal-based paper trades.
              </p>
            </div>
            <div>
              <label htmlFor="risk-max-allocation" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
                Max allocation per coin (%)
              </label>
              <input
                id="risk-max-allocation"
                type="number"
                min="1"
                max="100"
                step="1"
                value={riskSettings.maxAllocationPerCoinPercent}
                onChange={(event) => updateRiskSetting("maxAllocationPerCoinPercent", event.target.value)}
                className="input-dark"
              />
            </div>
            <div>
              <label htmlFor="risk-max-trade-size" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
                Max trade size (%)
              </label>
              <input
                id="risk-max-trade-size"
                type="number"
                min="1"
                max="100"
                step="1"
                value={riskSettings.maxTradeSizePercent}
                onChange={(event) => updateRiskSetting("maxTradeSizePercent", event.target.value)}
                className="input-dark"
              />
            </div>
            <div>
              <label htmlFor="risk-drawdown-warning" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
                Drawdown warning (%)
              </label>
              <input
                id="risk-drawdown-warning"
                type="number"
                min="1"
                max="100"
                step="1"
                value={riskSettings.maxDrawdownWarningPercent}
                onChange={(event) => updateRiskSetting("maxDrawdownWarningPercent", event.target.value)}
                className="input-dark"
              />
            </div>
            <div>
              <label htmlFor="risk-buy-block" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
                Block new buys at drawdown (%)
              </label>
              <input
                id="risk-buy-block"
                type="number"
                min="1"
                max="100"
                step="1"
                value={riskSettings.blockBuyDrawdownPercent}
                onChange={(event) => updateRiskSetting("blockBuyDrawdownPercent", event.target.value)}
                className="input-dark"
              />
            </div>
            <div>
              <label htmlFor="risk-loss-cooldown" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
                Loss cooldown (hours)
              </label>
              <input
                id="risk-loss-cooldown"
                type="number"
                min="0"
                max="168"
                step="1"
                value={riskSettings.lossCooldownHours}
                onChange={(event) => updateRiskSetting("lossCooldownHours", event.target.value)}
                className="input-dark"
              />
            </div>
          </div>

          <div
            className="mt-5 rounded-lg p-4"
            style={{ backgroundColor: "rgba(201,215,227,0.02)", border: "1px solid rgba(201,215,227,0.05)" }}
          >
            <p className="text-xs" style={{ color: "#9ca3af", lineHeight: 1.6 }}>
              Low-confidence signals wait. Buys are blocked at the allocation or buy-drawdown limit.
              Drawdown warnings reduce suggested buy size, and sells cannot exceed current holdings.
            </p>
            <p className="mt-2 text-xs" style={{ color: "#6b7280" }}>
              Paper risk controller only. No real orders are placed.
            </p>
            <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>
              For tracking only. Not financial advice.
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={handleSaveRiskRules} className="btn-accent flex items-center gap-2">
              <ShieldCheck size={14} />
              Save Risk Rules
            </button>
            <button type="button" onClick={handleRestoreRiskRules} className="btn-primary flex items-center gap-2">
              <RotateCcw size={14} />
              Restore Defaults
            </button>
          </div>

          {riskStatus && (
            <p
              role={riskStatus.type === "error" ? "alert" : "status"}
              className="mt-4 text-xs"
              style={{ color: riskStatus.type === "success" ? "#22c55e" : "#ef4444" }}
            >
              {riskStatus.message}
            </p>
          )}

          <div className="mt-6" style={{ borderTop: "1px solid rgba(201,215,227,0.05)", paddingTop: 20 }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="label-upper" style={{ color: "#6b7280", fontSize: 10 }}>
                  Risk Journal
                </p>
                <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>
                  {riskJournal.length} / {MAX_PAPER_RISK_JOURNAL} local gate decisions stored
                </p>
              </div>
              <button
                type="button"
                onClick={handleClearRiskJournal}
                className="btn-danger flex items-center gap-2"
                disabled={riskJournal.length === 0}
              >
                <Trash2 size={14} />
                Clear Journal
              </button>
            </div>

            {riskJournal.length === 0 ? (
              <div className="mt-4 rounded-lg p-4 text-center" style={{ border: "1px dashed rgba(201,215,227,0.1)" }}>
                <p className="text-xs" style={{ color: "#6b7280" }}>
                  No signal trade decisions recorded yet.
                </p>
              </div>
            ) : (
              <details className="mt-4">
                <summary className="cursor-pointer text-xs" style={{ color: "#6b7280" }}>
                  View Risk Journal
                </summary>
                <div className="mt-3 grid gap-2">
                  {riskJournal.map((entry) => (
                    <article
                      key={entry.id}
                      className="rounded-md p-3"
                      style={{ backgroundColor: "rgba(201,215,227,0.018)", border: "1px solid rgba(201,215,227,0.04)" }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="data-mono text-xs" style={{ color: "#c9d7e3" }}>
                          {entry.symbol} · {entry.signal}
                        </span>
                        <span className="text-[10px] font-semibold" style={{ color: getRiskDecisionColor(entry.decision) }}>
                          {entry.decision}
                        </span>
                      </div>
                      <p className="mt-2 text-xs" style={{ color: "#6b7280", lineHeight: 1.6 }}>
                        {entry.reason}
                      </p>
                      <time className="mt-2 block text-[10px]" style={{ color: "#4b5563" }} dateTime={entry.timestamp}>
                        {formatRiskJournalTime(entry.timestamp)}
                      </time>
                    </article>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>

        {/* Export / Import */}
        <div
          className="card-surface rounded-xl p-5 lg:p-6"
          style={{ border: "1px solid rgba(201,215,227,0.06)" }}
        >
          <h3
            className="label-upper mb-5"
            style={{ color: "#4b5563" }}
          >
            Export / Import
          </h3>
          <p
            className="mb-2 text-sm"
            style={{
              color: "#9ca3af",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 300,
              lineHeight: 1.6,
            }}
          >
            Back up or restore your watchlist, paper trades, price alerts, paper signal history,
            saved backtests, signal sensitivity, futures paper data, strategy profile, test
            scenario, futures strategy validations, forward test sessions, Risk Controller rules,
            Risk Journal, and app settings.
          </p>
          <p
            className="mb-5 text-xs"
            style={{ color: "#4b5563", lineHeight: 1.6 }}
          >
            This only affects local browser data. No wallet, trading, or real funds are connected.
          </p>
          <div className="flex flex-wrap gap-3">
            <button onClick={handleExport} className="btn-accent flex items-center gap-2">
              <Download size={14} />
              Export Data
            </button>
            <button onClick={handleImportClick} className="btn-primary flex items-center gap-2">
              <Upload size={14} />
              Import Data
            </button>
            <button onClick={handleClear} className="btn-danger flex items-center gap-2">
              <Trash2 size={14} />
              Clear All Data
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImport}
            className="hidden"
            aria-label="Import local data backup"
          />
          {dataStatus && (
            <p
              className="mt-4 text-sm"
              style={{
                color: dataStatus.type === "success" ? "#22c55e" : "#ef4444",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 400,
              }}
            >
              {dataStatus.message}
            </p>
          )}
        </div>

        {/* About */}
        <div
          className="card-surface rounded-xl p-5 lg:p-6"
          style={{ border: "1px solid rgba(201,215,227,0.06)" }}
        >
          <h3
            className="label-upper mb-5"
            style={{ color: "#4b5563" }}
          >
            About
          </h3>
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 300,
              fontSize: 13,
              color: "#4b5563",
              marginBottom: 12,
            }}
          >
            CHANTER Crypto Radar v1.0.0
          </p>
          <div className="flex flex-wrap gap-4">
            <a
              href="/help"
              className="text-link-accent"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 400,
                fontSize: 13,
                color: "#cc9258",
              }}
            >
              Documentation
            </a>
            <a
              href="/settings"
              className="text-link-accent"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 400,
                fontSize: 13,
                color: "#cc9258",
              }}
            >
              Privacy Policy
            </a>
            <a
              href="/settings"
              className="text-link-accent"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 400,
                fontSize: 13,
                color: "#cc9258",
              }}
            >
              Terms of Service
            </a>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-4">
          <button onClick={handleSave} className="btn-primary">
            Save Changes
          </button>
          {saved && (
            <span
              className="text-sm animate-fade-in"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 400,
                color: "#22c55e",
              }}
            >
              Saved!
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
