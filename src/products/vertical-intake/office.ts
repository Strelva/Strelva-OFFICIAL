/** Pure office helpers: hours now, and the contact checks the connected-site door uses. */

export function validEmail(value: string): boolean {
  return value.length <= 320 && /^(?!\.)(?!.*\.\.)[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(value) && value.charAt(value.indexOf("@") - 1) !== ".";
}

export function validPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return /^\+?[0-9 ().-]{7,24}$/.test(value) && digits.length >= 7 && digits.length <= 15;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const HHMM = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$/;

/** Local weekday (0 = Sunday) and "HH:MM" for an instant in an IANA time zone; null when the zone is unknown. */
export function localParts(iso: Date | string, timeZone: string): { day: number; hhmm: string } | null {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
    const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
    const day = WEEKDAYS[get("weekday")];
    const hour = get("hour").padStart(2, "0");
    if (day === undefined || !/^\d\d$/.test(hour)) return null;
    return { day, hhmm: `${hour === "24" ? "00" : hour}:${get("minute").padStart(2, "0")}` };
  } catch {
    return null;
  }
}

function clock(value: string): string {
  const [h, m] = value.split(":").map(Number) as [number, number];
  const hour = h % 24;
  return `${hour % 12 || 12}:${String(m).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

/** hours is the business-record shape {timezone, weekly:[{day 0-6, opens, closes}]}. Nulls when the shape is invalid. */
export function officeHoursNow(hours: unknown, now: Date): { openNow: boolean | null; todayHours: string | null } {
  const none = { openNow: null, todayHours: null };
  if (!hours || typeof hours !== "object") return none;
  const { timezone, weekly } = hours as { timezone?: unknown; weekly?: unknown };
  if (typeof timezone !== "string" || !Array.isArray(weekly)) return none;
  const local = localParts(now, timezone);
  if (!local) return none;
  const today: Array<{ opens: string; closes: string }> = [];
  for (const entry of weekly) {
    if (!entry || typeof entry !== "object") return none;
    const { day, opens, closes } = entry as { day?: unknown; opens?: unknown; closes?: unknown };
    if (typeof day !== "number" || !Number.isInteger(day) || day < 0 || day > 6) return none;
    if (typeof opens !== "string" || typeof closes !== "string" || !HHMM.test(opens) || !HHMM.test(closes) || opens >= closes) return none;
    if (day === local.day) today.push({ opens, closes });
  }
  if (!today.length) return { openNow: false, todayHours: "Closed today" };
  today.sort((a, b) => a.opens.localeCompare(b.opens));
  return {
    openNow: today.some(range => local.hhmm >= range.opens && local.hhmm < range.closes),
    todayHours: today.map(range => `${clock(range.opens)}–${clock(range.closes)}`).join(", "),
  };
}
