/**
 * The visitor's week as data (XA · E4 and E2, October 16, 2026). One source
 * for the booking page's radio week (VisitorSlotWeek) and the owner's
 * read-only "after your yes" week on /api/approve, so both show the same days,
 * the same times and the same closures in place.
 */

export interface VisitorClosure {
  /** YYYY-MM-DD in the business's zone. */
  date: string;
  /** Why, from the hours record ("Thanksgiving"), when the record says. */
  label?: string | null;
}

export interface VisitorWeekDay {
  key: string;
  weekday: string;
  date: string;
  times: { start: string; index: number; label: string }[];
  /** "Closed" or "Closed, Thanksgiving" when the hours record closes this day. */
  closed: string | null;
}

export interface VisitorWeek {
  days: VisitorWeekDay[];
  /** "November 23 to 28". Empty when nothing is open or closed. */
  range: string;
  zone: string;
}

export function safeZone(zone: string): string {
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(); return zone; } catch { return "UTC"; }
}

/** Closed days from the hours record and the booking calendar's own overrides. */
export function visitorClosures(context: unknown): VisitorClosure[] {
  if (!context || typeof context !== "object") return [];
  const c = context as { hours?: { overrides?: unknown } | null; settings?: { bookableOverrides?: unknown } | null };
  const out = new Map<string, VisitorClosure>();
  for (const list of [c.hours?.overrides, c.settings?.bookableOverrides]) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const o = raw as { date?: unknown; closed?: unknown; label?: unknown };
      if (typeof o?.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.date) || o.closed !== true) continue;
      const label = typeof o.label === "string" && o.label.trim() ? o.label.trim().slice(0, 60) : null;
      if (!out.has(o.date) || (label && !out.get(o.date)!.label)) out.set(o.date, { date: o.date, label });
    }
  }
  return [...out.values()];
}

export function closedWords(closure: VisitorClosure | undefined): string | null {
  if (!closure) return null;
  return closure.label ? `Closed, ${closure.label}` : "Closed";
}

/**
 * Days from the first to the last open or closed day (at most two weeks),
 * each with its times. Closures outside that span are left out.
 */
export function visitorWeek(slots: readonly { start: string }[], timeZone: string, closures: readonly VisitorClosure[] = []): VisitorWeek {
  const zone = safeZone(timeZone);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" });
  const date = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", day: "numeric" });
  const month = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long" });
  const time = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" });

  const byDay = new Map<string, VisitorWeekDay["times"]>();
  slots.forEach((slot, index) => {
    const key = day.format(new Date(slot.start));
    byDay.set(key, [...(byDay.get(key) ?? []), { start: slot.start, index, label: time.format(new Date(slot.start)).replace(/\s?[AP]M$/, "") }]);
  });
  const openKeys = [...byDay.keys()].sort();
  if (!openKeys.length) return { days: [], range: "", zone };
  const first = openKeys[0]!, last = openKeys[openKeys.length - 1]!;
  const closedBy = new Map(closures.map(c => [c.date, c]));
  const days: VisitorWeekDay[] = [];
  for (let at = Date.parse(`${first}T12:00:00Z`); at <= Date.parse(`${last}T12:00:00Z`) && days.length < 14; at += 86_400_000) {
    const noon = new Date(at);
    const key = noon.toISOString().slice(0, 10);
    days.push({ key, weekday: weekday.format(noon), date: date.format(noon), times: byDay.get(key) ?? [], closed: byDay.has(key) ? null : closedWords(closedBy.get(key)) });
  }
  return { days, range: rangeLabel(first, last, month), zone };
}

function rangeLabel(first: string, last: string, month: Intl.DateTimeFormat): string {
  const a = new Date(`${first}T12:00:00Z`), b = new Date(`${last}T12:00:00Z`);
  const ma = month.format(a), mb = month.format(b);
  const da = Number(first.slice(8)), db = Number(last.slice(8));
  if (first === last) return `${ma} ${da}`;
  return ma === mb ? `${ma} ${da} to ${db}` : `${ma} ${da} to ${mb} ${db}`;
}
