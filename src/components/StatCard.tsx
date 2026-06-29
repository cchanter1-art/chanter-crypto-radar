import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  color?: string;
  icon?: ReactNode;
}

export default function StatCard({ label, value, prefix = "", suffix = "", decimals = 2, color, icon }: StatCardProps) {
  const animated = useAnimatedNumber(value, 800, decimals);

  const displayColor = color || "#c9d7e3";

  return (
    <div
      className="card-surface rounded-xl p-5 lg:p-6 flex-1"
      style={{
        border: "1px solid rgba(201,215,227,0.06)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon && <span style={{ color: "#4b5563" }}>{icon}</span>}
        <span
          className="label-upper"
          style={{ color: "#4b5563" }}
        >
          {label}
        </span>
      </div>
      <p
        className="data-mono text-xl lg:text-2xl"
        style={{ color: displayColor, fontWeight: 400 }}
      >
        {prefix}{animated.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
      </p>
    </div>
  );
}
