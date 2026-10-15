import { localParts } from "./office";

const DAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function list(value: string | undefined): string[] {
  return (value ?? "").split(",").map(item => item.trim()).filter(Boolean);
}

/** days are mon..sun; times are morning (<12:00), afternoon (12:00-16:59) or evening (>=17:00) in local time. An empty list means any. */
export function slotMatchesPreference(startIso: string, timeZone: string, days: string[], times: string[]): boolean {
  const local = localParts(startIso, timeZone);
  if (!local) return false;
  if (days.length && !days.some(day => DAY_INDEX[day] === local.day)) return false;
  if (times.length) {
    const band = local.hhmm < "12:00" ? "morning" : local.hhmm < "17:00" ? "afternoon" : "evening";
    if (!times.includes(band)) return false;
  }
  return true;
}

export function pickVisitSlot(
  slots: Array<{ start: string; end: string }>,
  timeZone: string,
  answers: Record<string, string>,
  triage: "routine" | "urgent",
  now: Date,
): { start: string; end: string } | null {
  const earliest = now.getTime() + 2 * 60 * 60 * 1000;
  const open = slots.filter(slot => new Date(slot.start).getTime() >= earliest);
  if (triage === "urgent") return open[0] ?? null;
  const days = list(answers.preferred_days);
  const times = list(answers.preferred_times);
  return open.find(slot => slotMatchesPreference(slot.start, timeZone, days, times)) ?? null;
}
