/** Public admission presentation: a readable instant with its explicit zone. */
export function formatVisitorTime(iso: string, timeZone = "UTC"): string {
  let zone = timeZone;
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(); }
  catch { zone = "UTC"; }
  return `${new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso))} (${zone})`;
}
