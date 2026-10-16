/**
 * XA-8 words: who said a fact and when, in the owner's language. Pure, so the
 * record screen, the hours screen and their tests read the same sentence.
 * GLOSSARY: name whoever acted; never show a source code or an id.
 */
import type { BusinessRecordSource } from "@/platform/business-record/contracts";

/** Who said it. The agency's own name is used when the caller knows it. */
export function saidByWho(source: BusinessRecordSource | string | undefined, agencyName?: string | null): string {
  switch (source) {
    case "owner": return "You";
    case "operator": return "Strelva";
    case "agency": return agencyName?.trim() || "Your agency";
    case "tenant_import":
    case "website_rebuild": return "Found on your site";
    case "bookings": return "From your bookings";
    case "inquiries": return "From an inquiry";
    case "agent": return "Strelva";
    case "internal_app": return "From one of your Systems";
    default: return "Not recorded";
  }
}

const DAY_MS = 86_400_000;

/** "Tuesday" inside the last week, "Oct 2" this year, "Oct 2, 2025" before. */
export function saidWhen(updatedAt: string | null | undefined, now: Date = new Date()): string | null {
  if (!updatedAt) return null;
  const at = new Date(updatedAt);
  if (Number.isNaN(at.getTime())) return null;
  const age = now.getTime() - at.getTime();
  if (age >= 0 && age < 60_000 * 2) return "just now";
  const sameDay = at.toDateString() === now.toDateString();
  if (sameDay) return "today";
  if (age >= 0 && age < 6 * DAY_MS) return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(at);
  return new Intl.DateTimeFormat("en-US", at.getFullYear() === now.getFullYear() ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }).format(at);
}

/** "You · Tuesday". Found-on-site facts read as a sentence on their own. */
export function saidBy(source: BusinessRecordSource | string | undefined, updatedAt?: string | null, options: { agencyName?: string | null; now?: Date } = {}): string {
  const who = saidByWho(source, options.agencyName);
  if (who === "Found on your site" || who === "Not recorded") return who;
  const when = saidWhen(updatedAt, options.now);
  return when ? `${who} · ${when}` : who;
}

/** A holiday the owner is likely to close for, offered as a one-tap date (DoorDash Merchant pattern). */
export interface HolidayOption { label: string; date: string }

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The nth weekday of a month (US holidays): weekday 0 = Sunday. */
function nthWeekday(year: number, month: number, weekday: number, nth: number): number {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7;
}

function lastWeekday(year: number, month: number, weekday: number): number {
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  return lastDay.getUTCDate() - ((lastDay.getUTCDay() - weekday + 7) % 7);
}

/** The next few US holidays on or after today, soonest first. */
export function upcomingHolidays(now: Date = new Date(), count = 4): HolidayOption[] {
  const today = iso(now.getFullYear(), now.getMonth(), now.getDate());
  const list: HolidayOption[] = [];
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    list.push(
      { label: "New Year's Day", date: iso(year, 0, 1) },
      { label: "Memorial Day", date: iso(year, 4, lastWeekday(year, 4, 1)) },
      { label: "Independence Day", date: iso(year, 6, 4) },
      { label: "Labor Day", date: iso(year, 8, nthWeekday(year, 8, 1, 1)) },
      { label: "Thanksgiving", date: iso(year, 10, nthWeekday(year, 10, 4, 4)) },
      { label: "Christmas Eve", date: iso(year, 11, 24) },
      { label: "Christmas", date: iso(year, 11, 25) },
      { label: "New Year's Eve", date: iso(year, 11, 31) },
    );
  }
  return list.filter(item => item.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, count);
}

/** "Thursday, November 26" from an ISO date, without time-zone drift. */
export function longDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** "Nov 26" from an ISO date. */
export function shortDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** "8:00" / "17:30" to "8" / "5:30" (am/pm dropped; hours read in context). */
export function clock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (h === undefined || Number.isNaN(h)) return time;
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}` : String(hour);
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Mon–Fri 8–5 · Sat 9–1" from weekly periods: runs of days with the same hours collapse. */
export function weeklySummary(weekly: readonly { day: number; opens: string; closes: string }[]): string {
  if (!weekly.length) return "Closed every day";
  const byDay = new Map<number, string>();
  for (const period of [...weekly].sort((a, b) => a.day - b.day || a.opens.localeCompare(b.opens))) {
    const text = `${clock(period.opens)}–${clock(period.closes)}`;
    byDay.set(period.day, byDay.has(period.day) ? `${byDay.get(period.day)}, ${text}` : text);
  }
  // Monday-first, the way owners say their week.
  const order = [1, 2, 3, 4, 5, 6, 0];
  const runs: { from: number; to: number; text: string }[] = [];
  for (const day of order) {
    const text = byDay.get(day);
    if (!text) continue;
    const last = runs[runs.length - 1];
    if (last && last.text === text && order.indexOf(last.to) === order.indexOf(day) - 1) last.to = day;
    else runs.push({ from: day, to: day, text });
  }
  return runs.map(run => `${run.from === run.to ? SHORT_DAYS[run.from] : `${SHORT_DAYS[run.from]}–${SHORT_DAYS[run.to]}`} ${run.text}`).join(" · ");
}

/** The usual week as owners read it, one run per line: ["Mon–Fri 8–5", "Sat 9–1", "Sun closed"]. */
export function weeklyLines(weekly: readonly { day: number; opens: string; closes: string }[]): string[] {
  const summary = weekly.length ? weeklySummary(weekly).split(" · ") : [];
  const open = new Set(weekly.map(period => period.day));
  const closed = [1, 2, 3, 4, 5, 6, 0].filter(day => !open.has(day));
  if (!closed.length) return summary;
  const names = closed.map(day => SHORT_DAYS[day]);
  return [...summary, `${closed.length === 7 ? "Every day" : names.join(", ")} closed`];
}

/** The next special day on or after today, said plainly ("Dec 24 · 8–12", "Nov 26 · closed"). */
export function nextSpecialDay(overrides: readonly { date: string; closed: boolean; opens?: string; closes?: string; label?: string }[] | undefined, now: Date = new Date()): string | null {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const next = [...(overrides ?? [])].filter(item => item.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return null;
  return `${shortDate(next.date)} · ${next.closed ? "closed" : `${clock(next.opens ?? "")}–${clock(next.closes ?? "")}`}`;
}

/**
 * The Google approval said in one line where the save happens. Saving with a
 * connected listing approves applying hours, holiday hours, phone, website
 * and description there (`recordGoogleApprovalCopy` holds the full terms).
 */
export const GOOGLE_APPROVAL_LINE = "Saving also puts it on your Google listing; Google may review it first.";
