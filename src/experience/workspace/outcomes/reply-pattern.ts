/** Reply speed for one week: each lead is a pin whose height is minutes to reply. */

export const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export interface ReplyLead {
  id: string;
  /** 0 = Monday … 6 = Sunday. */
  day: number;
  /** Local arrival time as shown, "9:41". */
  time: string;
  /** First name or short label for the person. */
  name: string;
  /** Minutes to the first reply. Null when not answered yet. */
  minutes: number | null;
  receiptHref?: string;
}

export interface ReplyVerdict {
  /** One word or short phrase with a period: "Steady." */
  word: string;
  /** "23 of 23 under 5 min", or null when there are no leads. */
  chip: string | null;
  tone: "good" | "watch" | "needs";
}

const minutesToMs = (time: string) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
};

/** Arrival order: by day, then time of day, then input order. */
export function arrivalOrder(leads: readonly ReplyLead[]): ReplyLead[] {
  return leads.map((lead, index) => ({ lead, index }))
    .sort((a, b) => a.lead.day - b.lead.day || minutesToMs(a.lead.time) - minutesToMs(b.lead.time) || a.index - b.index)
    .map(item => item.lead);
}

/**
 * The verdict word. All answered within the threshold → "Steady."; at least
 * 80% → "Mostly quick."; anything waiting → "N waiting."; else "Slowing."
 * when the median stays within an hour and "Slow." past it.
 */
export function replyVerdict(leads: readonly ReplyLead[], threshold = 5): ReplyVerdict {
  if (!leads.length) return { word: "No leads yet.", chip: null, tone: "good" };
  const quick = leads.filter(lead => lead.minutes !== null && lead.minutes <= threshold).length;
  const waiting = leads.filter(lead => lead.minutes === null).length;
  const chip = `${quick} of ${leads.length} under ${threshold} min`;
  if (waiting) return { word: `${waiting} waiting.`, chip, tone: "needs" };
  if (quick === leads.length) return { word: "Steady.", chip, tone: "good" };
  if (quick / leads.length >= 0.8) return { word: "Mostly quick.", chip, tone: "good" };
  const typical = median(leads.map(lead => lead.minutes as number));
  return typical <= 60 ? { word: "Slowing.", chip, tone: "watch" } : { word: "Slow.", chip, tone: "needs" };
}

/** Median of a list; 0 when empty. */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] ?? 0 : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** "2 min", "1 h 5 min". */
export function formatReplyTime(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) return `${whole} min`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export interface PinLayout {
  lead: ReplyLead;
  /** Arrival order, for the stagger. */
  order: number;
  /** Horizontal position inside its day band, 0–1. */
  x: number;
  /** Stem height as a fraction of the band, 0.15–1. Unanswered leads use 1. */
  height: number;
}

/**
 * Pin positions. Heights scale linearly to the slowest reply (never below the
 * threshold, so a calm week doesn't look alarming), floored so every pin is visible.
 */
export function pinLayout(leads: readonly ReplyLead[], threshold = 5): PinLayout[] {
  const ordered = arrivalOrder(leads);
  const answered = leads.filter(lead => lead.minutes !== null).map(lead => lead.minutes as number);
  const scale = Math.max(threshold, ...answered);
  const perDay = new Map<number, ReplyLead[]>();
  for (const lead of ordered) perDay.set(lead.day, [...(perDay.get(lead.day) ?? []), lead]);
  return ordered.map((lead, order) => {
    const siblings = perDay.get(lead.day) ?? [lead];
    const slot = siblings.indexOf(lead);
    return {
      lead,
      order,
      x: (slot + 1) / (siblings.length + 1),
      height: lead.minutes === null ? 1 : Math.max(0.15, Math.min(1, lead.minutes / scale)),
    };
  });
}
