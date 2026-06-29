import { useState, useEffect, useRef } from "react";

export function useAnimatedNumber(target: number, duration: number = 800, decimals: number = 2): number {
  const [current, setCurrent] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);
  const toRef = useRef(target);

  useEffect(() => {
    fromRef.current = current;
    toRef.current = target;
    startRef.current = null;

    let raf: number;

    const step = (timestamp: number) => {
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = fromRef.current + (toRef.current - fromRef.current) * eased;
      setCurrent(value);

      if (progress < 1) {
        raf = requestAnimationFrame(step);
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return Number(current.toFixed(decimals));
}
