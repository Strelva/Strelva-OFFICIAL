/** Only published fields shared with confirmed facts are comparable. Missing is not wrong. */
import { z } from "zod";
import { load } from "cheerio";
import type { PublicFacts } from "./contracts";

const text = z.string().trim().max(300);
const address = z.object({ streetAddress: text.optional(), addressLocality: text.optional(), addressRegion: text.optional(), postalCode: text.optional(), addressCountry: text.optional() });
const hours = z.object({ dayOfWeek: z.union([text, z.array(text).max(7)]).optional(), opens: text.optional(), closes: text.optional() });
export const platformSchemaReportSchema = z.object({
  present: z.literal(true),
  businesses: z.array(z.object({ id: text.optional(), url: text.optional(), name: text.optional(), telephone: text.optional(), address: z.union([text, address]).optional(),
    openingHours: z.union([text, z.array(text).max(14)]).optional(),
    openingHoursSpecification: z.array(hours).max(14).optional(),
  })).max(8),
});
export type PlatformSchemaReport = z.infer<typeof platformSchemaReportSchema>;

const BUSINESS_TYPE = /(?:LocalBusiness|Organization|Corporation|Business|Store|Service|Restaurant|Establishment|Attorney|Dentist|Physician|Clinic|Salon|Contractor|Plumber|Electrician)$/i;
/** Extract a bounded, public JSON-LD report from HTML fetched from the verified site's stored URL. */
export function platformSchemaFromHtml(html: string): PlatformSchemaReport {
  const $ = load(html);
  const businesses: Array<z.infer<typeof platformSchemaReportSchema>['businesses'][number]> = [];
  const boundedText = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 300) || undefined : undefined;
  const strings = (value: unknown, limit: number) => typeof value === "string" ? boundedText(value) : Array.isArray(value) ? value.slice(0, limit).map(boundedText).filter((item): item is string => !!item) : undefined;
  const walk = (node: unknown, depth: number) => {
    if (!node || depth > 8 || businesses.length >= 8) return;
    if (Array.isArray(node)) { for (const item of node.slice(0, 100)) walk(item, depth + 1); return; }
    if (typeof node !== "object") return;
    const row = node as Record<string, unknown>;
    const types = Array.isArray(row["@type"]) ? row["@type"] : [row["@type"]];
    if (types.some(type => typeof type === "string" && BUSINESS_TYPE.test(type))) {
      const business: Record<string, unknown> = { id: boundedText(row["@id"]), url: boundedText(row.url), name: boundedText(row.name), telephone: boundedText(row.telephone) };
      const addr = row.address;
      if (typeof addr === "string") business.address = boundedText(addr);
      else if (addr && typeof addr === "object" && !Array.isArray(addr)) {
        const a = addr as Record<string, unknown>;
        const country = a.addressCountry && typeof a.addressCountry === "object" ? (a.addressCountry as Record<string, unknown>).name : a.addressCountry;
        business.address = { streetAddress: boundedText(a.streetAddress), addressLocality: boundedText(a.addressLocality), addressRegion: boundedText(a.addressRegion), postalCode: boundedText(a.postalCode), addressCountry: boundedText(country) };
      }
      business.openingHours = strings(row.openingHours, 14);
      let specs = row.openingHoursSpecification;
      if (specs && !Array.isArray(specs)) specs = [specs];
      if (Array.isArray(specs)) business.openingHoursSpecification = specs.slice(0, 14).filter(item => item && typeof item === "object").map(item => {
        const spec = item as Record<string, unknown>;
        return { dayOfWeek: strings(spec.dayOfWeek, 7), opens: boundedText(spec.opens), closes: boundedText(spec.closes) };
      });
      businesses.push(business as typeof businesses[number]);
    }
    walk(row["@graph"], depth + 1);
  };
  $("script[type='application/ld+json']").slice(0, 100).each((_index, el) => {
    const raw = $(el).text();
    if (raw.length > 100_000) return;
    try { walk(JSON.parse(raw), 0); } catch { /* malformed public JSON-LD is ignored */ }
  });
  return platformSchemaReportSchema.parse({ present: true, businesses });
}
export interface SchemaConflict { field: string; published: string; confirmed: string }
const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const phone = (s: string) => { const n = s.replace(/\D/g, ""); return n.length === 11 && n[0] === "1" ? n.slice(1) : n; };
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const dayIndex = (s: string) => DAYS.indexOf(s.split(/[\/#]/).pop()!.slice(0, 3).toLowerCase());
const time = (s: string | undefined) => s && /^([01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(s) ? s.slice(0, 5) : null;

function entityMatchesSite(business: PlatformSchemaReport["businesses"][number], siteUrl: string): boolean {
  for (const candidate of [business.url, business.id]) {
    if (!candidate) continue;
    try {
      const target = new URL(siteUrl), entity = new URL(candidate, target);
      if (entity.origin === target.origin && entity.pathname.replace(/\/$/, "") === target.pathname.replace(/\/$/, "")) return true;
    } catch { /* unsupported entity ids are not a match */ }
  }
  return false;
}

export function comparePlatformSchema(report: PlatformSchemaReport, facts: PublicFacts, siteUrl?: string): SchemaConflict[] {
  const conflicts: SchemaConflict[] = [];
  function compare(field: string, published: string | undefined, confirmed: string | undefined, norm = normalize) {
    if (published?.trim() && confirmed?.trim() && norm(published) !== norm(confirmed)) conflicts.push({ field, published, confirmed });
  }
  let businesses = report.businesses;
  if (siteUrl) {
    const matching = businesses.filter(business => entityMatchesSite(business, siteUrl));
    if (matching.length === 1) businesses = matching;
    else if (matching.length > 1) return [];
    else if (businesses.length !== 1 || businesses[0]!.url || businesses[0]!.id) return [];
  }
  for (const biz of businesses) {
    compare("name", biz.name, facts.name);
    compare("phone", biz.telephone, facts.phone, phone);
    if (typeof biz.address === "string") compare("address", biz.address, facts.address?.formatted);
    else if (biz.address && facts.address) {
      const pairs = [["streetAddress", "street"], ["addressLocality", "locality"], ["addressRegion", "region"], ["postalCode", "postalCode"], ["addressCountry", "country"]] as const;
      for (const [published, confirmed] of pairs) compare(`address.${confirmed}`, biz.address[published], facts.address[confirmed]);
    }
    // Only days explicitly described on the page are compared. A partial schedule
    // does not assert that every other day is closed.
    const published = new Map<string, Set<string>>();
    function add(day: string, opens: string | undefined, closes: string | undefined) {
      const index = dayIndex(day), a = time(opens), b = time(closes);
      if (index < 0 || !a || !b) return;
      const key = DAYS[index]!, ranges = published.get(key) ?? new Set<string>();
      ranges.add(a === "00:00" && b === "00:00" ? "closed" : `${a}-${b}`); published.set(key, ranges);
    }
    for (const row of biz.openingHoursSpecification ?? []) {
      for (const day of typeof row.dayOfWeek === "string" ? [row.dayOfWeek] : row.dayOfWeek ?? []) add(day, row.opens, row.closes);
    }
    for (const row of typeof biz.openingHours === "string" ? [biz.openingHours] : biz.openingHours ?? []) {
      const m = /^(Su|Mo|Tu|We|Th|Fr|Sa)(?:-(Su|Mo|Tu|We|Th|Fr|Sa))?\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/i.exec(row);
      if (!m) continue;
      const short = ["su", "mo", "tu", "we", "th", "fr", "sa"];
      let day = short.indexOf(m[1]!.toLowerCase());
      const end = short.indexOf((m[2] ?? m[1])!.toLowerCase());
      for (let n = 0; n < 7; n++, day = (day + 1) % 7) { add(DAYS[day]!, m[3], m[4]); if (day === end) break; }
    }
    for (const [day, ranges] of published) {
      const confirmed = facts.hours?.filter(row => row.day === day);
      if (!confirmed?.length) continue;
      const expected = [...new Set(confirmed.map(row => row.closed ? "closed" : `${row.opens}-${row.closes}`))].sort().join(", ");
      const actual = [...ranges].sort().join(", ");
      compare(`hours.${day}`, actual, expected, s => s);
    }
  }
  // Stable order and identical duplicates make repeat visits / reordered graphs
  // the same decision revision, without suppressing different disagreements.
  return [...new Map(conflicts.map(c => [JSON.stringify(c), c])).values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

/** Canonical comparison values keep spelling/formatting changes from re-opening the same ask. */
export function schemaConflictSignature(conflicts: SchemaConflict[]): string {
  const rows = conflicts.map(c => JSON.stringify([c.field, (c.field === "phone" ? phone : normalize)(c.published), (c.field === "phone" ? phone : normalize)(c.confirmed)]));
  return JSON.stringify([...new Set(rows)].sort());
}
