import type { DailyMetric } from "@/lib/storage/analytics-store";

function day(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Visitors per day as one quiet line (no chart dependency). The window's name
 * and total sit on the chart itself; the first and last day label the ends.
 * It is the one object on Visitors and Reports, so it gets the page surface.
 */
export function TrendChart({ metrics, label = "Last 30 days" }: { metrics: DailyMetric[]; label?: string }) {
  if (metrics.length < 2) return null;
  const values = metrics.map((m) => m.pageViews);
  const total = values.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...values);
  const peak = values.indexOf(Math.max(...values));
  const w = 600;
  const h = 160;

  const head = (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <p className="m-0 text-[13px] font-medium text-[var(--st-text-3)]">{label}</p>
      <p className="m-0 text-[15px] text-[var(--st-text)]"><span className="tabular-nums">{total.toLocaleString()}</span> {total === 1 ? "visitor" : "visitors"}</p>
    </div>
  );

  // Below a handful of visitors a chart is one spike on a flat line; say so instead.
  if (total < 5) {
    return (
      <figure className="m-0 flex flex-col gap-4 rounded-[var(--st-r-lg)] bg-[var(--st-surface)] p-6 shadow-[var(--st-shadow-sm)]">
        {head}
        <div className="h-[1px] w-full bg-[var(--st-line)]" aria-hidden="true" />
        <figcaption className="text-[14px] text-[var(--st-text-2)]">Not enough visits yet to draw. This fills in as more people find you.</figcaption>
      </figure>
    );
  }

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (v / max) * (h - 8) - 4;
    return { x, y };
  });
  const line = `M ${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")}`;
  const area = `${line} L ${w},${h} L 0,${h} Z`;
  const top = pts[peak]!;
  return (
    <figure className="m-0 flex flex-col gap-4 rounded-[var(--st-r-lg)] bg-[var(--st-surface)] p-6 shadow-[var(--st-shadow-sm)]" aria-label={`${label}: ${total} visitors, most on ${day(metrics[peak]!.date)}`}>
      {head}
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-40 w-full text-[var(--st-accent)]" aria-hidden="true">
        <path d={area} fill="currentColor" opacity={0.07} />
        <path d={line} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={top.x} cy={top.y} r={3.5} fill="currentColor" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="flex justify-between text-[13px] tabular-nums text-[var(--st-text-3)]">
        <span>{day(metrics[0]!.date)}</span>
        <span>Most visits {day(metrics[peak]!.date)}: {values[peak]!.toLocaleString()}</span>
        <span>{day(metrics[metrics.length - 1]!.date)}</span>
      </figcaption>
    </figure>
  );
}
