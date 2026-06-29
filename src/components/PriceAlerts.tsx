import { useState } from "react";
import { Bell, BellRing, Power, RotateCcw, Trash2 } from "lucide-react";
import { useAppState } from "@/context/AppContext";
import { COINS, formatCurrency } from "@/data/mockData";
import type { PriceAlert } from "@/types";

interface AlertRowProps {
  alert: PriceAlert;
  onToggle: (alert: PriceAlert) => void;
  onDelete: (id: string) => void;
  onReset: (id: string) => void;
}

function formatAlertTime(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AlertRow({ alert, onToggle, onDelete, onReset }: AlertRowProps) {
  const triggeredAt = formatAlertTime(alert.triggeredAt);

  return (
    <div
      className="rounded-lg p-4"
      style={{
        backgroundColor: alert.isTriggered ? "rgba(245,158,11,0.05)" : "rgba(201,215,227,0.02)",
        border: alert.isTriggered
          ? "1px solid rgba(245,158,11,0.2)"
          : "1px solid rgba(201,215,227,0.06)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="data-mono text-sm" style={{ color: "#c9d7e3" }}>
              {alert.symbol}
            </span>
            {alert.isTriggered && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]"
                style={{ color: "#f59e0b", backgroundColor: "rgba(245,158,11,0.1)" }}
              >
                Triggered
              </span>
            )}
          </div>
          <p className="mt-1 text-sm" style={{ color: "#c9d7e3" }}>
            {alert.condition === "above" ? "Above" : "Below"} {formatCurrency(alert.targetPrice)}
          </p>
          {triggeredAt && (
            <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>
              Triggered {triggeredAt}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onToggle(alert)}
            className="flex items-center gap-1 text-xs transition-colors hover:text-[#c9d7e3]"
            style={{ color: "#6b7280" }}
          >
            <Power size={12} />
            {alert.isActive ? "Disable" : "Enable"}
          </button>
          {alert.isTriggered && (
            <button
              type="button"
              onClick={() => onReset(alert.id)}
              className="flex items-center gap-1 text-xs transition-colors hover:text-[#c9d7e3]"
              style={{ color: "#cc9258" }}
            >
              <RotateCcw size={12} />
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(alert.id)}
            className="flex items-center gap-1 text-xs transition-colors hover:text-[#ef4444]"
            style={{ color: "#6b7280" }}
          >
            <Trash2 size={12} />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

interface AlertGroupProps extends Omit<AlertRowProps, "alert"> {
  title: string;
  alerts: PriceAlert[];
  icon: React.ReactNode;
}

function AlertGroup({ title, alerts, icon, onToggle, onDelete, onReset }: AlertGroupProps) {
  if (alerts.length === 0) return null;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span style={{ color: "#6b7280" }}>{icon}</span>
        <h4 className="label-upper" style={{ color: "#6b7280", fontSize: 10 }}>
          {title} · {alerts.length}
        </h4>
      </div>
      <div className="flex flex-col gap-3">
        {alerts.map((alert) => (
          <AlertRow
            key={alert.id}
            alert={alert}
            onToggle={onToggle}
            onDelete={onDelete}
            onReset={onReset}
          />
        ))}
      </div>
    </div>
  );
}

export default function PriceAlerts() {
  const { state, dispatch } = useAppState();
  const [coinId, setCoinId] = useState(COINS[0].id);
  const [condition, setCondition] = useState<PriceAlert["condition"]>("above");
  const [targetPrice, setTargetPrice] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const triggeredAlerts = state.alerts.filter((alert) => alert.isTriggered);
  const activeAlerts = state.alerts.filter((alert) => alert.isActive && !alert.isTriggered);
  const inactiveAlerts = state.alerts.filter((alert) => !alert.isActive && !alert.isTriggered);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const coin = COINS.find((item) => item.id === coinId);
    const numericTarget = Number(targetPrice);

    if (!coin || !Number.isFinite(numericTarget) || numericTarget <= 0) {
      setFormError("Enter a target price greater than zero.");
      return;
    }

    dispatch({
      type: "ADD_PRICE_ALERT",
      payload: {
        id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        coinId: coin.id,
        symbol: coin.symbol,
        condition,
        targetPrice: numericTarget,
        isActive: true,
        isTriggered: false,
        createdAt: new Date().toISOString(),
      },
    });
    setTargetPrice("");
    setFormError(null);
  };

  const handleToggle = (alert: PriceAlert) => {
    dispatch({
      type: "SET_PRICE_ALERT_ACTIVE",
      payload: { id: alert.id, isActive: !alert.isActive },
    });
  };

  const handleDelete = (id: string) => {
    dispatch({ type: "DELETE_PRICE_ALERT", payload: id });
  };

  const handleReset = (id: string) => {
    dispatch({ type: "RESET_PRICE_ALERT", payload: id });
  };

  return (
    <section className="mt-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="section-title mb-2" style={{ fontSize: 22 }}>
            Price Alerts
          </h3>
          <p className="section-subtitle">Alerts are local to this browser</p>
          <p className="mt-1 text-xs" style={{ color: "#4b5563" }}>
            No trading or wallet actions are performed
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.08em]">
          <span className="rounded-full px-2.5 py-1" style={{ color: "#6b7280", border: "1px solid rgba(201,215,227,0.08)" }}>
            Active {activeAlerts.length}
          </span>
          <span
            aria-live="polite"
            className="rounded-full px-2.5 py-1"
            style={{ color: triggeredAlerts.length > 0 ? "#f59e0b" : "#6b7280", border: "1px solid rgba(201,215,227,0.08)" }}
          >
            Triggered {triggeredAlerts.length}
          </span>
          <span className="rounded-full px-2.5 py-1" style={{ color: "#6b7280", border: "1px solid rgba(201,215,227,0.08)" }}>
            Inactive {inactiveAlerts.length}
          </span>
        </div>
      </div>

      {!state.settings.priceAlerts && (
        <p className="mb-4 text-xs" style={{ color: "#f59e0b" }}>
          Alert checks are paused in Settings.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <form
          onSubmit={handleSubmit}
          className="card-surface rounded-xl p-5 lg:p-6"
          style={{ border: "1px solid rgba(201,215,227,0.06)" }}
        >
          <h4 className="label-upper mb-5" style={{ color: "#6b7280" }}>
            Create Alert
          </h4>
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="alert-coin" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
                Coin
              </label>
              <select
                id="alert-coin"
                value={coinId}
                onChange={(event) => setCoinId(event.target.value)}
                className="input-dark cursor-pointer"
              >
                {COINS.map((coin) => (
                  <option key={coin.id} value={coin.id}>
                    {coin.symbol} — {coin.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="alert-condition" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
                Condition
              </label>
              <select
                id="alert-condition"
                value={condition}
                onChange={(event) => setCondition(event.target.value as PriceAlert["condition"])}
                className="input-dark cursor-pointer"
              >
                <option value="above">Price is above</option>
                <option value="below">Price is below</option>
              </select>
            </div>

            <div>
              <label htmlFor="alert-target" className="label-upper mb-2 block" style={{ color: "#4b5563", fontSize: 10 }}>
                Target Price (USD)
              </label>
              <input
                id="alert-target"
                type="number"
                min="0"
                step="any"
                value={targetPrice}
                onChange={(event) => setTargetPrice(event.target.value)}
                placeholder="Enter target price"
                className="input-dark"
                required
              />
            </div>

            {formError && (
              <p role="alert" className="text-xs" style={{ color: "#ef4444" }}>
                {formError}
              </p>
            )}

            <button type="submit" className="btn-primary flex items-center justify-center gap-2">
              <Bell size={14} />
              Add Alert
            </button>
          </div>
        </form>

        <div
          className="card-surface rounded-xl p-5 lg:p-6"
          style={{ border: "1px solid rgba(201,215,227,0.06)" }}
        >
          <h4 className="label-upper mb-5" style={{ color: "#6b7280" }}>
            Your Alerts
          </h4>

          {state.alerts.length === 0 ? (
            <p className="text-sm" style={{ color: "#4b5563" }}>
              No price alerts yet.
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              <AlertGroup
                title="Triggered"
                alerts={triggeredAlerts}
                icon={<BellRing size={13} />}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onReset={handleReset}
              />
              <AlertGroup
                title="Active"
                alerts={activeAlerts}
                icon={<Bell size={13} />}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onReset={handleReset}
              />
              <AlertGroup
                title="Inactive"
                alerts={inactiveAlerts}
                icon={<Power size={13} />}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onReset={handleReset}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
