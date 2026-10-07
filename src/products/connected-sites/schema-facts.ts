/** Only published fields shared with confirmed facts are comparable. Missing is not wrong. */
import { z } from "zod";
import type { PublicFacts } from "./contracts";

const text = z.string().trim().max(300);
const address = z.object({ streetAddress: text.optional(), addressLocality: text.optional(), addressRegion: text.optional(), postalCode: text.optional(), addressCountry: text.optional() });
const hours = z.object({ dayOfWeek: z.union([text, z.array(text).max(7)]).optional(), opens: text.optional(), closes: text.optional() });
export const platformSchemaReportSchema = z.object({
  present: z.literal(true),
  businesses: z.array(z.object({ name: text.optional(), telephone: text.optional(), address: z.union([text, address]).optional(),
    openingHours: z.union([text, z.array(text).max(14)]).optional(),
    openingHoursSpecification: z.array(hours).max(14).optional(),
  })).max(8),
});
export type PlatformSchemaReport = z.infer<typeof platformSchemaReportSchema>;
export interface SchemaConflict { field: string; published: string; confirmed: string }
const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const phone = (s: string) => { const n = s.replace(/\D/g, ""); return n.length === 11 && n[0] === "1" ? n.slice(1) : n; };
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const dayIndex = (s: string) => DAYS.indexOf(s.split(/[\/#]/).pop()!.slice(0, 3).toLowerCase());
const time = (s: string | undefined) => s && /^([01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(s) ? s.slice(0, 5) : null;

export function comparePlatformSchema(report: PlatformSchemaReport, facts: PublicFacts): SchemaConflict[] {
  const conflicts: SchemaConflict[] = [];
  function compare(field: string, published: string | undefined, confirmed: string | undefined, norm = normalize) {
    if (published?.trim() && confirmed?.trim() && norm(published) !== norm(confirmed)) conflicts.push({ field, published, confirmed });
  }
  for (const biz of report.businesses) {
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
