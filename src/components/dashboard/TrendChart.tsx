import type { DailyMetric } from "@/lib/storage/analytics-store";

/** A lightweight traffic sparkline (no chart dependency). `label` names the
 *  window (e.g. "Last 30 days", "This week") so the same chart serves the live
 *  range view and the weekly/monthly recaps. */
export function TrendChart({ metrics, label = "Last 30 days" }: { metrics: DailyMetric[]; label?: string }) {
  if (metrics.length < 2) return null;
  const values = metrics.map((m) => m.pageViews);
  const total = values.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...values);
  const w = 300;
  const h = 56;

  // Below a handful of visitors, a real chart is a single spike on a flat line —
  // it reads as a rendering glitch, not data. Show a calm baseline + a plain note
  // so an early, low-traffic window looks deliberate.
  if (total < 5) {
    return (
      <div className="rounded-xl border border-glass-border bg-glass p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gray-muted">{label}</p>
          <p className="text-[12px] text-gray-muted">
            <span className="font-semibold text-warm-black">{total.toLocaleString()}</span> {total === 1 ? "visitor" : "visitors"}
          </p>
        </div>
        <div className="flex h-14 items-center justify-center">
          <div className="w-full border-t border-dashed border-glass-border" />
        </div>
        <p className="mt-2 text-center text-[11px] text-gray-muted">
          Not enough traffic yet to chart. This fills in as more people find you.
        </p>
      </div>
    );
  }

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (v / max) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M ${pts.join(" L ")}`;
  const area = `M 0,${h} L ${pts.join(" L ")} L ${w},${h} Z`;
  return (
    <div className="rounded-xl border border-glass-border bg-glass p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gray-muted">{label}</p>
        <p className="text-[12px] text-gray-muted">
          <span className="font-semibold text-warm-black">{total.toLocaleString()}</span> visitors
        </p>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-14 w-full" aria-hidden="true">
        <path d={area} fill="var(--accent-dim)" opacity={0.5} />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
