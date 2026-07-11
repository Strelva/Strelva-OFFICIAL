/** A compact inline sparkline — area fill + line, no card or axis. Sits at the
 *  foot of a KPI tile to give a bare number its recent shape. Server-safe (pure
 *  SVG, same visual language as TrendChart). Renders nothing when there's too
 *  little to say: under two points, or an all-flat/all-zero series (a flat line
 *  reads as a rendering glitch, not data). */
export function Sparkline({
  series,
  tone = "accent",
  className = "",
}: {
  series: number[];
  tone?: "accent" | "positive" | "critical";
  className?: string;
}) {
  if (series.length < 2) return null;
  const max = Math.max(...series);
  const min = Math.min(...series);
  if (max <= 0 || max === min) return null;

  const w = 120;
  const h = 28;
  const pad = 2;
  const span = max - min;
  const coords = series.map((v, i) => {
    const x = (i / (series.length - 1)) * w;
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M ${coords.join(" L ")}`;
  const area = `M 0,${h} L ${coords.join(" L ")} L ${w},${h} Z`;
  const stroke =
    tone === "positive" ? "var(--positive)" : tone === "critical" ? "var(--critical)" : "var(--accent)";

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={`h-7 w-full ${className}`}
      aria-hidden="true"
    >
      <path d={area} fill={stroke} opacity={0.1} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
