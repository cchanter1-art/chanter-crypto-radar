import { COINS, getAllocationData } from "@/data/mockData";
import { useAppState } from "@/context/AppContext";
import { TrendingUp, TrendingDown, ArrowRightLeft, Target } from "lucide-react";

export default function MetricsList() {
  const { state } = useAppState();
  const allocation = getAllocationData();
  const coinMap = new Map(COINS.map((c) => [c.id, c]));

  const bestPerformer = allocation.reduce((best, current) =>
    current.percentage > best.percentage ? current : best,
    allocation[0]
  );

  const worstPerformer = allocation.reduce((worst, current) =>
    current.percentage < worst.percentage ? current : bestPerformer,
    allocation[0]
  );

  const totalTrades = state.trades.length;
  const winRate = 68.5;

  const metrics = [
    {
      label: "Best Performer",
      value: coinMap.get(bestPerformer.coinId)?.symbol || "BTC",
      icon: <TrendingUp size={14} style={{ color: "#22c55e" }} />,
    },
    {
      label: "Worst Performer",
      value: coinMap.get(worstPerformer.coinId)?.symbol || "ADA",
      icon: <TrendingDown size={14} style={{ color: "#ef4444" }} />,
    },
    {
      label: "Total Trades",
      value: totalTrades.toString(),
      icon: <ArrowRightLeft size={14} style={{ color: "#4b5563" }} />,
    },
    {
      label: "Win Rate",
      value: `${winRate.toFixed(1)}%`,
      icon: <Target size={14} style={{ color: "#cc9258" }} />,
    },
  ];

  return (
    <div
      className="card-surface rounded-xl p-5 lg:p-6"
      style={{ border: "1px solid rgba(201,215,227,0.06)" }}
    >
      <h3
        className="label-upper mb-4"
        style={{ color: "#4b5563" }}
      >
        Performance Metrics
      </h3>

      <div className="flex flex-col" style={{ gap: 20 }}>
        {metrics.map((metric) => (
          <div key={metric.label} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {metric.icon}
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 300,
                  fontSize: 13,
                  color: "#4b5563",
                }}
              >
                {metric.label}
              </span>
            </div>
            <span
              className="data-mono text-base lg:text-lg"
              style={{ color: "#c9d7e3", fontWeight: 400 }}
            >
              {metric.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
