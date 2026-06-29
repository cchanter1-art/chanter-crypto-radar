import { COINS, getAllocationData } from "@/data/mockData";

export default function DonutChart() {
  const allocation = getAllocationData();
  const coinMap = new Map(COINS.map((c) => [c.id, c]));

  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 80;
  const innerRadius = 50;

  let startAngle = 0;

  const segments = allocation.map((item) => {
    const coin = coinMap.get(item.coinId);
    const angle = (item.percentage / 100) * 2 * Math.PI;
    const endAngle = startAngle + angle;

    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);

    const x3 = cx + innerRadius * Math.cos(endAngle);
    const y3 = cy + innerRadius * Math.sin(endAngle);
    const x4 = cx + innerRadius * Math.cos(startAngle);
    const y4 = cy + innerRadius * Math.sin(startAngle);

    const largeArc = angle > Math.PI ? 1 : 0;

    const path = [
      `M${x1},${y1}`,
      `A${radius},${radius} 0 ${largeArc},1 ${x2},${y2}`,
      `L${x3},${y3}`,
      `A${innerRadius},${innerRadius} 0 ${largeArc},0 ${x4},${y4}`,
      "Z",
    ].join(" ");

    const midAngle = startAngle + angle / 2;
    const result = {
      path,
      color: coin?.color || "#cc9258",
      symbol: coin?.symbol || item.coinId.toUpperCase(),
      percentage: item.percentage,
      midAngle,
    };

    startAngle = endAngle;
    return result;
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
        Asset Allocation
      </h3>

      <div className="flex flex-col items-center">
        <svg viewBox={`0 0 ${size} ${size}`} className="w-40 h-40 lg:w-48 lg:h-48">
          {segments.map((seg, i) => (
            <path
              key={i}
              d={seg.path}
              fill={seg.color}
              opacity={0.85}
              stroke="#0d0d0d"
              strokeWidth={2}
            />
          ))}
          <text
            x={cx}
            y={cy - 4}
            textAnchor="middle"
            className="data-mono"
            style={{ fontSize: 14, fill: "#c9d7e3", fontWeight: 400 }}
          >
            Portfolio
          </text>
          <text
            x={cx}
            y={cy + 12}
            textAnchor="middle"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 300,
              fontSize: 10,
              fill: "#4b5563",
            }}
          >
            By Value
          </text>
        </svg>

        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4">
          {segments.map((seg, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: seg.color }}
              />
              <span
                className="data-mono text-xs"
                style={{ color: "#c9d7e3" }}
              >
                {seg.symbol}
              </span>
              <span
                className="data-mono text-xs"
                style={{ color: "#4b5563" }}
              >
                {seg.percentage.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
