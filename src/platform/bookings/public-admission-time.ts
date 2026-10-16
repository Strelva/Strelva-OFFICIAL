/** Public admission presentation: a readable instant with one human-readable zone. */
export function formatVisitorTime(iso: string, timeZone = "UTC"): string {
  let zone = timeZone;
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(); }
  catch { zone = "UTC"; }
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: zone === "UTC" ? "short" : "longGeneric" }).format(new Date(iso));
}

/** Generic names stay readable across daylight-saving changes. */
export function visitorTimeZoneLabel(iso: string, timeZone = "UTC", unavailableZone = "UTC"): string {
  try {
    if (timeZone === "UTC") return "UTC";
    return new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longGeneric" }).formatToParts(new Date(iso)).find(part => part.type === "timeZoneName")!.value;
  } catch { return unavailableZone; }
}

/**
 * A deadline the way every visitor page says it, so they never disagree:
 * "Sunday, Nov 22 at 8:00 PM", or "9:20 AM today" when it falls on the day
 * the page is read. The year appears only when it is not the current one.
 * The week or the booking already names the zone, so it is left out.
 */
export function visitorDeadlineWords(iso: string, timeZone = "UTC", now?: number): string {
  let zone = timeZone;
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(); }
  catch { zone = "UTC"; }
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return "the time in your email";
  const local = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(at);
  const reference = new Date(now ?? Date.now());
  if (now !== undefined && local(at) === local(reference)) return `${time} today`;
  const sameYear = local(at).slice(0, 4) === local(reference).slice(0, 4);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(at);
  return `${day} at ${time}`;
}
