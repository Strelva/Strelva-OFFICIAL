import type { HeartbeatStatus } from "@/lib/heartbeat";
import type { TenantDomainHealth } from "@/lib/domain-monitor";
import type { ScanSummary } from "@/lib/scan-store";
import type { Connection } from "@/lib/types";
import type { ConnectionTarget, System, SystemConnection } from "@/platform/systems/contracts";
import type { Observation, ResourceNode, HealthConnection, SystemHealth, SystemNode, SystemOperation } from "./contracts";
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
  const connections: HealthConnection[] = [];
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

/** Kinds that keep their promise with no running worker. */
const STATIC_SYSTEM_KINDS = new Set(["document", "report", "proposal"]);

function targetId(target: ConnectionTarget): string {
  switch (target.type) {
    case "system": return target.system.systemId;
    case "business_resource": return target.resource;
    case "audience": return target.audience;
    case "account_binding": return target.bindingId;
    case "domain": return target.domain;
    case "api": return target.api;
  }
}

/**
 * Health over the spine's own Systems and Connections (stored, or projected
 * by systemsFromExisting). Lifecycle and Connection kinds pass through
 * unchanged. A disconnected Connection carries nothing, so health does not
 * walk it. Non-System targets become resources; evidence about them uses the
 * same id (a calendar binding id, a domain name).
 */
export function healthGraphFromSystems(input: {
  systems: readonly System[];
  connections: readonly SystemConnection[];
  observations: readonly Observation[];
  operation?: (system: System) => SystemOperation;
}): HealthGraph {
  const systems: SystemNode[] = input.systems.map((system) => ({
    id: system.id, businessId: system.businessId, name: system.name, kind: system.kind, lifecycle: system.lifecycle,
    operation: input.operation?.(system) ?? (STATIC_SYSTEM_KINDS.has(system.kind) ? "static" : "ongoing"),
  }));
  const resources = new Map<string, ResourceNode>();
  const connections: HealthConnection[] = [];
  for (const connection of input.connections) {
    if (connection.state === "disconnected") continue;
    // Appearing with something outside Strelva (a client's own checkout) is
    // a placement Strelva neither runs nor reads; it carries no evidence.
    if (connection.kind === "appear" && connection.target.type !== "system") continue;
    const to = targetId(connection.target);
    if (connection.target.type !== "system" && !resources.has(to)) {
      resources.set(to, { id: to, businessId: connection.businessId, name: connection.purpose ?? to, kind: connection.target.type });
    }
    connections.push({ id: connection.id, from: connection.source.systemId, to, kind: connection.kind });
  }
  return { systems, resources: [...resources.values()], connections, observations: input.observations };
}
