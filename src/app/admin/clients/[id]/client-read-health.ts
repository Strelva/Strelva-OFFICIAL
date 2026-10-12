import { CRON_MAX_AGE_SECONDS } from "@/platform/infra/heartbeat";
import type { ScanSummary } from "@/lib/scan-store";
import type { DomainViewLoad } from "@/platform/operator-queue/domain-view-loader";

/** Keep presentation fallbacks separate from evidence that a read succeeded. */
export function createClientReadHealth() {
  const unavailable = new Set<string>();
  return {
    unavailable(source: string) { unavailable.add(source); },
    hasUnavailable(source: string) { return unavailable.has(source); },
    fallback<T>(source: string, value: T): () => T {
      return () => { unavailable.add(source); return value; };
    },
    detail(): string | null {
      return unavailable.size ? `Unavailable: ${[...unavailable].sort().join(", ")}. Refresh this page to try the reads again.` : null;
    },
  };
}

export function scanEvidenceIssue(scan: ScanSummary | null, now = Date.now()): string | null {
  if (!scan) return "No site scan on record. Run a site scan below to verify health.";
  const scannedAt = Date.parse(scan.scannedAt);
  if (!Number.isFinite(scannedAt) || scannedAt > now) {
    return "Site scan time is unverified. Run a new site scan below.";
  }
  if (now - scannedAt > CRON_MAX_AGE_SECONDS["portfolio-scan"] * 1000) {
    return "Site scan is stale. Run a new site scan below; the recorded grade is historical evidence.";
  }
  return null;
}

export function domainEvidenceIssue(domainView: DomainViewLoad | null, now = Date.now()): string | null {
  // A rejected load is already named in unavailable sources. A successful
  // claims read can still lack current monitor evidence (including a swallowed
  // monitor-store failure), and must not certify uptime or domain expiry.
  if (!domainView) return null;
  if (!domainView.monitorKnown) return "No domain monitor evidence on record. Uptime and expiry are unverified.";
  if (!domainView.rows.length || domainView.rows.some(row => !row.uptime || row.uptime.state === "unknown")) {
    return "Domain checks are unavailable for this site. Uptime is unverified.";
  }
  const checkedAt = Date.parse(domainView.monitorScannedAt ?? "");
  if (!Number.isFinite(checkedAt) || checkedAt > now || now - checkedAt > CRON_MAX_AGE_SECONDS["domain-monitor"] * 1000) {
    return "Domain monitor evidence is stale or unverified. Uptime and expiry need a fresh check.";
  }
  if (domainView.rows.some(row => row.uptime?.state !== "up")) {
    return "A domain check needs attention. Review the domain status below.";
  }
  return null;
}
