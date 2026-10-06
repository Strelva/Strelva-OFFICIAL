import type { FactValues } from "@/platform/business-record/contracts";
import type { GoogleDay, GoogleHours, GoogleInfo, GoogleSpecialPeriod, GoogleTimeOfDay, GoogleTimePeriod } from "./contracts";

/**
 * The listing READS the business record (spec section 2): hours, phone,
 * website and description come from the record, never typed into Google
 * separately. These functions turn the record's facts into Google's shapes
 * and compare what Google holds, so a difference is shown ("Google hours
 * differ from your record") instead of silently overwritten.
 *
 * Weekday numbers follow the record and JavaScript: 0 is Sunday.
 */

const DAYS: GoogleDay[] = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

function time(value: string): GoogleTimeOfDay {
  const [hours, minutes] = value.split(":").map(Number);
  return { hours: hours ?? 0, minutes: minutes ?? 0 };
}

function date(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return { year: year!, month: month!, day: day! };
}

export function hoursToGoogle(hours: FactValues["hours"]): Required<GoogleHours> {
  const periods: GoogleTimePeriod[] = hours.weekly.map((item) => ({
    openDay: DAYS[item.day]!, openTime: time(item.opens), closeDay: DAYS[item.day]!, closeTime: time(item.closes),
  }));
  const specialHourPeriods: GoogleSpecialPeriod[] = (hours.overrides ?? []).map((item) => item.closed
    ? { startDate: date(item.date), endDate: date(item.date), closed: true }
    : { startDate: date(item.date), endDate: date(item.date), openTime: time(item.opens!), closeTime: time(item.closes!) });
  return { regularHours: { periods }, specialHours: { specialHourPeriods } };
}

export interface RecordInfo {
  phone?: FactValues["phone"];
  description?: FactValues["description"];
  links?: FactValues["links"];
}

/** Phone, website and description, with the update mask Google needs. */
export function infoToGoogle(record: RecordInfo): { body: GoogleInfo; updateMask: string[] } {
  const body: GoogleInfo = {};
  const updateMask: string[] = [];
  if (record.phone) { body.phoneNumbers = { primaryPhone: record.phone }; updateMask.push("phoneNumbers"); }
  const website = record.links?.find((link) => link.kind === "website")?.url;
  if (website) { body.websiteUri = website; updateMask.push("websiteUri"); }
  if (record.description) { body.profile = { description: record.description }; updateMask.push("profile"); }
  return { body, updateMask };
}

const minutes = (value: GoogleTimeOfDay | undefined) => (value?.hours ?? 0) * 60 + (value?.minutes ?? 0);
const dateKey = (value: { year: number; month: number; day: number } | undefined) =>
  value ? `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}` : "";

/** A comparable form: Google omits zero minutes and orders periods its own way. */
export function normalizeHours(hours: GoogleHours | undefined): { regular: string[]; special: string[] } {
  const regular = (hours?.regularHours?.periods ?? [])
    .map((p) => `${p.openDay}@${minutes(p.openTime)}-${p.closeDay}@${minutes(p.closeTime)}`).sort();
  const special = (hours?.specialHours?.specialHourPeriods ?? [])
    .map((p) => `${dateKey(p.startDate)}..${dateKey(p.endDate ?? p.startDate)}:${p.closed ? "closed" : `${minutes(p.openTime)}-${minutes(p.closeTime)}`}`).sort();
  return { regular, special };
}

export function hoursMatch(a: GoogleHours | undefined, b: GoogleHours | undefined, fields: Array<"regularHours" | "specialHours"> = ["regularHours", "specialHours"]): boolean {
  const left = normalizeHours(a);
  const right = normalizeHours(b);
  return (!fields.includes("regularHours") || JSON.stringify(left.regular) === JSON.stringify(right.regular))
    && (!fields.includes("specialHours") || JSON.stringify(left.special) === JSON.stringify(right.special));
}

const digits = (value: string | undefined) => (value ?? "").replace(/[^0-9]/g, "").replace(/^1(?=\d{10}$)/, "");
const url = (value: string | undefined) => (value ?? "").trim().replace(/\/+$/, "").toLowerCase();

export function infoMatches(expected: GoogleInfo, actual: GoogleInfo | undefined, mask: string[]): boolean {
  return mask.every((field) => {
    if (field === "phoneNumbers") return digits(expected.phoneNumbers?.primaryPhone) === digits(actual?.phoneNumbers?.primaryPhone);
    if (field === "websiteUri") return url(expected.websiteUri) === url(actual?.websiteUri);
    if (field === "profile") return (expected.profile?.description ?? "").trim() === (actual?.profile?.description ?? "").trim();
    return false;
  });
}

/** Where Google and the record disagree, in the owner's words. */
export function recordDrift(record: { hours?: FactValues["hours"] } & RecordInfo, google: GoogleHours & GoogleInfo): string[] {
  const drift: string[] = [];
  if (record.hours && !hoursMatch(hoursToGoogle(record.hours), google)) drift.push("Google hours differ from your record.");
  const info = infoToGoogle(record);
  for (const field of info.updateMask) {
    if (!infoMatches(info.body, google, [field])) {
      drift.push(field === "phoneNumbers" ? "Google has a different phone number." : field === "websiteUri" ? "Google links to a different website." : "Google's description differs from your record.");
    }
  }
  return drift;
}
