/**
 * Domain monitor — the safety net for the failure mode that took Orange Crate
 * offline on Aug 20: the client's registrar payment failed, the domain lapsed,
 * and GoDaddy served a 200-OK parking stub (114 bytes redirecting to /lander)
 * in place of the site. Two lessons baked in here:
 *
 *   1. HTTP 200 is NOT "up". A parked/for-sale page returns 200. We assert on
 *      CONTENT (parking signatures, a body-size floor), not just the status.
 *   2. Registry expiry alone would NOT have caught it — RDAP still reported the
 *      domain as expiring in 2027 while it sat dead. So uptime and expiry are
 *      two INDEPENDENT checks; each catches failures the other misses.
 *
 * We monitor the client-facing CUSTOM domain (the real front door), not just
 * the *.strelva.com subdomain — that subdomain stayed green through the whole
 * outage because Vercel never went down. Serverless-safe: expiry uses RDAP over
 * HTTP (no shell `whois`, which doesn't exist on Vercel).
 */

import { getAllTenants } from "./tenants";
import { normalizeCustomDomain } from "./domains";
import type { TenantConfig } from "./types";

/** Bodies smaller than this that return 200 are treated as broken (parking
 *  stubs, blank shells). Orange Crate's dead page was 114 bytes. */
const MIN_HEALTHY_BODY_BYTES = 500;

/** How close to expiry before we warn. Thresholds double as alert buckets. */
const EXPIRY_WARN_DAYS = 30;

const FETCH_TIMEOUT_MS = 12_000;

/** Signatures of a parked / for-sale / suspended domain page. */
const PARKING_SIGNATURE =
  /\/lander|window\.location[^;]*lander|domain (is |may be )?for sale|buy this domain|this domain is parked|parked (free|page)|sedoparking|afternic|cashparking|godaddy\.com\/domainsearch|domaincontrol/i;

export type DomainState = "up" | "down" | "parked" | "unreachable" | "unknown";

/** A monitorable hostname belonging to a tenant. */
export type DomainKind = "custom" | "platform";

export interface DomainCheck {
  host: string;
  kind: DomainKind;
  url: string;
  httpStatus: number | null;
  bytes: number | null;
  state: DomainState;
  reason?: string;
  /** Registry expiry (ISO date) from RDAP, or null when unavailable. */
  expiresAt: string | null;
  daysToExpiry: number | null;
  checkedAt: string;
  latencyMs: number | null;
}

export interface TenantDomainHealth {
  tenantId: string;
  siteName: string;
  ownerName: string;
  ownerEmail?: string;
  primaryHost: string | null;
  checks: DomainCheck[];
  /** Worst state across the tenant's CUSTOM domains (falls back to platform). */
  worst: DomainState;
  /** Nearest expiry (days) across all checks, or null. */
  nearestExpiryDays: number | null;
}

const SEVERITY: Record<DomainState, number> = {
  unreachable: 3,
  down: 3,
  parked: 3,
  unknown: 1,
  up: 0,
};

/** True when a state means the site is not serving real content. */
export function isDownState(state: DomainState): boolean {
  return SEVERITY[state] >= 3;
}

function stripWww(host: string): string {
  return host.replace(/^www\./, "");
}

/** Registrable apex for RDAP (best-effort: strips www; leaves the rest intact,
 *  which is correct for the single-label TLDs in this portfolio). */
function apexForRdap(host: string): string {
  return stripWww(host);
}

/**
 * Resolve the hostnames worth monitoring for a tenant:
 *  - CUSTOM: productionDomain, customDomains[], and verified domain claims
 *    (excluding *.strelva.com / *.vercel.app) — the real front door.
 *  - PLATFORM: the *.strelva.com subdomain from siteUrl — catches build/deploy
 *    breakage even when there's no custom domain yet.
 */
export function monitorableHosts(
  tenant: TenantConfig
): Array<{ host: string; kind: DomainKind }> {
  const custom = new Set<string>();

  const add = (raw: string | undefined) => {
    const d = normalizeCustomDomain(raw);
    if (d && !d.endsWith(".strelva.com") && !d.endsWith(".vercel.app")) {
      custom.add(stripWww(d));
    }
  };

  add(tenant.productionDomain);
  for (const d of tenant.customDomains ?? []) add(d);
  for (const claim of tenant.domainClaims ?? []) {
    if (claim.status === "verified" && claim.role !== "admin") add(claim.domain);
  }

  const hosts: Array<{ host: string; kind: DomainKind }> = [];
  for (const host of custom) hosts.push({ host, kind: "custom" });

  // Platform subdomain (from siteUrl) — always worth watching as a backstop.
  let platform: string | null = null;
  try {
    if (tenant.siteUrl) platform = new URL(tenant.siteUrl).hostname.toLowerCase();
  } catch {
    platform = null;
  }
  if (platform && !custom.has(stripWww(platform))) {
    hosts.push({ host: platform, kind: "platform" });
  }

  return hosts;
}

/** Uptime + content check. A 200 with a parking body or a tiny body is DOWN. */
export async function checkSite(
  host: string,
  kind: DomainKind
): Promise<Omit<DomainCheck, "expiresAt" | "daysToExpiry">> {
  const url = `https://${host}/`;
  const checkedAt = new Date().toISOString();
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "StrelvaUptime/1.0 (+https://strelva.com)" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const text = await res.text();
    const bytes = Buffer.byteLength(text);
    const latencyMs = Date.now() - started;

    let state: DomainState = "up";
    let reason: string | undefined;
    if (PARKING_SIGNATURE.test(text)) {
      state = "parked";
      reason = "parking / for-sale page";
    } else if (res.status >= 400) {
      state = "down";
      reason = `HTTP ${res.status}`;
    } else if (bytes < MIN_HEALTHY_BODY_BYTES) {
      state = "down";
      reason = `suspiciously small body (${bytes}B)`;
    }

    return {
      host,
      kind,
      url,
      httpStatus: res.status,
      bytes,
      state,
      reason,
      checkedAt,
      latencyMs,
    };
  } catch (err) {
    return {
      host,
      kind,
      url,
      httpStatus: null,
      bytes: null,
      state: "unreachable",
      reason: err instanceof Error ? err.message : "fetch failed",
      checkedAt,
      latencyMs: Date.now() - started,
    };
  }
}

interface RdapEvent {
  eventAction?: string;
  eventDate?: string;
}
interface RdapResponse {
  events?: RdapEvent[];
}

/** Registry expiry via RDAP (HTTP, serverless-safe). Tries the rdap.org
 *  bootstrap redirector, then a Verisign fallback for .com/.net. Returns null
 *  when no expiry can be resolved (never throws). */
export async function checkExpiry(
  host: string
): Promise<{ expiresAt: string | null; daysToExpiry: number | null }> {
  const apex = apexForRdap(host);
  const endpoints = [`https://rdap.org/domain/${apex}`];
  if (/\.(com|net)$/i.test(apex)) {
    const tld = apex.split(".").pop();
    endpoints.push(`https://rdap.verisign.com/${tld}/v1/domain/${apex}`);
  }

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: { accept: "application/rdap+json" },
        redirect: "follow",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as RdapResponse;
      const event = data.events?.find((e) =>
        /expiration/i.test(e.eventAction ?? "")
      );
      if (event?.eventDate) {
        const expiresAt = event.eventDate.slice(0, 10);
        const ms = new Date(event.eventDate).getTime();
        const daysToExpiry = Number.isNaN(ms)
          ? null
          : Math.floor((ms - Date.now()) / 86_400_000);
        return { expiresAt, daysToExpiry };
      }
    } catch {
      // try the next endpoint
    }
  }
  return { expiresAt: null, daysToExpiry: null };
}

/** Full health for one tenant across all its monitorable hosts. */
export async function checkTenantDomains(
  tenant: TenantConfig
): Promise<TenantDomainHealth> {
  const hosts = monitorableHosts(tenant);
  const checks: DomainCheck[] = await Promise.all(
    hosts.map(async ({ host, kind }) => {
      const [site, expiry] = await Promise.all([
        checkSite(host, kind),
        // Expiry only means something for a real registrable custom domain.
        kind === "custom"
          ? checkExpiry(host)
          : Promise.resolve({ expiresAt: null, daysToExpiry: null }),
      ]);
      return { ...site, ...expiry };
    })
  );

  const customChecks = checks.filter((c) => c.kind === "custom");
  const relevant = customChecks.length ? customChecks : checks;
  const worst = relevant.reduce<DomainState>(
    (acc, c) => (SEVERITY[c.state] > SEVERITY[acc] ? c.state : acc),
    "up"
  );
  const expiryDays = checks
    .map((c) => c.daysToExpiry)
    .filter((d): d is number => d !== null);
  const nearestExpiryDays = expiryDays.length ? Math.min(...expiryDays) : null;

  return {
    tenantId: tenant.id,
    siteName: tenant.siteName,
    ownerName: tenant.ownerName,
    ownerEmail: tenant.ownerEmail,
    primaryHost: (customChecks[0] ?? checks[0])?.host ?? null,
    checks,
    worst,
    nearestExpiryDays,
  };
}

/** Scan every active tenant's domains. Per-tenant failures are isolated. */
export async function scanPortfolioDomains(): Promise<TenantDomainHealth[]> {
  const tenants = (await getAllTenants()).filter((t) => t.active);
  const results = await Promise.all(
    tenants.map((t) =>
      checkTenantDomains(t).catch(
        (): TenantDomainHealth => ({
          tenantId: t.id,
          siteName: t.siteName,
          ownerName: t.ownerName,
          ownerEmail: t.ownerEmail,
          primaryHost: null,
          checks: [],
          worst: "unknown",
          nearestExpiryDays: null,
        })
      )
    )
  );
  // Down first, then soonest-to-expire, so the worst is always on top.
  return results.sort((a, b) => {
    const sev = SEVERITY[b.worst] - SEVERITY[a.worst];
    if (sev !== 0) return sev;
    const ax = a.nearestExpiryDays ?? Infinity;
    const bx = b.nearestExpiryDays ?? Infinity;
    return ax - bx;
  });
}

export interface DomainAlertItem {
  siteName: string;
  host: string;
  problem: string;
}

/** Which expiry threshold a day-count has crossed (also the alert dedup bucket
 *  so a new email fires each time a domain crosses 30 → 14 → 7 → 3 → 1 → gone,
 *  but not once per day in between). */
function expiryBucket(days: number): string | null {
  if (days <= 0) return "expired";
  if (days <= 1) return "1";
  if (days <= 3) return "3";
  if (days <= 7) return "7";
  if (days <= 14) return "14";
  if (days <= EXPIRY_WARN_DAYS) return "30";
  return null;
}

/**
 * Reduce a scan to the actionable alert set plus a stable signature. The cron
 * only emails when the signature changes, so a persistent outage is one email,
 * not one per run.
 */
export function summarizeDomainAlerts(results: TenantDomainHealth[]): {
  down: DomainAlertItem[];
  expiring: DomainAlertItem[];
  signature: string;
} {
  const down: DomainAlertItem[] = [];
  const expiring: DomainAlertItem[] = [];
  const sigParts: string[] = [];

  for (const r of results) {
    if (isDownState(r.worst)) {
      const bad =
        r.checks.find((c) => c.kind === "custom" && isDownState(c.state)) ??
        r.checks.find((c) => isDownState(c.state));
      const host = bad?.host ?? r.primaryHost ?? r.tenantId;
      down.push({
        siteName: r.siteName,
        host,
        problem: `${r.worst.toUpperCase()}${bad?.reason ? ` — ${bad.reason}` : ""}`,
      });
      sigParts.push(`D:${host}:${r.worst}`);
    }

    for (const c of r.checks) {
      if (c.daysToExpiry === null || c.kind !== "custom") continue;
      const bucket = expiryBucket(c.daysToExpiry);
      if (!bucket) continue;
      expiring.push({
        siteName: r.siteName,
        host: c.host,
        problem:
          c.daysToExpiry <= 0
            ? `EXPIRED (${c.expiresAt})`
            : `expires in ${c.daysToExpiry}d (${c.expiresAt})`,
      });
      sigParts.push(`E:${c.host}:${bucket}`);
    }
  }

  return { down, expiring, signature: sigParts.sort().join("|") };
}
