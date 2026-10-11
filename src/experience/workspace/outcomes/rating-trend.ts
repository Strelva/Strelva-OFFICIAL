/** Google rating over time against the 4.5 line many people filter on. */

export interface RatingPoint {
  /** Axis label, "May". */
  label: string;
  rating: number;
}

export interface RatingCrossing {
  /** Index of the first point on the new side of the cutoff. */
  index: number;
  direction: "up" | "down";
  /** 0–1 along the segment from `index - 1` to `index` where the line meets the cutoff. */
  t: number;
}

/** The most recent time the line crossed the cutoff, or null if it never did. */
export function ratingCrossing(points: readonly RatingPoint[], cutoff = 4.5): RatingCrossing | null {
  for (let index = points.length - 1; index >= 1; index -= 1) {
    const before = points[index - 1]?.rating ?? 0;
    const after = points[index]?.rating ?? 0;
    const up = before < cutoff && after >= cutoff;
    const down = before >= cutoff && after < cutoff;
    if (!up && !down) continue;
    return { index, direction: up ? "up" : "down", t: after === before ? 0 : (cutoff - before) / (after - before) };
  }
  return null;
}

export type RatingTrendWord = "Climbing" | "Slipping" | "Holding";

/** Direction over the shown window, ignoring changes under 0.05. */
export function ratingTrendWord(points: readonly RatingPoint[]): RatingTrendWord {
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length < 2 || !first || !last) return "Holding";
  const change = last.rating - first.rating;
  return change >= 0.05 ? "Climbing" : change <= -0.05 ? "Slipping" : "Holding";
}

export interface RatingChartGeometry {
  coords: { x: number; y: number }[];
  line: string;
  area: string;
  cutoffY: number;
  crossing: { x: number; y: number; crossing: RatingCrossing } | null;
}

/**
 * Chart geometry in a `width × height` box with `inset` horizontal padding.
 * The y domain spans the data and the cutoff with 0.1 of headroom.
 */
export function ratingChartGeometry(points: readonly RatingPoint[], options: { width?: number; height?: number; inset?: number; cutoff?: number } = {}): RatingChartGeometry {
  const width = options.width ?? 600;
  const height = options.height ?? 200;
  const inset = options.inset ?? 16;
  const cutoff = options.cutoff ?? 4.5;
  const values = [...points.map(point => point.rating), cutoff];
  const min = Math.min(...values) - 0.1;
  const max = Math.max(...values) + 0.1;
  const y = (rating: number) => Math.round((height - ((rating - min) / (max - min)) * height) * 100) / 100;
  const step = points.length > 1 ? (width - inset * 2) / (points.length - 1) : 0;
  const coords = points.map((point, index) => ({ x: Math.round((inset + index * step) * 100) / 100, y: y(point.rating) }));
  const line = coords.length ? `M${coords.map(point => `${point.x} ${point.y}`).join(" L")}` : "";
  const firstCoord = coords[0];
  const lastCoord = coords[coords.length - 1];
  const area = firstCoord && lastCoord ? `${line} L${lastCoord.x} ${height} L${firstCoord.x} ${height} Z` : "";
  const found = ratingCrossing(points, cutoff);
  const from = found ? coords[found.index - 1] : undefined;
  const to = found ? coords[found.index] : undefined;
  const crossing = found && from && to ? {
    x: Math.round((from.x + (to.x - from.x) * found.t) * 100) / 100,
    y: y(cutoff),
    crossing: found,
  } : null;
  return { coords, line, area, cutoffY: y(cutoff), crossing };
}
