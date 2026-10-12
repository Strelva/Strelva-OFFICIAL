import { factValueSchemas } from "@/platform/business-record/contracts";
import { crawlWebsite, extractBusinessFacts, WebsiteCrawlError } from "@/products/websites/server";
import type { ClientSiteScan } from "./contracts";

/**
 * Seed a new client's business record from its public website: the same
 * crawler and extraction the website rebuild uses (SSRF-checked, robots
 * respected), kept small because an agency is waiting on the form. Every fact
 * returned is a suggestion; the record stores it as the agency's and
 * unconfirmed until the owner confirms it.
 */

export type SeedFacts = Partial<Record<"phone" | "email" | "address", { value: unknown }>>;
export interface SiteSeed { scan: ClientSiteScan; facts: SeedFacts }

type Crawl = typeof crawlWebsite;
type Extract = typeof extractBusinessFacts;
export interface SeedDeps { crawl?: Crawl; extract?: Extract }

const SCAN_LIMITS = { maxPages: 3, timeoutMs: 12_000, maxBytes: 1_500_000 } as const;

function firstValid<K extends keyof SeedFacts>(key: K, candidates: unknown[]): { value: unknown } | undefined {
  for (const candidate of candidates) {
    const parsed = factValueSchemas[key].safeParse(candidate);
    if (parsed.success) return { value: parsed.data };
  }
  return undefined;
}

export async function seedFromSite(url: string, deps: SeedDeps = {}): Promise<SiteSeed> {
  const crawl = deps.crawl ?? crawlWebsite;
  const extract = deps.extract ?? extractBusinessFacts;
  let found: ReturnType<Extract>;
  try {
    found = extract({ url }, await crawl(url, SCAN_LIMITS));
  } catch (error) {
    const message = error instanceof WebsiteCrawlError ? error.message : "We couldn't read this website. The client was still added; add its details later.";
    return { scan: { status: "unreachable", seeded: [], name: null, message }, facts: {} };
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
  return { scan: { status: "scanned", seeded: Object.keys(facts), name: name || null, message: null }, facts };
}
