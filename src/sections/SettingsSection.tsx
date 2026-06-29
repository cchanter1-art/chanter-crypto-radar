import { useRef, useState, type ChangeEvent } from "react";
import { useAppState } from "@/context/AppContext";
import ToggleSwitch from "@/components/ToggleSwitch";
import { Download, Trash2, Upload } from "lucide-react";
import {
  createEmptyLocalAppState,
  createLocalDataBackup,
  parseLocalDataBackup,
} from "@/lib/localDataBackup";
import {
  clearPaperSignalHistory,
  loadPaperSignalHistory,
  savePaperSignalHistory,
} from "@/lib/paperSignalEngine";
import {
  clearBacktestHistory,
  loadBacktestHistory,
  saveBacktestHistory,
} from "@/lib/paperBacktestEngine";

type DataStatus = {
  type: "success" | "error";
  message: string;
};

export default function SettingsSection() {
  const { state, dispatch } = useAppState();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [formData, setFormData] = useState({
    displayName: state.settings.displayName,
    email: state.settings.email,
  });
  const [saved, setSaved] = useState(false);
  const [dataStatus, setDataStatus] = useState<DataStatus | null>(null);

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

      if (!savePaperSignalHistory(result.value.paperSignals)) {
        setDataStatus({
          type: "error",
          message: "Import failed. Paper signal history could not be saved in this browser.",
        });
        return;
      }

      if (!saveBacktestHistory(result.value.backtestRuns)) {
        savePaperSignalHistory(previousPaperSignals);
        setDataStatus({
          type: "error",
          message: "Import failed. Backtest history could not be saved in this browser.",
        });
        return;
      }

      dispatch({ type: "LOAD_STATE", payload: result.value.state });
      setFormData({
        displayName: result.value.state.settings.displayName,
        email: result.value.state.settings.email,
      });
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
      clearBacktestHistory();
      setFormData({
        displayName: emptyState.settings.displayName,
        email: emptyState.settings.email,
      });
      setDataStatus({ type: "success", message: "Local app data cleared." });
    }
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
            saved backtests, and app settings.
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
