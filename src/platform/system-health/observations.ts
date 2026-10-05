import { CRON_MAX_AGE_SECONDS, type HeartbeatStatus, type KnownCron } from "@/lib/heartbeat";
import type { TenantDomainHealth } from "@/lib/domain-monitor";
import type { ScanSummary } from "@/lib/scan-store";
import type { Connection } from "@/lib/types";
import type { Observation } from "./contracts";

/**
 * Turn records the existing monitors already keep into health observations.
 * Nothing here checks anything new: the domain monitor, the scanner, cron
 * heartbeats and the connection stores stay the only sources of evidence.
 */

const DOMAIN_WINDOW = CRON_MAX_AGE_SECONDS["domain-monitor"];
const SCAN_WINDOW = CRON_MAX_AGE_SECONDS["portfolio-scan"];
/** Provider connections are rechecked on use; a week without a check is stale. */
const CONNECTION_WINDOW = 7 * 24 * 3600;
const EXPIRY_WARN_DAYS = 30;

/** Managed website: is the real front door serving the site, and is the domain about to lapse? */
export function domainObservations(subjectId: string, health: TenantDomainHealth | null, scannedAt: string | null): Observation[] {
  if (!health) {
    return [{ subjectId, signal: "domain.uptime", outcome: "unknown", observedAt: null, maxAgeSeconds: DOMAIN_WINDOW, source: "domain-monitor", message: "The domain monitor has no result for this site." }];
  }
  const checkedAt = health.checks.map(check => check.checkedAt).sort().at(-1) ?? scannedAt;
  const down = health.worst === "down" || health.worst === "parked" || health.worst === "unreachable";
  const host = health.primaryHost ?? "the site";
  const result: Observation[] = [{
    subjectId,
    signal: "domain.uptime",
    outcome: down ? "fail" : health.worst === "unknown" ? "unknown" : "pass",
    ...(down ? { impact: "blocking" as const } : {}),
    observedAt: checkedAt ?? null,
    maxAgeSeconds: DOMAIN_WINDOW,
    source: "domain-monitor",
    message: down ? `${host} is ${health.worst}; visitors are not seeing the site.` : health.worst === "unknown" ? `${host} could not be classified.` : `${host} is serving the site.`,
  }];
  if (health.nearestExpiryDays !== null) {
    const expiring = health.nearestExpiryDays <= EXPIRY_WARN_DAYS;
    result.push({
      subjectId,
      signal: "domain.expiry",
      outcome: health.nearestExpiryDays <= 0 ? "fail" : expiring ? "warn" : "pass",
      ...(health.nearestExpiryDays <= 0 ? { impact: "blocking" as const } : {}),
      observedAt: checkedAt ?? null,
      maxAgeSeconds: DOMAIN_WINDOW,
      source: "domain-monitor",
      message: health.nearestExpiryDays <= 0 ? `${host} registration has expired.` : expiring ? `${host} registration expires in ${health.nearestExpiryDays} days.` : `${host} registration is current.`,
    });
  }
  return result;
}

/** Managed website quality from the one scanner. A low grade degrades; it never blocks. */
export function scanObservation(subjectId: string, summary: Pick<ScanSummary, "scannedAt" | "grade" | "overallScore"> | null): Observation {
  if (!summary) return { subjectId, signal: "site.scan", outcome: "unknown", observedAt: null, maxAgeSeconds: SCAN_WINDOW, source: "scan", message: "The site has not been scanned." };
  const poor = summary.grade === "D" || summary.grade === "F";
  return {
    subjectId,
    signal: "site.scan",
    outcome: poor ? "warn" : "pass",
    observedAt: summary.scannedAt,
    maxAgeSeconds: SCAN_WINDOW,
    source: "scan",
    message: poor ? `The latest scan graded the site ${summary.grade} (${summary.overallScore}/100).` : `The latest scan graded the site ${summary.grade}.`,
  };
}

/**
 * A cron that verifies a System is part of its evidence. A dead cron means
 * nothing is checking, so its silence is `unknown`, not `healthy`.
 */
export function heartbeatObservations(subjectId: string, statuses: readonly HeartbeatStatus[], crons: readonly KnownCron[]): Observation[] {
  return crons.map(cron => {
    const status = statuses.find(item => item.cron === cron);
    const maxAgeSeconds = CRON_MAX_AGE_SECONDS[cron];
    if (!status || !status.lastSeen) return { subjectId, signal: `cron.${cron}`, outcome: "unknown", observedAt: null, maxAgeSeconds, source: "heartbeat", message: `The ${cron} check has not reported.` };
    return {
      subjectId,
      signal: `cron.${cron}`,
      outcome: status.lastOk === false ? "warn" : "pass",
      observedAt: status.lastSeen,
      maxAgeSeconds,
      source: "heartbeat",
      message: status.lastOk === false ? `The last ${cron} run reported errors.` : `The ${cron} check ran.`,
    } satisfies Observation;
  });
}

/** Workspace calendar account (structural; see scheduling calendar contracts). */
export interface CalendarConnectionEvidence {
  provider: string;
  calendarName: string;
  status: "authorized" | "connected" | "revoked" | "error";
  tokenExpiresAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  updatedAt: string;
}

export function calendarConnectionObservation(subjectId: string, connection: CalendarConnectionEvidence | null, now: number = Date.now()): Observation {
  const base = { subjectId, signal: "calendar.connection", maxAgeSeconds: CONNECTION_WINDOW, source: "calendar-connection" as const };
  if (!connection) return { ...base, outcome: "fail", impact: "blocking", observedAt: new Date(now).toISOString(), message: "No calendar is connected, so bookings cannot be confirmed." };
  const observedAt = connection.lastCheckedAt ?? connection.updatedAt;
  const label = `${connection.provider === "google" ? "Google" : "Outlook"} calendar "${connection.calendarName}"`;
  if (connection.status === "revoked") return { ...base, outcome: "fail", impact: "blocking", observedAt, message: `${label} was disconnected. Reconnect it to confirm bookings.` };
  if (connection.status === "error") return { ...base, outcome: "fail", impact: "degrading", observedAt, message: connection.lastError ? `${label} failed: ${connection.lastError}` : `${label} reported an error.` };
  if (connection.status === "authorized") return { ...base, outcome: "warn", observedAt, message: `${label} is authorized but no calendar has been verified yet.` };
  return { ...base, outcome: "pass", observedAt, message: `${label} is connected.` };
}

/** Tenant integration account (Google Business, Search Console, social). */
export function integrationConnectionObservation(subjectId: string, connection: Pick<Connection, "provider" | "status" | "lastSyncedAt"> | null, now: number = Date.now()): Observation {
  // The stored status is current when read; only a passing sync needs its own age.
  const readAt = new Date(now).toISOString();
  const base = { subjectId, signal: "account.connection", maxAgeSeconds: CONNECTION_WINDOW, source: "integration-connection" as const };
  if (!connection) return { ...base, outcome: "unknown", observedAt: null, message: "This account is not connected." };
  const observedAt = connection.lastSyncedAt ?? null;
  if (connection.status === "needs_reauth") return { ...base, outcome: "fail", impact: "blocking", observedAt: readAt, message: `${connection.provider} needs to be reconnected by the owner.` };
  if (connection.status === "disconnected") return { ...base, outcome: "fail", impact: "blocking", observedAt: readAt, message: `${connection.provider} is disconnected.` };
  if (connection.status === "error") return { ...base, outcome: "fail", impact: "degrading", observedAt: readAt, message: `${connection.provider} sync failed; it will retry.` };
  return { ...base, outcome: "pass", observedAt, message: `${connection.provider} last synced.` };
}

/** Inquiry capability (structural; see InquiryCapabilityStatus). */
export interface InquiryCapabilityEvidence {
  status: "draft" | "live_unverified" | "live" | "paused" | "failed";
  updatedAt: string;
}

/** InquiryCapabilityStatus mixes lifecycle and verification; split them here. */
export function inquiryLifecycle(capability: InquiryCapabilityEvidence): "draft" | "live" | "paused" {
  if (capability.status === "paused") return "paused";
  if (capability.status === "draft") return "draft";
  return "live";
}

export function inquiryCapabilityObservation(subjectId: string, capability: InquiryCapabilityEvidence): Observation {
  const base = { subjectId, signal: "inquiry.publication", maxAgeSeconds: CONNECTION_WINDOW, source: "inquiry-capability" as const, observedAt: capability.updatedAt };
  if (capability.status === "failed") return { ...base, outcome: "fail", impact: "blocking", message: "The inquiry form failed to publish." };
  if (capability.status === "live_unverified") return { ...base, outcome: "warn", message: "The inquiry form is live but has not been verified on the site." };
  return { ...base, outcome: "pass", message: "The inquiry form is published." };
}

/** Booking obligations: expired holds and unknown provider writes need a person. */
export interface ScheduleObligationEvidence {
  expiredHolds: readonly unknown[];
  needsRecovery: readonly unknown[];
}

export function scheduleObservation(subjectId: string, obligations: ScheduleObligationEvidence, observedAt: string): Observation {
  const base = { subjectId, signal: "booking.obligations", maxAgeSeconds: CONNECTION_WINDOW, source: "schedule" as const, observedAt };
  if (obligations.needsRecovery.length) return { ...base, outcome: "fail", impact: "degrading", message: `${obligations.needsRecovery.length} calendar write(s) need recovery before anyone retries them.` };
  if (obligations.expiredHolds.length) return { ...base, outcome: "warn", message: `${obligations.expiredHolds.length} hold(s) passed their time before reaching the calendar. Review or cancel them.` };
  return { ...base, outcome: "pass", message: "Every booking reached the calendar." };
}
