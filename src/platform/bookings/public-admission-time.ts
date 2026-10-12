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
