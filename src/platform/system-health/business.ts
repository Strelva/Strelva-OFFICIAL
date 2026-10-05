import type { HeartbeatStatus } from "@/lib/heartbeat";
import type { TenantDomainHealth } from "@/lib/domain-monitor";
import type { ScanSummary } from "@/lib/scan-store";
import type { Connection } from "@/lib/types";
import type { Observation, ResourceNode, SystemConnection, SystemHealth, SystemNode } from "./contracts";
import { deriveSystemHealth, type HealthGraph } from "./derive";
import {
  calendarConnectionObservation,
  domainObservations,
  heartbeatObservations,
  inquiryCapabilityObservation,
  inquiryLifecycle,
  integrationConnectionObservation,
  scanObservation,
  scheduleObservation,
  type CalendarConnectionEvidence,
  type InquiryCapabilityEvidence,
  type ScheduleObligationEvidence,
} from "./observations";

/**
 * Evidence for the things a business already runs today, read from the
 * existing owners. Every field is optional: a missing source becomes
 * `unknown` evidence, never a guess.
 */
export interface BusinessEvidence {
  businessId: string;
  website?: {
    id: string;
    name: string;
    domain: TenantDomainHealth | null;
    domainScannedAt: string | null;
    scan: Pick<ScanSummary, "scannedAt" | "grade" | "overallScore"> | null;
  };
  heartbeats?: readonly HeartbeatStatus[];
  bookings?: Array<{
    id: string;
    name: string;
    /** From the schedule's pause field: present means Paused. */
    paused: boolean;
    provider: "google" | "outlook";
    calendar: CalendarConnectionEvidence | null;
    obligations: ScheduleObligationEvidence;
    /** When the obligations were read. */
    readAt: string;
  }>;
  inquiries?: Array<{ id: string; name: string; capability: InquiryCapabilityEvidence }>;
  accounts?: Array<{ id: string; name: string; connection: Pick<Connection, "provider" | "status" | "lastSyncedAt"> | null }>;
  /** Retained static Systems (report, proposal). They need no worker. */
  documents?: Array<{ id: string; name: string; kind: string; lifecycle: SystemNode["lifecycle"] }>;
}

export function businessHealthGraph(evidence: BusinessEvidence, now: number = Date.now()): HealthGraph {
  const systems: SystemNode[] = [];
  const resources: ResourceNode[] = [];
  const connections: SystemConnection[] = [];
  const observations: Observation[] = [];
  const businessId = evidence.businessId;

  if (evidence.website) {
    const website = evidence.website;
    systems.push({ id: website.id, businessId, name: website.name, kind: "managed_website", lifecycle: "live", operation: "ongoing" });
    observations.push(...domainObservations(website.id, website.domain, website.domainScannedAt));
    observations.push(scanObservation(website.id, website.scan));
    // The monitors themselves: if they stop, nothing is proving the site works.
    observations.push(...heartbeatObservations(website.id, evidence.heartbeats ?? [], ["domain-monitor", "portfolio-scan"]));
  }

  for (const booking of evidence.bookings ?? []) {
    const calendarId = `${booking.id}:calendar`;
    systems.push({ id: booking.id, businessId, name: booking.name, kind: "bookings", lifecycle: booking.paused ? "paused" : "live", operation: "ongoing" });
    resources.push({ id: calendarId, businessId, name: booking.calendar ? booking.calendar.calendarName : `${booking.provider} calendar`, kind: "calendar_account" });
    observations.push(calendarConnectionObservation(calendarId, booking.calendar, now));
    observations.push(scheduleObservation(booking.id, booking.obligations, booking.readAt));
    connections.push({ id: `${booking.id}->calendar`, from: booking.id, to: calendarId, kind: "depend" });
    if (evidence.website) connections.push({ id: `${booking.id}->website`, from: booking.id, to: evidence.website.id, kind: "appear" });
  }

  for (const inquiry of evidence.inquiries ?? []) {
    systems.push({ id: inquiry.id, businessId, name: inquiry.name, kind: "inquiries", lifecycle: inquiryLifecycle(inquiry.capability), operation: "ongoing" });
    observations.push(inquiryCapabilityObservation(inquiry.id, inquiry.capability));
    observations.push(...heartbeatObservations(inquiry.id, evidence.heartbeats ?? [], ["inquiry-follow-ups"]));
    if (evidence.website) connections.push({ id: `${inquiry.id}->website`, from: inquiry.id, to: evidence.website.id, kind: "appear" });
  }

  for (const account of evidence.accounts ?? []) {
    resources.push({ id: account.id, businessId, name: account.name, kind: "connected_account" });
    observations.push(integrationConnectionObservation(account.id, account.connection, now));
    if (evidence.website) connections.push({ id: `website->${account.id}`, from: evidence.website.id, to: account.id, kind: "read" });
  }

  for (const document of evidence.documents ?? []) {
    systems.push({ id: document.id, businessId, name: document.name, kind: document.kind, lifecycle: document.lifecycle, operation: "static" });
  }

  return { systems, resources, connections, observations };
}

export function deriveBusinessHealth(evidence: BusinessEvidence, now: number = Date.now()): Map<string, SystemHealth> {
  return deriveSystemHealth(businessHealthGraph(evidence, now), now);
}
