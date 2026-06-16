import { TONE_DOT, scoreTone } from "@/lib/status-colors";

/**
 * Tiny inline SVG sparkline for a 0-100 score series (oldest -> newest).
 * Stroke tone follows the latest value. Server-renderable (no client JS).
 */
export function Sparkline({
  values,
  width = 96,
  height = 24,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;

  const max = 100;
  const min = 0;
  const span = max - min || 1;
  const stepX = width / (values.length - 1);

  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const last = values[values.length - 1];
  // Map the tone dot bg class to a stroke color via currentColor.
  const toneText: Record<string, string> = {
    "bg-emerald-400": "text-emerald-400",
    "bg-amber-400": "text-amber-400",
    "bg-red-400": "text-red-400",
    "bg-accent": "text-accent",
    "bg-gray-faint": "text-gray-faint",
  };
  const strokeClass = toneText[TONE_DOT[scoreTone(last)]] ?? "text-gray-faint";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={strokeClass}
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
