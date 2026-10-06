import { listTenantDomainClaims } from "@/lib/domains";
import { getDomainHealth } from "@/lib/domain-monitor-store";
import { buildDomainView, type DomainViewRow } from "./domain-view";

export interface DomainViewLoad {
  rows: DomainViewRow[];
  /** False when the monitor snapshot was missing: uptime and expiry then read "unknown". */
  monitorKnown: boolean;
  monitorScannedAt: string | null;
}

/**
 * Load the one domain view for a business: every managed site linked to it
 * (one before conversion), read through the same claim and monitor stores.
 * Callers authorize first; this reads only.
 */
export async function loadDomainView(sites: { tenantId: string; label: string }[]): Promise<DomainViewLoad> {
  const snapshot = await getDomainHealth();
  const inputs = await Promise.all(sites.map(async (site) => ({
    systemLabel: site.label,
    claims: await listTenantDomainClaims(site.tenantId),
    monitor: snapshot?.results.find((result) => result.tenantId === site.tenantId) ?? null,
  })));
  return { rows: buildDomainView(inputs), monitorKnown: Boolean(snapshot), monitorScannedAt: snapshot?.scannedAt ?? null };
}
