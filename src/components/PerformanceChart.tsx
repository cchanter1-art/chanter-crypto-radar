import { getPortfolioPerformance } from "@/data/mockData";

export default function PerformanceChart() {
  const data = getPortfolioPerformance();
  const width = 800;
  const height = 280;
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((val, i) => ({
    x: padding.left + (i / (data.length - 1)) * chartWidth,
    y: padding.top + chartHeight - ((val - min) / range) * chartHeight,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

  const areaPath = `${linePath} L${points[points.length - 1].x},${padding.top + chartHeight} L${points[0].x},${padding.top + chartHeight} Z`;

  const yTicks = 5;
  const yValues = Array.from({ length: yTicks + 1 }, (_, i) => min + (range / yTicks) * i);

  const xLabels = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (30 - i * 6));
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  });

  return (
    <div
      className="card-surface rounded-xl p-5 lg:p-6"
      style={{ border: "1px solid rgba(201,215,227,0.06)" }}
    >
      <h3
        className="label-upper mb-4"
        style={{ color: "#4b5563" }}
      >
        Portfolio Performance — 30 Days
      </h3>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height: 320 }}>
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#cc9258" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#cc9258" stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yValues.map((val, i) => {
          const y = padding.top + chartHeight - (i / yTicks) * chartHeight;
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="rgba(201,215,227,0.04)"
                strokeWidth={1}
              />
              <text
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 300,
                  fontSize: 10,
                  fill: "#4b5563",
                }}
              >
                ${(val / 1000).toFixed(1)}k
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill="url(#chartGradient)" />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke="#cc9258"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* X-axis labels */}
        {xLabels.map((label, i) => (
          <text
            key={i}
            x={padding.left + (i / (xLabels.length - 1)) * chartWidth}
            y={height - 8}
            textAnchor="middle"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 300,
              fontSize: 10,
              fill: "#4b5563",
            }}
          >
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}
