"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** The ONE metric primitive. Both Today's stat grid and the weekly brief render
 *  through this — one padding, one 28px number, one eyebrow. Pass `countUp` to
 *  animate a numeric value; pass `detail` for a caption or `delta` for a
 *  vs-last-week line (sage-positive on a rise). */
function CountUp({ end, duration = 800 }: { end: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current || end === 0) {
      const frame = requestAnimationFrame(() => setCount(end));
      return () => cancelAnimationFrame(frame);
    }

    const startTime = performance.now();
    let frame = 0;
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * end));

      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      } else {
        hasAnimated.current = true;
      }
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [end, duration]);

  return <span>{count}</span>;
}

export function StatTile({
  label,
  value,
  detail,
  delta,
  icon,
  countUp = false,
}: {
  label: string;
  value: string | number;
  detail?: string;
  delta?: number;
  /** A rendered icon element (e.g. `<Users className="h-4 w-4" />`), NOT a
   *  component reference — server pages render this tile, and component
   *  functions can't cross the server→client boundary; elements can. */
  icon: ReactNode;
  countUp?: boolean;
}) {
  const showDelta = typeof delta === "number" && delta !== 0;

  return (
    <div className="rounded-xl border border-glass-border bg-glass p-4">
      <div className="mb-3 flex items-center gap-2 text-gray-muted">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-[0.14em]">{label}</span>
      </div>
      <p className="text-[28px] font-semibold leading-none text-warm-black">
        {countUp && typeof value === "number" ? <CountUp end={value} /> : value}
      </p>
      {detail && <p className="mt-2 text-[12px] leading-relaxed text-gray-muted">{detail}</p>}
      {showDelta && (
        <p className={`mt-2 text-[12px] ${delta > 0 ? "text-positive" : "text-gray-muted"}`}>
          {delta > 0 ? "+" : ""}
          {delta} vs last week
        </p>
      )}
    </div>
  );
}
