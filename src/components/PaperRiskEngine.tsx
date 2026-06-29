import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ShieldCheck,
  Target,
} from "lucide-react";
import { useAppState, usePortfolio } from "@/context/AppContext";
import { formatCurrency, formatPercentage } from "@/data/mockData";
import type { Coin, PortfolioPosition } from "@/types";

interface PaperRiskEngineProps {
  className?: string;
}

interface RiskNote {
  id: string;
  title: string;
  body: string;
  icon: ReactNode;
  color: string;
}

interface PositionDetail extends PortfolioPosition {
  coin?: Coin;
}

const HIGH_LOSS_THRESHOLD_PERCENT = -25;
const OVERSIZED_ALLOCATION_PERCENT = 50;

function getPositionLabel(position: PositionDetail): string {
  return position.coin?.symbol ?? position.coinId.toUpperCase();
}

export default function PaperRiskEngine({ className = "" }: PaperRiskEngineProps) {
  const { coins } = useAppState();
  const { positions, totalValue, totalPL, totalPLPercent } = usePortfolio();

  const positionDetails: PositionDetail[] = positions.map((position) => ({
    ...position,
    coin: coins.find((coin) => coin.id === position.coinId),
  }));

  const largestPosition = positionDetails.reduce<PositionDetail | undefined>(
    (largest, position) =>
      !largest || position.currentValue > largest.currentValue ? position : largest,
    undefined,
  );

  const concentrationPercent = largestPosition && totalValue > 0
    ? (largestPosition.currentValue / totalValue) * 100
    : 0;
  const hasOversizedAllocation = concentrationPercent > OVERSIZED_ALLOCATION_PERCENT;
  const drawdownPercent = totalPL < 0 ? Math.abs(totalPLPercent) : 0;
  const highLossPositions = positionDetails.filter(
    (position) => position.plPercent <= HIGH_LOSS_THRESHOLD_PERCENT,
  );
  const hasActivePositions = positionDetails.length > 0 && totalValue > 0;

  const highLossSummary = highLossPositions.length === 1
    ? `${getPositionLabel(highLossPositions[0])} is below the -25% local tracking threshold at ${formatPercentage(highLossPositions[0].plPercent)}.`
    : `${highLossPositions.length} positions are below the -25% local tracking threshold: ${highLossPositions.map(getPositionLabel).join(", ")}.`;

  const notes: RiskNote[] = hasActivePositions && largestPosition
    ? [
        {
          id: "largest-position",
          title: "Tracking signal: largest position",
          body: `${getPositionLabel(largestPosition)} is the largest paper position at ${formatCurrency(largestPosition.currentValue)} (${concentrationPercent.toFixed(1)}% of current value).`,
          icon: <Target size={14} />,
          color: largestPosition.coin?.color ?? "#9ca3af",
        },
        {
          id: "concentration",
          title: hasOversizedAllocation
            ? "Risk note: oversized allocation"
            : "Risk note: allocation size",
          body: hasOversizedAllocation
            ? `${getPositionLabel(largestPosition)} is above the 50% local tracking threshold at ${concentrationPercent.toFixed(1)}% of paper-portfolio value.`
            : `Largest allocation is ${concentrationPercent.toFixed(1)}% of paper-portfolio value, below the 50% oversized tracking threshold.`,
          icon: <BarChart3 size={14} />,
          color: hasOversizedAllocation ? "#f59e0b" : "#6b7280",
        },
        {
          id: "drawdown",
          title: "Tracking signal: unrealized drawdown",
          body: drawdownPercent > 0
            ? `Total unrealized drawdown is ${drawdownPercent.toFixed(2)}% (${formatCurrency(Math.abs(totalPL))}) based on current prices and remaining cost basis.`
            : `No unrealized drawdown is currently detected. Unrealized paper P/L is ${formatCurrency(Math.abs(totalPL))} (${formatPercentage(totalPLPercent)}).`,
          icon: <Activity size={14} />,
          color: drawdownPercent > 0 ? "#ef4444" : "#22c55e",
        },
        {
          id: "high-loss",
          title: highLossPositions.length > 0
            ? "Risk note: high-loss position"
            : "Risk note: high-loss check",
          body: highLossPositions.length > 0
            ? highLossSummary
            : "No active paper position is below the -25% local tracking threshold.",
          icon: <AlertTriangle size={14} />,
          color: highLossPositions.length > 0 ? "#ef4444" : "#6b7280",
        },
      ]
    : [
        {
          id: "empty-portfolio",
          title: "Paper portfolio only",
          body: "No active paper positions are available for local risk tracking.",
          icon: <ShieldCheck size={14} />,
          color: "#6b7280",
        },
      ];

  return (
    <section
      className={`card-surface rounded-xl p-5 lg:p-6 ${className}`}
      style={{ border: "1px solid rgba(201,215,227,0.06)" }}
      aria-labelledby="paper-risk-engine-title"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 id="paper-risk-engine-title" className="section-title mb-1" style={{ fontSize: 22 }}>
            Risk Engine
          </h3>
          <p className="text-xs" style={{ color: "#6b7280" }}>
            Local rule-based risk notes
          </p>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.08em]"
          style={{
            color: "#6b7280",
            border: "1px solid rgba(201,215,227,0.08)",
          }}
        >
          Paper portfolio only
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {notes.map((note) => (
          <div
            key={note.id}
            className="rounded-lg p-4"
            style={{
              backgroundColor: "rgba(201,215,227,0.02)",
              border: "1px solid rgba(201,215,227,0.05)",
            }}
          >
            <div className="mb-2 flex items-center gap-2">
              <span style={{ color: note.color }}>{note.icon}</span>
              <h4 className="label-upper" style={{ color: "#6b7280", fontSize: 10 }}>
                {note.title}
              </h4>
            </div>
            <p
              className="text-sm"
              style={{
                color: "#9ca3af",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 300,
                lineHeight: 1.6,
              }}
            >
              {note.body}
            </p>
          </div>
        ))}
      </div>

      <p
        className="mt-5 text-xs"
        style={{
          color: "#4b5563",
          borderTop: "1px solid rgba(201,215,227,0.05)",
          paddingTop: 16,
        }}
      >
        For tracking only. Not financial advice.
      </p>
    </section>
  );
}
