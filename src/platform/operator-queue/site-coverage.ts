import type { TenantDomainHealth } from "@/lib/domain-monitor";
import type { HeartbeatStatus } from "@/lib/heartbeat";
import type { ScanSummary } from "@/lib/scan-store";
import type { CustomRepoRevalidationHealth, TenantDeliveryModel } from "@/lib/types";
import { businessHealthGraph, deriveSystemHealth, type HealthReason, type HealthStatus, type Observation } from "@/platform/system-health";

/**
 * Health for every active site, whatever built it.
 *
 * The rebuild-only `website-health` check covered published hosted documents
 * and nothing else, so the nine custom-repo client sites had no health result.
 * This derives one System health per active tenant from evidence the existing
 * monitors already keep (domain monitor, scanner, cron heartbeats), plus the
 * custom repo's revalidation state and, for hosted sites, the published
 * document read-back. A site with no evidence is `unknown`, never green.
 * Nothing here writes outside Strelva.
 */

export interface CoverageTenant {
  id: string;
  stableId?: string;
  siteName?: string;
  deliveryModel?: TenantDeliveryModel;
  customRepo?: { revalidationHealth?: CustomRepoRevalidationHealth };
}

export interface HostedDocumentCheck {
  tenantId: string;
  checkedAt: string;
  status: "healthy" | "unreachable" | "hash_missing" | "hash_mismatch";
}

export interface SiteHealthResult {
  tenantId: string;
  stableId: string | null;
  siteName: string;
  deliveryModel: TenantDeliveryModel;
  status: HealthStatus;
  reasons: HealthReason[];
  lastVerifiedAt: string | null;
  stale: boolean;
  /** Where the domain evidence came from this run. */
  domainEvidence: "domain-monitor" | "probe" | "none";
}

export interface SiteHealthSnapshot {
  checkedAt: string;
  results: SiteHealthResult[];
}

/** Revalidation is a stored mark on the custom repo, current when read. */
const REVALIDATION_WINDOW_SECONDS = 7 * 24 * 3600;
/** The hosted read-back runs daily; two missed days is stale. */
const HOSTED_WINDOW_SECONDS = 50 * 3600;

export function revalidationObservation(subjectId: string, health: CustomRepoRevalidationHealth | undefined, readAt: string): Observation {
  const base = { subjectId, signal: "site.revalidation", maxAgeSeconds: REVALIDATION_WINDOW_SECONDS, source: "custom-repo" as const };
  if (health === "failing") return { ...base, outcome: "fail", impact: "degrading", observedAt: readAt, message: "Content changes are not reaching the client site: revalidation is failing." };
  if (health === "healthy") return { ...base, outcome: "pass", observedAt: readAt, message: "Content changes reach the client site." };
  if (health === "not_configured") return { ...base, outcome: "warn", observedAt: readAt, message: "Revalidation is not configured, so content changes wait for the next build." };
  return { ...base, outcome: "unknown", observedAt: null, message: "Revalidation has never been confirmed for this site." };
}

export function hostedDocumentObservation(subjectId: string, check: HostedDocumentCheck): Observation {
  const base = { subjectId, signal: "site.published_revision", maxAgeSeconds: HOSTED_WINDOW_SECONDS, source: "hosted-document" as const, observedAt: check.checkedAt };
  if (check.status === "healthy") return { ...base, outcome: "pass", message: "The live site serves the published revision." };
  if (check.status === "unreachable") return { ...base, outcome: "fail", impact: "blocking", message: "The hosted site could not be reached." };
  return { ...base, outcome: "fail", impact: "degrading", message: check.status === "hash_missing" ? "The live page does not carry the published revision mark." : "The live page serves a different revision than the one published." };
}

export function siteSubjectId(tenantId: string): string {
  return `site:${tenantId}`;
}

export function deriveSiteCoverage(input: {
  tenants: readonly CoverageTenant[];
  domains: ReadonlyMap<string, { health: TenantDomainHealth; scannedAt: string | null; via: "domain-monitor" | "probe" }>;
  scans: Readonly<Record<string, Pick<ScanSummary, "scannedAt" | "grade" | "overallScore"> | null>>;
  heartbeats: readonly HeartbeatStatus[];
  hosted: readonly HostedDocumentCheck[];
  now: number;
}): SiteHealthResult[] {
  const readAt = new Date(input.now).toISOString();
  return input.tenants.map((tenant) => {
    const id = siteSubjectId(tenant.id);
    const domain = input.domains.get(tenant.id) ?? null;
    const graph = businessHealthGraph({
      businessId: tenant.stableId ?? tenant.id,
      website: { id, name: tenant.siteName || tenant.id, domain: domain?.health ?? null, domainScannedAt: domain?.scannedAt ?? null, scan: input.scans[tenant.id] ?? null },
      heartbeats: input.heartbeats,
    }, input.now);
    const extra: Observation[] = [];
    const deliveryModel = tenant.deliveryModel ?? "custom_repo";
    if (deliveryModel === "custom_repo") extra.push(revalidationObservation(id, tenant.customRepo?.revalidationHealth, readAt));
    const hosted = input.hosted.filter((check) => check.tenantId === tenant.id).sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))[0];
    if (hosted) extra.push(hostedDocumentObservation(id, hosted));
    const health = deriveSystemHealth({ ...graph, observations: [...graph.observations, ...extra] }, input.now).get(id);
    return {
      tenantId: tenant.id,
      stableId: tenant.stableId ?? null,
      siteName: tenant.siteName || tenant.id,
      deliveryModel,
      status: health?.status ?? "unknown",
      reasons: health?.reasons ?? [],
      lastVerifiedAt: health?.lastVerifiedAt ?? null,
      stale: health?.stale ?? true,
      domainEvidence: domain?.via ?? "none",
    };
  });
}

/**
 * Domain evidence for every tenant: the domain monitor's latest snapshot, and
 * a read-only probe (HTTP GET + RDAP) only for tenants the snapshot misses or
 * reports as stale, bounded so one run stays inside the cron budget.
 */
export async function collectDomainEvidence(input: {
  tenantIds: readonly string[];
  snapshot: { scannedAt: string; results: readonly TenantDomainHealth[] } | null;
  probe: (tenantId: string) => Promise<TenantDomainHealth | null>;
  now: number;
  maxAgeSeconds: number;
  probeLimit?: number;
}): Promise<{ domains: Map<string, { health: TenantDomainHealth; scannedAt: string | null; via: "domain-monitor" | "probe" }>; probed: number; probeFailed: number; noHosts: number; deferred: number }> {
  const domains = new Map<string, { health: TenantDomainHealth; scannedAt: string | null; via: "domain-monitor" | "probe" }>();
  const fresh = input.snapshot && input.now - Date.parse(input.snapshot.scannedAt) <= input.maxAgeSeconds * 1000;
  if (input.snapshot && fresh) {
    // A result with no checks proves nothing (the monitor found no host to
    // check), so it is not evidence; that site stays unknown.
    for (const health of input.snapshot.results) if (health.checks.length) domains.set(health.tenantId, { health, scannedAt: input.snapshot.scannedAt, via: "domain-monitor" });
  }
  const missing = input.tenantIds.filter((id) => !domains.has(id));
  const limit = Math.max(0, input.probeLimit ?? 25);
  let probed = 0;
  let probeFailed = 0;
  let noHosts = 0;
  for (const tenantId of missing.slice(0, limit)) {
    try {
      const health = await input.probe(tenantId);
      if (health && !health.checks.length) noHosts++;
      else if (health) {
        domains.set(tenantId, { health, scannedAt: new Date(input.now).toISOString(), via: "probe" });
        probed++;
      } else probeFailed++;
    } catch {
      probeFailed++;
    }
  }
  return { domains, probed, probeFailed, noHosts, deferred: Math.max(0, missing.length - limit) };
}
