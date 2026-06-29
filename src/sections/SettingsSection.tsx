import { useState } from "react";
import { useAppState } from "@/context/AppContext";
import ToggleSwitch from "@/components/ToggleSwitch";
import { Download, Trash2 } from "lucide-react";

export default function SettingsSection() {
  const { state, dispatch } = useAppState();
  const [formData, setFormData] = useState({
    displayName: state.settings.displayName,
    email: state.settings.email,
  });
  const [saved, setSaved] = useState(false);

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
    const data = {
      watchlist: state.watchlist,
      trades: state.trades,
      settings: state.settings,
      alerts: state.alerts,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chanter-data.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    if (window.confirm("Are you sure? This will delete your watchlist data, trades, and price alerts.")) {
      dispatch({ type: "UPDATE_SETTINGS", payload: { displayName: "", email: "" } });
      state.watchlist.forEach((id) => dispatch({ type: "REMOVE_FROM_WATCHLIST", payload: id }));
      state.trades.forEach((t) => dispatch({ type: "DELETE_TRADE", payload: t.id }));
      state.alerts.forEach((alert) => dispatch({ type: "DELETE_PRICE_ALERT", payload: alert.id }));
      localStorage.removeItem("chanter-watchlist");
      localStorage.removeItem("chanter-trades");
      localStorage.removeItem("chanter-settings");
      localStorage.removeItem("chanter-price-alerts");
      window.location.reload();
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

        {/* Data */}
        <div
          className="card-surface rounded-xl p-5 lg:p-6"
          style={{ border: "1px solid rgba(201,215,227,0.06)" }}
        >
          <h3
            className="label-upper mb-5"
            style={{ color: "#4b5563" }}
          >
            Data
          </h3>
          <div className="flex flex-wrap gap-3">
            <button onClick={handleExport} className="btn-accent flex items-center gap-2">
              <Download size={14} />
              Export Data
            </button>
            <button onClick={handleClear} className="btn-danger flex items-center gap-2">
              <Trash2 size={14} />
              Clear All Data
            </button>
          </div>
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
