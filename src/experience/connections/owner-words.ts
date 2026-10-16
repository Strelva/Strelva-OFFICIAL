/**
 * Owner words for values that arrive in builder formats: weekly hours as
 * "Mon to Fri 8 to 5, Sat 9 to 1" (the Thanksgiving card's voice), and Google
 * Business Profile fields as "Hours: Mon to Fri 8 to 5, was 9 to 5". Unknown
 * fields are left out, never printed raw. Client-safe, pure.
 */

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const GOOGLE_DAY: Readonly<Record<string, number>> = { SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6 };

/** "08:00" → "8", "08:30" → "8:30", "17:00" → "5", "00:00" → "12". */
export function clockWords(value: string | { hours?: number; minutes?: number } | null | undefined): string {
  let hours: number; let minutes: number;
  if (typeof value === "string") {
    const match = /^(\d{1,2}):(\d{2})/.exec(value);
    if (!match) return value;
    hours = Number(match[1]); minutes = Number(match[2]);
  } else { hours = value?.hours ?? 0; minutes = value?.minutes ?? 0; }
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return minutes ? `${twelve}:${String(minutes).padStart(2, "0")}` : String(twelve);
}

export interface WeeklySpan { day: number; opens: string; closes: string }

/** Groups days with the same hours: "Mon to Fri 8 to 5, Sat 9 to 1". Closed days are left out. */
export function weeklyHoursWords(weekly: readonly WeeklySpan[]): string {
  if (!weekly.length) return "Closed every day";
  // Monday-first order reads the way owners say a week.
  const order = [1, 2, 3, 4, 5, 6, 0];
  const byDay = new Map<number, string[]>();
  for (const span of weekly) byDay.set(span.day, [...(byDay.get(span.day) ?? []), `${clockWords(span.opens)} to ${clockWords(span.closes)}`]);
  const runs: { days: number[]; text: string }[] = [];
  let previous = -1;
  for (const day of order) {
    const text = byDay.get(day)?.join(" and ");
    if (!text) { previous = -1; continue; }
    const last = runs[runs.length - 1];
    if (last && last.text === text && previous !== -1 && order.indexOf(day) === order.indexOf(previous) + 1) last.days.push(day);
    else runs.push({ days: [day], text });
    previous = day;
  }
  return runs.map(run => {
    const first = DAY[run.days[0]!]; const final = DAY[run.days[run.days.length - 1]!];
    const days = run.days.length === 1 ? first : run.days.length === 2 ? `${first} and ${final}` : `${first} to ${final}`;
    return `${days} ${run.text}`;
  }).join(", ");
}

/** Google's regularHours.periods to the same words. */
function googlePeriodsWords(value: unknown): string | null {
  const periods = (value as { periods?: Array<{ openDay?: string; openTime?: { hours?: number; minutes?: number }; closeTime?: { hours?: number; minutes?: number } }> } | null)?.periods;
  if (!Array.isArray(periods)) return null;
  const weekly: WeeklySpan[] = [];
  for (const period of periods) {
    const day = period.openDay ? GOOGLE_DAY[period.openDay] : undefined;
    if (day === undefined) continue;
    const pad = (time?: { hours?: number; minutes?: number }) => `${String(time?.hours ?? 0).padStart(2, "0")}:${String(time?.minutes ?? 0).padStart(2, "0")}`;
    weekly.push({ day, opens: pad(period.openTime), closes: pad(period.closeTime) });
  }
  return weeklyHoursWords(weekly);
}

function text(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

/** Each Google field Strelva may change, named the way the owner sees it on Google. */
const FIELDS: ReadonlyArray<{ key: string; label: string; read: (value: unknown) => string | null }> = [
  { key: "title", label: "Name", read: text },
  { key: "regularHours", label: "Hours", read: googlePeriodsWords },
  { key: "specialHours", label: "Holiday hours", read: value => Array.isArray((value as { specialHourPeriods?: unknown[] } | null)?.specialHourPeriods) ? `${(value as { specialHourPeriods: unknown[] }).specialHourPeriods.length} special days` : null },
  { key: "phoneNumbers", label: "Phone", read: value => text((value as { primaryPhone?: unknown } | null)?.primaryPhone) },
  { key: "websiteUri", label: "Website", read: value => text(value)?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? null },
  { key: "profile", label: "Description", read: value => text((value as { description?: unknown } | null)?.description) },
  { key: "categories", label: "Category", read: value => text((value as { primaryCategory?: { displayName?: unknown } } | null)?.primaryCategory?.displayName) },
  { key: "summary", label: "Post", read: text },
  { key: "reply", label: "Reply", read: text },
];

const quote = (value: string) => value.length > 90 ? `“${value.slice(0, 88).trimEnd()}…”` : value.includes(" ") && value.length > 40 ? `“${value}”` : value;

/**
 * "Hours: Mon to Fri 8 to 5, was 9 to 5". A field only in `before` reads
 * "Reply: removed, was …". Fields Strelva can't name are skipped.
 */
export function googleChangeLines(before: Record<string, unknown> | null | undefined, after: Record<string, unknown> | null | undefined): string[] {
  const lines: string[] = [];
  for (const field of FIELDS) {
    const hadBefore = Boolean(before && field.key in before);
    const hasAfter = Boolean(after && field.key in after);
    if (!hadBefore && !hasAfter) continue;
    const now = hasAfter ? field.read(after![field.key]) : null;
    const was = hadBefore ? field.read(before![field.key]) : null;
    if (now && was && now === was) continue;
    if (now) lines.push(`${field.label}: ${quote(now)}${was ? `, was ${quote(was)}` : ""}`);
    else if (was) lines.push(`${field.label}: removed, was ${quote(was)}`);
  }
  return lines;
}

/** A prepared draft's body is Google's own JSON; this reads it as owner lines. Plain text passes through. */
export function googleDraftLines(body: string): string[] {
  const trimmed = body.trim();
  if (!trimmed.startsWith("{")) return trimmed ? [trimmed] : [];
  try {
    const value = JSON.parse(trimmed) as Record<string, unknown>;
    if (value.regularHours === null && value.specialHours === null) return ["Hours: cleared on Google"];
    const lines = googleChangeLines(null, value);
    return lines.length ? lines : ["A change to your listing"];
  } catch { return [trimmed]; }
}

/** "Review your Google hours" → "New hours for Google". */
export function googleDraftTitle(title: string): string {
  const match = /^Review your Google (hours|info|post)$/i.exec(title.trim());
  if (!match) return title;
  const kind = match[1]!.toLowerCase();
  return kind === "hours" ? "New hours for Google" : kind === "info" ? "New business info for Google" : "A new Google post";
}
