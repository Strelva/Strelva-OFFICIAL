import { WEEK_DAYS, median } from "./reply-pattern";

/** Locations × days, each tile coloured by that day's reply time. */

export interface HeatmapRow {
  id: string;
  name: string;
  /** Seven entries, Monday first. Minutes to reply that day; null with no leads. */
  days: (number | null)[];
  rating?: number | null;
  booked?: number | null;
  receiptsHref?: string;
}

export interface HeatStep {
  /** Inclusive upper bound in minutes. */
  max: number;
  fill: string;
  ink: string;
  label: string;
}

/** Fast → slow. Contract colours: #3F5E43 #7FA374 #C9D6C3 #F1DCC9 #E3A983 #B4693F. */
export const HEAT_SCALE: readonly HeatStep[] = [
  { max: 5, fill: "#3F5E43", ink: "#F7F4EE", label: "5 min or less" },
  { max: 15, fill: "#7FA374", ink: "#121A16", label: "6–15 min" },
  { max: 30, fill: "#C9D6C3", ink: "#121A16", label: "16–30 min" },
  { max: 60, fill: "#F1DCC9", ink: "#121A16", label: "31–60 min" },
  { max: 150, fill: "#E3A983", ink: "#121A16", label: "1–2.5 h" },
  { max: Number.POSITIVE_INFINITY, fill: "#B4693F", ink: "#F7F4EE", label: "over 2.5 h" },
];

const SLOWEST: HeatStep = HEAT_SCALE[HEAT_SCALE.length - 1] as HeatStep;

/** Tile with no leads that day. */
export const HEAT_EMPTY: HeatStep = { max: Number.NaN, fill: "#ECE8E0", ink: "#6B716C", label: "no leads" };

export function heatStep(minutes: number | null): HeatStep {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return HEAT_EMPTY;
  return HEAT_SCALE.find(step => minutes <= step.max) ?? SLOWEST;
}

/** "22m", "2h", "1h15", "3h10". */
export function formatTileMinutes(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) return `${whole}m`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`;
}

export interface HeatmapVerdict {
  headline: string;
  detail: string;
  /** The slipping row, if any. */
  worst: HeatmapRow | null;
  /** Day index of the worst tile in the worst row. */
  worstDay: number | null;
}

/**
 * A location is slipping when its median reply passes 30 minutes or any day
 * passes an hour. The slipping location with the highest median is named.
 */
export function heatmapVerdict(rows: readonly HeatmapRow[]): HeatmapVerdict {
  const measured = rows.map(row => {
    const values = row.days.filter((value): value is number => value !== null);
    return { row, values, median: median(values), peak: values.length ? Math.max(...values) : 0 };
  }).filter(entry => entry.values.length);
  if (!measured.length) return { headline: "No replies to compare yet.", detail: "Tiles fill in as each location answers leads.", worst: null, worstDay: null };
  const slipping = measured.filter(entry => entry.median > 30 || entry.peak > 60).sort((a, b) => b.median - a.median || b.peak - a.peak);
  const worst = slipping[0];
  if (!worst) {
    const slowest = Math.max(...measured.map(entry => entry.peak));
    const only = measured.length === 1 ? measured[0] : undefined;
    return { headline: only ? `${only.row.name} is answering fast.` : "Every location is answering fast.", detail: `No day took longer than ${formatTileMinutes(slowest)} to reply.`, worst: null, worstDay: null };
  }
  const worstDay = worst.row.days.indexOf(worst.peak);
  const day = WEEK_DAYS[worstDay] ?? "one day";
  const detail = worst.peak > 60
    ? `Its replies drifted past an hour on ${dayName(day)}.`
    : `Its replies are taking about ${formatTileMinutes(worst.median)} on a typical day.`;
  return { headline: `${worst.row.name} is slipping.`, detail, worst: worst.row, worstDay };
}

const DAY_NAMES: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
const dayName = (short: string) => DAY_NAMES[short] ?? short;
