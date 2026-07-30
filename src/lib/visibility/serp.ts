/**
 * Pluggable SERP provider for visibility snapshots.
 *
 * Interface: SerpProvider
 * Implementation: SerperDevClient (requires SERP_API_KEY env var)
 *
 * Cost model (Serper.dev):
 *   - ~$0.001 per search at the Starter tier (varies by plan)
 *   - Default 3 queries/tenant/week = 12 queries/month per tenant
 *   - At $0.001/query: $0.012/tenant/month — well inside the <20%-of-price rule
 *     for a $99/mo client (max SERP cost = $19.80/mo; default is $0.012/mo).
 *   - computeMonthlyCost() in this file lets the cron log the exact estimate.
 *
 * Without SERP_API_KEY:
 *   - SerpProvider returns SerpSkipResult so callers record the honest skip.
 *   - Never fakes positions or claims absence of a competitor.
 */

export interface SerpResult {
  query: string;
  provider: string;
  /** 1-based organic position, null if not found */
  tenantPosition: number | null;
  /** true if tenant appears in Google local pack */
  tenantInLocalPack: boolean;
  competitors: Array<{
    name: string;
    /** 1-based organic position, null if not found */
    position: number | null;
    inLocalPack: boolean;
  }>;
  checkedAt: string;
  /** true when the check was skipped (no API key, quota, or error) */
  skipped: boolean;
  /** Human-readable reason for a skip — never blank when skipped=true */
  skipReason?: string;
}

export interface SerpProvider {
  name: string;
  search(
    query: string,
    tenantName: string,
    tenantDomain: string | undefined,
    competitors: Array<{ name: string; domain?: string }>
  ): Promise<SerpResult>;
}

// ---------- Cost helpers -------------------------------------------------- //

/** Default maximum queries per tenant per week. Keep small — cost must stay <20% of price. */
export const DEFAULT_QUERIES_PER_WEEK = 3;

/**
 * Estimated monthly cost for one tenant given the per-query price.
 * @param queriesPerWeek Default: DEFAULT_QUERIES_PER_WEEK
 * @param costPerQuery USD. Default: $0.001 (Serper.dev Starter)
 */
export function computeMonthlyCost(
  queriesPerWeek = DEFAULT_QUERIES_PER_WEEK,
  costPerQuery = 0.001
): number {
  const queriesPerMonth = queriesPerWeek * 4.33; // avg weeks/month
  return parseFloat((queriesPerMonth * costPerQuery).toFixed(4));
}

// ---------- Serper.dev client --------------------------------------------- //

interface SerperOrganicResult {
  title: string;
  link: string;
  snippet?: string;
  position?: number;
}

interface SerperLocalResult {
  title: string;
  address?: string;
  phone?: string;
}

interface SerperResponse {
  organic?: SerperOrganicResult[];
  localResults?: SerperLocalResult[];
  error?: string;
}

function normaliseName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normaliseDomain(s: string): string {
  return s.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? "";
}

function matchesOrganicResult(
  result: SerperOrganicResult,
  name: string,
  domain?: string
): boolean {
  const title = normaliseName(result.title);
  const link = result.link ? normaliseDomain(result.link) : "";
  const norm = normaliseName(name);
  if (domain && link.includes(normaliseDomain(domain))) return true;
  if (title.includes(norm) || norm.includes(title.slice(0, 8))) return true;
  return false;
}

function matchesLocalResult(result: SerperLocalResult, name: string): boolean {
  return normaliseName(result.title ?? "").includes(normaliseName(name));
}

export class SerperDevClient implements SerpProvider {
  readonly name = "serper.dev";

  constructor(private readonly apiKey: string) {}

  async search(
    query: string,
    tenantName: string,
    tenantDomain: string | undefined,
    competitors: Array<{ name: string; domain?: string }>
  ): Promise<SerpResult> {
    const checkedAt = new Date().toISOString();
    let raw: SerperResponse;
    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, num: 20 }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        return {
          query,
          provider: this.name,
          tenantPosition: null,
          tenantInLocalPack: false,
          competitors: competitors.map((c) => ({ name: c.name, position: null, inLocalPack: false })),
          checkedAt,
          skipped: true,
          skipReason: `Serper API returned ${res.status}`,
        };
      }
      raw = (await res.json()) as SerperResponse;
    } catch (err) {
      return {
        query,
        provider: this.name,
        tenantPosition: null,
        tenantInLocalPack: false,
        competitors: competitors.map((c) => ({ name: c.name, position: null, inLocalPack: false })),
        checkedAt,
        skipped: true,
        skipReason: `Serper fetch error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const organic = raw.organic ?? [];
    const local = raw.localResults ?? [];

    // Find tenant position (1-based)
    let tenantPosition: number | null = null;
    let tenantInLocalPack = false;
    for (let i = 0; i < organic.length; i++) {
      if (matchesOrganicResult(organic[i]!, tenantName, tenantDomain)) {
        tenantPosition = i + 1;
        break;
      }
    }
    for (const lr of local) {
      if (matchesLocalResult(lr, tenantName)) {
        tenantInLocalPack = true;
        break;
      }
    }

    // Find competitor positions
    const competitorResults = competitors.map((c) => {
      let position: number | null = null;
      let inLocalPack = false;
      for (let i = 0; i < organic.length; i++) {
        if (matchesOrganicResult(organic[i]!, c.name, c.domain)) {
          position = i + 1;
          break;
        }
      }
      for (const lr of local) {
        if (matchesLocalResult(lr, c.name)) {
          inLocalPack = true;
          break;
        }
      }
      return { name: c.name, position, inLocalPack };
    });

    return {
      query,
      provider: this.name,
      tenantPosition,
      tenantInLocalPack,
      competitors: competitorResults,
      checkedAt,
      skipped: false,
    };
  }
}

/**
 * Build a SerpProvider from the environment, or return null if no key is configured.
 * Callers must handle null by recording an honest skip.
 */
export function buildSerpProvider(): SerpProvider | null {
  const key = process.env.SERP_API_KEY;
  if (!key) return null;
  return new SerperDevClient(key);
}
