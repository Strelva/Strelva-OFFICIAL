import { z } from "zod";
import { factValueSchemas, type BusinessRecord, type FactKey, type FactValues } from "@/platform/business-record/contracts";
import type { GoogleDay, GoogleTimeOfDay } from "./contracts";
import type { GoogleFailureKind, GoogleListingClient, GoogleLocationRef } from "./client";

/**
 * Found facts from a connected Google listing (GLOSSARY: Found fact). Strelva
 * reads the chosen location's hours, phone, website, description and
 * categories, and keeps each beside the business record with its source. A
 * found fact never joins the record by itself: the owner confirms it, and only
 * then is it written to the record as the owner's own fact. Read only: nothing
 * here writes to Google.
 */

export const FOUND_FACT_SOURCE = "google_listing" as const;
export const GOOGLE_FOUND_FACT_KEYS = ["hours", "phone", "website", "description", "categories"] as const;
export type GoogleFoundFactKey = (typeof GOOGLE_FOUND_FACT_KEYS)[number];

/** The location fields one read asks for. Business Information v1 readMask. */
export const GOOGLE_FOUND_FACT_READ_MASK = ["title", "phoneNumbers", "websiteUri", "profile", "categories", "regularHours"];

const weekly = z.array(factValueSchemas.hours.shape.weekly.element).max(70);
export const foundFactValueSchemas = {
  hours: z.object({ weekly }).strict(),
  phone: factValueSchemas.phone,
  website: z.string().min(8).max(2048).regex(/^https?:\/\/\S+$/),
  description: factValueSchemas.description,
  categories: z.array(z.string().trim().min(1).max(120)).min(1).max(10),
} as const;
export type FoundFactValues = { [K in GoogleFoundFactKey]: z.infer<(typeof foundFactValueSchemas)[K]> };

export interface GoogleFoundFact<K extends GoogleFoundFactKey = GoogleFoundFactKey> {
  key: K;
  value: FoundFactValues[K];
  source: typeof FOUND_FACT_SOURCE;
  /** `{accountId}/locations/{locationId}`: the exact listing it came from. */
  sourceRef: string;
}

/** Where a confirmed found fact lands in the record. Categories have no record fact yet. */
export const RECORD_KEY: Record<GoogleFoundFactKey, FactKey | null> = {
  hours: "hours", phone: "phone", website: "links", description: "description", categories: null,
};

const DAY_INDEX: Record<GoogleDay, number> = { SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6 };
const clock = (value: GoogleTimeOfDay | undefined) => {
  const hours = Math.min(24, Math.max(0, Math.trunc(value?.hours ?? 0))), minutes = Math.min(59, Math.max(0, Math.trunc(value?.minutes ?? 0)));
  return hours === 24 ? "24:00" : `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

/** Google's regular hours as record weekly hours. A period that runs past
 * midnight is split at midnight, so each day opens before it closes. */
export function googleHoursToWeekly(periods: Array<{ openDay?: GoogleDay; openTime?: GoogleTimeOfDay; closeDay?: GoogleDay; closeTime?: GoogleTimeOfDay }>): FactValues["hours"]["weekly"] {
  const result: FactValues["hours"]["weekly"] = [];
  for (const period of periods) {
    if (!period.openDay || !(period.openDay in DAY_INDEX)) continue;
    const day = DAY_INDEX[period.openDay];
    const closeDay = period.closeDay && period.closeDay in DAY_INDEX ? DAY_INDEX[period.closeDay] : day;
    const opens = clock(period.openTime), closes = clock(period.closeTime);
    if (closeDay === day && opens < closes) { result.push({ day, opens, closes }); continue; }
    // Runs past midnight (or "open 24 hours": 00:00 to 00:00 the next day).
    if (opens < "24:00") result.push({ day, opens, closes: "24:00" });
    if (closes > "00:00" && closes !== "24:00") result.push({ day: (day + 1) % 7, opens: "00:00", closes });
  }
  return result.sort((a, b) => a.day - b.day || a.opens.localeCompare(b.opens)).filter((item, index, all) =>
    index === all.findIndex(other => other.day === item.day && other.opens === item.opens && other.closes === item.closes));
}

const locationSchema = z.object({
  title: z.string().optional(),
  phoneNumbers: z.object({ primaryPhone: z.string().optional() }).passthrough().optional(),
  websiteUri: z.string().optional(),
  profile: z.object({ description: z.string().optional() }).passthrough().optional(),
  categories: z.object({
    primaryCategory: z.object({ displayName: z.string().optional() }).passthrough().optional(),
    additionalCategories: z.array(z.object({ displayName: z.string().optional() }).passthrough()).optional(),
  }).passthrough().optional(),
  regularHours: z.object({ periods: z.array(z.object({
    openDay: z.string().optional(), openTime: z.object({ hours: z.number().optional(), minutes: z.number().optional() }).passthrough().optional(),
    closeDay: z.string().optional(), closeTime: z.object({ hours: z.number().optional(), minutes: z.number().optional() }).passthrough().optional(),
  }).passthrough()).max(70).optional() }).passthrough().optional(),
}).passthrough();

/** Every field Google returned that fits the record's own rules. Anything
 * that doesn't fit is left out rather than repaired. */
export function googleLocationToFoundFacts(raw: unknown, location: GoogleLocationRef): GoogleFoundFact[] {
  const parsed = locationSchema.safeParse(raw);
  if (!parsed.success) return [];
  const data = parsed.data, sourceRef = `${location.accountId}/locations/${location.locationId}`;
  const candidates: Array<[GoogleFoundFactKey, unknown]> = [
    ["hours", data.regularHours?.periods?.length ? { weekly: googleHoursToWeekly(data.regularHours.periods as Parameters<typeof googleHoursToWeekly>[0]) } : undefined],
    ["phone", data.phoneNumbers?.primaryPhone?.trim()],
    ["website", data.websiteUri?.trim()],
    ["description", data.profile?.description?.trim()],
    ["categories", [data.categories?.primaryCategory?.displayName, ...(data.categories?.additionalCategories ?? []).map(item => item.displayName)]
      .map(value => value?.trim()).filter((value): value is string => Boolean(value)).slice(0, 10)],
  ];
  const facts: GoogleFoundFact[] = [];
  for (const [key, value] of candidates) {
    if (value === undefined || value === "" || (Array.isArray(value) && !value.length)) continue;
    if (key === "hours" && !(value as { weekly: unknown[] }).weekly.length) continue;
    const checked = foundFactValueSchemas[key].safeParse(value);
    if (checked.success) facts.push({ key, value: checked.data, source: FOUND_FACT_SOURCE, sourceRef } as GoogleFoundFact);
  }
  return facts;
}

export type GoogleFoundFactRead =
  | { status: "found"; facts: GoogleFoundFact[] }
  /** Google's API access isn't approved yet (quota 0, API not enabled). Nothing is wrong on the owner's side. */
  | { status: "access_pending" }
  /** The grant no longer reads this listing. Reconnect Google. */
  | { status: "refused" }
  | { status: "unavailable"; kind: GoogleFailureKind };

/** One read of the chosen location. Read only. */
export async function readGoogleFoundFacts(client: Pick<GoogleListingClient, "getLocation">, location: GoogleLocationRef): Promise<GoogleFoundFactRead> {
  const result = await client.getLocation(location, GOOGLE_FOUND_FACT_READ_MASK);
  if (result.ok) return { status: "found", facts: googleLocationToFoundFacts(result.data, location) };
  if (result.kind === "setup_pending") return { status: "access_pending" };
  if (result.kind === "auth" || result.kind === "not_found") return { status: "refused" };
  return { status: "unavailable", kind: result.kind };
}

export type FoundFactConfirmation =
  | { ok: true; patch: { facts: Partial<Record<FactKey, { value: unknown; verified: true }>> } }
  | { ok: false; reason: "no_record_fact" | "needs_timezone" | "invalid" };

/**
 * The record patch an owner's confirmation writes: the owner's own fact,
 * verified. Hours keep the record's time zone (Google's hours carry none) and
 * the record's date overrides; a website replaces only the website link.
 */
export function confirmationPatch(fact: { key: GoogleFoundFactKey; value: unknown }, record: Pick<BusinessRecord, "facts">): FoundFactConfirmation {
  const target = RECORD_KEY[fact.key];
  if (!target) return { ok: false, reason: "no_record_fact" };
  const value = foundFactValueSchemas[fact.key].safeParse(fact.value);
  if (!value.success) return { ok: false, reason: "invalid" };
  if (fact.key === "hours") {
    const current = factValueSchemas.hours.safeParse(record.facts.hours?.value);
    if (!current.success) return { ok: false, reason: "needs_timezone" };
    const hours = { timezone: current.data.timezone, weekly: (value.data as FoundFactValues["hours"]).weekly, ...(current.data.overrides ? { overrides: current.data.overrides } : {}) };
    return { ok: true, patch: { facts: { hours: { value: factValueSchemas.hours.parse(hours), verified: true } } } };
  }
  if (fact.key === "website") {
    const links = factValueSchemas.links.safeParse(record.facts.links?.value);
    const others = links.success ? links.data.filter(link => link.kind !== "website") : [];
    return { ok: true, patch: { facts: { links: { value: factValueSchemas.links.parse([{ kind: "website", url: value.data as string }, ...others].slice(0, 30)), verified: true } } } };
  }
  return { ok: true, patch: { facts: { [target]: { value: value.data, verified: true } } } };
}
