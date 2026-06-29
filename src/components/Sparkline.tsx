import { useEffect, useRef } from "react";

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
}

export default function Sparkline({ data, color = "#cc9258", height = 40 }: SparklineProps) {
  const pathRef = useRef<SVGPathElement>(null);

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 100;
  const padding = 4;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const pathD = `M${points.join(" L")}`;
  const pathLength = 200;

  useEffect(() => {
    if (pathRef.current) {
      pathRef.current.style.strokeDasharray = `${pathLength}`;
      pathRef.current.style.strokeDashoffset = `${pathLength}`;
      requestAnimationFrame(() => {
        if (pathRef.current) {
          pathRef.current.style.transition = "stroke-dashoffset 1s ease";
          pathRef.current.style.strokeDashoffset = "0";
        }
      });
    }
  }, [data]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ height }}
      preserveAspectRatio="none"
    >
      <path
        ref={pathRef}
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
