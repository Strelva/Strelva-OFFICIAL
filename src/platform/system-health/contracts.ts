/**
 * System health: a verified signal kept separate from lifecycle.
 *
 * Lifecycle (Draft / Live / Paused) says what the business intends a System to
 * do. Health says what the evidence shows right now. A Live System can be
 * blocked by a revoked calendar; a Paused System can be perfectly healthy.
 * Neither field is ever derived from the other.
 */

import type { ConnectionKind, ConnectionState, System, SystemLifecycle } from "@/platform/systems/contracts";

/** Whether a System needs a running worker to keep its promise. A static
 * System (report, proposal) stays readable with no worker at all. */
export type SystemOperation = "static" | "ongoing";

/** A System as health sees it: the spine's identity, name, kind and
 * lifecycle, plus whether it needs a running worker. */
export interface SystemNode extends Pick<System, "id" | "businessId" | "name" | "kind" | "lifecycle"> {
  operation: SystemOperation;
}

/** A business resource a System works with: a domain, a calendar account, a
 * Google connection. Resources have evidence but no lifecycle. */
export interface ResourceNode {
  id: string;
  businessId: string;
  name: string;
  kind: string;
}

/** One edge health walks. A spine SystemConnection projects onto it
 * (`healthGraphFromSystems`); `to` is a System id or a resource id. Kinds
 * are the spine's Connection kinds. */
export interface HealthConnection {
  id: string;
  /** The System doing the knowing, using, depending or appearing. */
  from: string;
  /** Another System or a resource. */
  to: string;
  kind: ConnectionKind;
}

export type HealthStatus = "healthy" | "degraded" | "blocked" | "unknown";

export type ObservationOutcome = "pass" | "warn" | "fail" | "unknown";

/** One piece of evidence about a System or resource. Provider acceptance and
 * health observation are separate records; this is only the observation. */
export interface Observation {
  /** The System or resource the evidence is about. */
  subjectId: string;
  /** Stable signal name, e.g. `domain.uptime`, `calendar.connection`. */
  signal: string;
  outcome: ObservationOutcome;
  /** `fail` with `blocking` means the System cannot do its job at all. */
  impact?: "blocking" | "degrading";
  /** When the evidence was observed. Null means never observed. */
  observedAt: string | null;
  /** Evidence older than this is stale and cannot prove health. */
  maxAgeSeconds: number;
  /** Which existing monitor produced it. */
  source: "domain-monitor" | "scan" | "heartbeat" | "calendar-connection" | "integration-connection" | "inquiry-capability" | "schedule";
  message: string;
}

export type HealthReasonCode =
  | "observation_failed"
  | "observation_warning"
  | "observation_unknown"
  | "evidence_stale"
  | "no_evidence"
  | "dependency_blocked"
  | "dependency_degraded"
  | "dependency_unknown"
  | "dependency_not_live"
  | "dependency_missing"
  | "projection_stale";

export interface HealthReason {
  code: HealthReasonCode;
  /** Notices explain without changing health (an intended pause is not a failure). */
  effect: "blocked" | "degraded" | "unknown" | "notice";
  message: string;
  signal?: string;
  source?: Observation["source"];
  observedAt?: string | null;
  /** Set when the reason came through a connection. */
  via?: { connectionId: string; subjectId: string };
}

export interface ConnectionHealth {
  connectionId: string;
  to: string;
  kind: ConnectionKind;
  state: ConnectionState;
  reason?: string;
}

/** What a System can do right now, from lifecycle alone. */
export interface SystemAvailability {
  /** Takes new specified behavior (new bookings, new submissions). */
  acceptsNew: boolean;
  /** Existing records and obligations remain readable and honored. */
  readable: boolean;
  /** Existing obligations (appointments, accepted terms) are still kept. */
  keepsObligations: boolean;
}

export interface SystemHealth {
  systemId: string;
  lifecycle: SystemLifecycle;
  availability: SystemAvailability;
  status: HealthStatus;
  reasons: HealthReason[];
  /** Newest fresh, decided observation (pass/warn/fail). */
  lastVerifiedAt: string | null;
  /** True when any own evidence is past its max age. */
  stale: boolean;
  connections: ConnectionHealth[];
}
