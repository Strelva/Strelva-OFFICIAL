import * as cheerio from "cheerio";
import { factValueSchemas, LINK_KINDS, weeklyHoursSchema } from "@/platform/business-record/contracts";
import { crawlWebsite, extractBusinessFacts, WebsiteCrawlError } from "@/products/websites/server";
import type { ClientSiteScan, FoundFactInput, FoundFactKey } from "./contracts";

/**
 * Seed a new client's business record from its public website: the same
 * crawler and extraction the website rebuild uses (SSRF-checked, robots
 * respected), kept small because an agency is waiting on the form. Every fact
 * returned is a suggestion; the record stores it as the agency's and
 * unconfirmed until the owner confirms it.
 *
 * `found` is everything the same crawl read, each with the page and the words
 * it came from (GLOSSARY: Found fact). It is used only behind the claim review
 * release, where it is staged for the owner instead of written to the record.
 */

export type SeedFacts = Partial<Record<"phone" | "email" | "address", { value: unknown }>>;
export interface SiteSeed { scan: ClientSiteScan; facts: SeedFacts; found?: FoundFactInput[] }

type Crawl = typeof crawlWebsite;
type Extract = typeof extractBusinessFacts;
export interface SeedDeps { crawl?: Crawl; extract?: Extract }

const SCAN_LIMITS = { maxPages: 3, timeoutMs: 12_000, maxBytes: 1_500_000 } as const;
/** Bounds what one add can stage, so a large site never floods the owner's review. */
export const FOUND_LIMITS = { services: 30, people: 30, links: 12 } as const;

function firstValid<K extends keyof SeedFacts>(key: K, candidates: unknown[]): { value: unknown } | undefined {
  for (const candidate of candidates) {
    const parsed = factValueSchemas[key].safeParse(candidate);
    if (parsed.success) return { value: parsed.data };
  }
  return undefined;
}

type Found = ReturnType<Extract>;
type Crawled = Awaited<ReturnType<Crawl>>;
type LinkKind = (typeof LINK_KINDS)[number];
interface Sourced { text: string; sourceUrl: string; quote: string }

function sourced(found: Found, ids: string[]): Sourced[] {
  const urls = new Map(found.sourcePages.map((page) => [page.sourceId, page.url]));
  const out: Sourced[] = [];
  for (const id of ids) {
    const fact = found.facts[id];
    const source = fact?.sources.find((item) => urls.has(item.sourceId));
    if (!fact || !source) continue;
    out.push({ text: fact.text, sourceUrl: urls.get(source.sourceId)!, quote: (source.quote || fact.text).slice(0, 300) });
  }
  return out;
}

const DAY_CODES: Record<string, number> = { su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6 };
function dayIndex(token: string): number | undefined {
  return DAY_CODES[token.trim().slice(0, 2).toLowerCase()];
}
function clock(raw: string): string | undefined {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i.exec(raw.trim());
  if (!match) return undefined;
  let hour = Number(match[1]);
  const minute = match[2] ?? "00";
  const half = match[3]?.toLowerCase().replace(/\./g, "");
  if (half === "pm" && hour < 12) hour += 12;
  if (half === "am" && hour === 12) hour = 0;
  if (hour > 24 || Number(minute) > 59 || (hour === 24 && minute !== "00")) return undefined;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

/**
 * Weekly hours from the common written forms ("Mo-Fr 09:00-17:00",
 * "Monday - Friday 9am - 5pm"). 0 is Sunday, as in the record. The site never
 * says its time zone, so the found value has none; the owner's confirmation
 * supplies it. Anything not understood is left out rather than guessed.
 */
export function parseFoundHours(lines: string[]): Array<{ day: number; opens: string; closes: string }> {
  const weekly = new Map<string, { day: number; opens: string; closes: string }>();
  const day = "(?:su|mo|tu|we|th|fr|sa)[a-z]*\\.?";
  const time = "\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)?";
  const pattern = new RegExp(`(${day}(?:\\s*(?:-|–|to|,|&|and)\\s*${day})*)\\s*:?\\s*(${time})\\s*(?:-|–|to)\\s*(${time})`, "gi");
  for (const line of lines) {
    for (const match of line.matchAll(pattern)) {
      const opens = clock(match[2]!);
      const closes = clock(match[3]!);
      if (!opens || !closes || opens >= closes) continue;
      const days = new Set<number>();
      for (const part of match[1]!.split(/\s*(?:,|&|\band\b)\s*/i)) {
        const range = part.split(/\s*(?:-|–|\bto\b)\s*/i).map(dayIndex);
        if (!range.length || range.some((value) => value === undefined)) continue;
        const start = range[0]!;
        const end = range[range.length - 1]!;
        for (let index = start, steps = 0; steps < 7; index = (index + 1) % 7, steps += 1) {
          days.add(index);
          if (index === end) break;
        }
      }
      for (const value of days) {
        const entry = { day: value, opens, closes };
        if (weeklyHoursSchema.safeParse(entry).success) weekly.set(`${value}:${opens}:${closes}`, entry);
      }
    }
  }
  return [...weekly.values()].sort((a, b) => a.day - b.day || a.opens.localeCompare(b.opens)).slice(0, 70);
}

const SOCIAL: Array<[RegExp, LinkKind]> = [
  [/(^|\.)instagram\.com$/i, "instagram"], [/(^|\.)facebook\.com$/i, "facebook"], [/(^|\.)linkedin\.com$/i, "linkedin"],
  [/(^|\.)yelp\.com$/i, "yelp"], [/(^|\.)tiktok\.com$/i, "tiktok"], [/(^|\.)(x|twitter)\.com$/i, "x"],
  [/(^|\.)youtube\.com$/i, "youtube"], [/^(maps\.google\.[a-z.]+|maps\.app\.goo\.gl)$/i, "google_maps"],
  [/(^|\.)(calendly\.com|acuityscheduling\.com|vagaro\.com|booksy\.com|opentable\.com|resy\.com)$/i, "booking"],
];

function socialLinks(crawl: Crawled): Array<{ kind: LinkKind; url: string; sourceUrl: string; quote: string }> {
  const seen = new Set<string>();
  const out: Array<{ kind: LinkKind; url: string; sourceUrl: string; quote: string }> = [];
  for (const page of crawl.pages) {
    for (const link of page.links) {
      let url: URL;
      try { url = new URL(link.url); } catch { continue; }
      if (!/^https?:$/.test(url.protocol)) continue;
      const kind = SOCIAL.find(([host]) => host.test(url.hostname))?.[1];
      if (!kind || /\/(sharer|share|intent)\b/i.test(url.pathname)) continue;
      const href = url.toString().slice(0, 2048);
      if (seen.has(href)) continue;
      seen.add(href);
      const quote = (link.text || "").replace(/\s+/g, " ").trim().slice(0, 300);
      out.push({ kind, url: href, sourceUrl: page.url, quote: quote || href.slice(0, 300) });
    }
  }
  return out.slice(0, FOUND_LIMITS.links);
}

function siteDescription(crawl: Crawled): Sourced | undefined {
  for (const page of crawl.pages) {
    const $ = cheerio.load(page.html);
    const text = ($("meta[name='description']").attr("content") || $("meta[property='og:description']").attr("content") || "").replace(/\s+/g, " ").trim();
    if (text.length >= 20) return { text: text.slice(0, 2000), sourceUrl: page.url, quote: text.slice(0, 300) };
  }
  return undefined;
}

/** Everything the crawl read, as Found facts with their source page and words. Never confirmed here. */
export function foundFromCrawl(siteUrl: string, found: Found, crawl: Crawled): FoundFactInput[] {
  const out: FoundFactInput[] = [];
  const add = (key: FoundFactKey, value: unknown, from: Sourced) => {
    out.push({ entity: "fact", key, value, sourceUrl: from.sourceUrl, quote: from.quote });
  };
  const contacts = sourced(found, found.contact);
  const phone = contacts.find((item) => !item.text.includes("@") && factValueSchemas.phone.safeParse(item.text.trim().slice(0, 40)).success);
  if (phone) add("phone", phone.text.trim().slice(0, 40), phone);
  const email = contacts.find((item) => item.text.includes("@") && factValueSchemas.email.safeParse(item.text.trim().toLowerCase()).success);
  if (email) add("email", email.text.trim().toLowerCase(), email);
  const address = sourced(found, found.locations).find((item) => factValueSchemas.address.safeParse({ formatted: item.text.trim().slice(0, 200) }).success);
  if (address) add("address", { formatted: address.text.trim().slice(0, 200) }, address);
  const hours = sourced(found, found.hours);
  const weekly = parseFoundHours(hours.map((item) => item.text));
  if (weekly.length) add("hours", { weekly }, { ...hours[0]!, quote: hours.map((item) => item.quote).join(" · ").slice(0, 300) });
  const description = siteDescription(crawl);
  if (description && factValueSchemas.description.safeParse(description.text).success) add("description", description.text, description);
  const socials = socialLinks(crawl);
  const links = [{ kind: "website" as const, url: siteUrl }, ...socials.map(({ kind, url }) => ({ kind, url }))];
  if (socials.length && factValueSchemas.links.safeParse(links).success) {
    add("links", links, { text: "", sourceUrl: socials[0]!.sourceUrl, quote: socials.map((item) => item.quote).join(" · ").slice(0, 300) });
  }
  const named = (ids: string[], limit: number) => {
    const names = new Set<string>();
    return sourced(found, ids).filter((item) => {
      const name = item.text.trim().slice(0, 160);
      const key = name.toLowerCase();
      if (name.length < 2 || names.has(key)) return false;
      names.add(key);
      return true;
    }).slice(0, limit);
  };
  for (const item of named(found.services, FOUND_LIMITS.services)) out.push({ entity: "service", value: { name: item.text.trim().slice(0, 160) }, sourceUrl: item.sourceUrl, quote: item.quote });
  for (const item of named(found.people, FOUND_LIMITS.people)) out.push({ entity: "person", value: { name: item.text.trim().slice(0, 160) }, sourceUrl: item.sourceUrl, quote: item.quote });
  return out;
}

export async function seedFromSite(url: string, deps: SeedDeps = {}): Promise<SiteSeed> {
  const crawl = deps.crawl ?? crawlWebsite;
  const extract = deps.extract ?? extractBusinessFacts;
  let found: ReturnType<Extract>;
  let crawled: Crawled;
  try {
    crawled = await crawl(url, SCAN_LIMITS);
    found = extract({ url }, crawled);
  } catch (error) {
    const message = error instanceof WebsiteCrawlError ? error.message : "We couldn't read this website. The client was still added; add its details later.";
    return { scan: { status: "unreachable", seeded: [], name: null, message }, facts: {}, found: [] };
  }
  const text = (ids: string[]) => ids.map((id) => found.facts[id]?.text).filter((value): value is string => Boolean(value));
  const contacts = text(found.contact);
  const facts: SeedFacts = {};
  const phone = firstValid("phone", contacts.filter((value) => !value.includes("@")).map((value) => value.trim().slice(0, 40)));
  const email = firstValid("email", contacts.filter((value) => value.includes("@")).map((value) => value.trim().toLowerCase()));
  const address = firstValid("address", text(found.locations).map((value) => ({ formatted: value.trim().slice(0, 200) })));
  if (phone) facts.phone = phone;
  if (email) facts.email = email;
  if (address) facts.address = address;
  const name = found.name ? found.name.trim().slice(0, 120) : null;
  let foundFacts: FoundFactInput[] = [];
  // A found-fact reading problem never costs the agency its add.
  try { foundFacts = foundFromCrawl(url, found, crawled); } catch { foundFacts = []; }
  return { scan: { status: "scanned", seeded: Object.keys(facts), name: name || null, message: null }, facts, found: foundFacts };
}
