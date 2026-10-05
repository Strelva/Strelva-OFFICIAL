import { uuidFromSeed } from "@/platform/business-record/tenant-import";
import { WorkspaceConflictError } from "@/platform/workspaces/types";
import type {
  SystemOrigin,
  ConnectInput,
  ConnectionKind,
  ConnectionTarget,
  PropagationPolicy,
  System,
  SystemConnection,
  SystemLifecycle,
  SystemOutput,
  SystemRef,
  SystemRevision,
  SystemRevisionRef,
  UpdateSystemInput,
} from "./contracts";

/**
 * Pure System rules. The in-memory store and the SQL functions in
 * 20261004120000_systems.sql enforce the same set; error codes are shared so a
 * caller sees one vocabulary whichever store answers.
 */

export const SYSTEM_RULE_CODES = [
  "system_change_conflict",
  "system_command_conflict",
  "system_origin_conflict",
  "system_identity_immutable",
  "system_lifecycle_invalid",
  "system_revision_required",
  "system_output_requires_revision",
  "system_output_transition_invalid",
  "system_connection_self",
  "system_connection_cross_business",
  "system_connection_cycle",
  "system_connection_target_missing",
  "system_input_invalid",
  "system_business_stopped",
  "system_baseline_moved",
] as const;
export type SystemRuleCode = (typeof SYSTEM_RULE_CODES)[number];

/** A refused change the caller can act on. Missing or foreign Systems are a
 * WorkspaceAccessError instead, so existence never leaks across businesses. */
export class SystemRuleError extends WorkspaceConflictError {
  constructor(readonly code: SystemRuleCode, message: string) {
    super(message);
    this.name = "SystemRuleError";
  }
}

// ---- identity ----

export function systemRef(system: Pick<System, "businessId" | "id">): SystemRef {
  return { businessId: system.businessId, systemId: system.id };
}

/** The id a System adopted from an existing thing always has. The read-only
 * adapter and the stored System therefore agree before and after adoption.
 * Mirrors public.system_origin_id. */
export function systemOriginId(businessId: string, origin: SystemOrigin): string {
  return uuidFromSeed(`system:${businessId}:${origin.kind}:${origin.ref}`);
}

export function sameSystem(a: SystemRef, b: SystemRef): boolean {
  return a.businessId === b.businessId && a.systemId === b.systemId;
}

export function revisionRef(revision: SystemRevision): SystemRevisionRef {
  return { businessId: revision.businessId, systemId: revision.systemId, revisionId: revision.id, number: revision.number };
}

/** Name, purpose and kind may change; nothing else does through an update.
 * Kind is a descriptor: a proposal can become a portal and stay itself. */
export function applySystemUpdate(system: System, patch: UpdateSystemInput, at: string): System {
  return {
    ...system,
    name: patch.name ?? system.name,
    purpose: patch.purpose === undefined ? system.purpose : patch.purpose,
    kind: patch.kind ?? system.kind,
    changeNumber: system.changeNumber + 1,
    updatedAt: at,
  };
}

/** Moves the current pointer to a revision of this System (a new one, a
 * staged one being activated, or an earlier one being restored). Identity,
 * owner and lifecycle are untouched; revisions themselves never change. */
export function applySystemRevision(system: System, revision: SystemRevision, at: string): System {
  if (revision.systemId !== system.id || revision.businessId !== system.businessId) {
    throw new SystemRuleError("system_identity_immutable", "A revision belongs to exactly one System.");
  }
  return { ...system, currentRevision: revisionRef(revision), changeNumber: system.changeNumber + 1, updatedAt: at };
}

/** Compare-and-set on the current revision pointer. Moving to the revision
 * that is already current is a no-op; otherwise the pointer must be where
 * the caller expects, or the call fails with system_baseline_moved. */
export function applyCurrentRevisionSwap(
  system: System, revision: SystemRevision, expectedCurrentRevisionId: string | null, at: string,
): System {
  if (system.currentRevision?.revisionId === revision.id) return system;
  if ((system.currentRevision?.revisionId ?? null) !== expectedCurrentRevisionId) {
    throw new SystemRuleError("system_baseline_moved", "The System's current revision moved since it was read.");
  }
  return applySystemRevision(system, revision, at);
}

// ---- lifecycle ----

/** Legal moves. Draft goes Live once; after that, Pause and resume. A Live
 * System never returns to Draft: issued outputs and live audiences exist, so
 * stopping is a pause, which keeps records and accepted obligations. */
export const SYSTEM_LIFECYCLE_TRANSITIONS: Readonly<Record<SystemLifecycle, readonly SystemLifecycle[]>> = {
  draft: ["live"],
  live: ["paused"],
  paused: ["live"],
};

export function canTransitionLifecycle(from: SystemLifecycle, to: SystemLifecycle): boolean {
  return SYSTEM_LIFECYCLE_TRANSITIONS[from].includes(to);
}

export function applyLifecycleTransition(system: System, to: SystemLifecycle, at: string): System {
  if (!canTransitionLifecycle(system.lifecycle, to)) {
    throw new SystemRuleError("system_lifecycle_invalid", `A ${system.lifecycle} System cannot become ${to}.`);
  }
  if (to === "live" && !system.currentRevision) {
    throw new SystemRuleError("system_revision_required", "A System needs a revision before it can go live.");
  }
  return { ...system, lifecycle: to, changeNumber: system.changeNumber + 1, updatedAt: at };
}

// ---- outputs ----

/** The revision an output is issued against: always the current one, and
 * pinned from then on. */
export function outputRevisionFor(system: System): SystemRevisionRef {
  if (!system.currentRevision) {
    throw new SystemRuleError("system_output_requires_revision", "Only a System with a revision can issue something.");
  }
  return system.currentRevision;
}

/** Accepting keeps exactly what was issued. */
export function acceptOutput(output: SystemOutput, at: string): SystemOutput {
  if (output.status !== "issued") {
    throw new SystemRuleError("system_output_transition_invalid", "Only an issued output can be accepted.");
  }
  return { ...output, status: "accepted", acceptedAt: at };
}

// ---- connections ----

export function defaultPropagation(kind: ConnectionKind): PropagationPolicy {
  switch (kind) {
    case "depend":
    case "read":
      return "pin_on_issue";
    case "share":
    case "appear":
      return "follow_current";
    case "act":
    case "trigger":
      return "manual_review";
  }
}

/** Kinds that may not form a loop between Systems. A depend loop has no
 * source of truth; a trigger loop never stops. Read loops are allowed and
 * handled by staleness. */
export const ACYCLIC_CONNECTION_KINDS: readonly ConnectionKind[] = ["depend", "trigger"];

/** A stable key so one source holds at most one connection per kind and target. */
export function connectionTargetKey(target: ConnectionTarget): string {
  switch (target.type) {
    case "system": return `system:${target.system.businessId}:${target.system.systemId}`;
    case "business_resource": return `business_resource:${target.resource}`;
    case "audience": return `audience:${target.audience}`;
    case "account_binding": return `account_binding:${target.bindingId}`;
    case "domain": return `domain:${target.domain}`;
    case "api": return `api:${target.api}`;
  }
}

/** True when adding from -> to would close a loop among `kind` edges. */
export function wouldCreateCycle(
  connections: readonly Pick<SystemConnection, "source" | "target" | "kind" | "state">[],
  kind: ConnectionKind,
  from: SystemRef,
  to: SystemRef,
): boolean {
  const key = (ref: SystemRef) => `${ref.businessId}:${ref.systemId}`;
  const edges = new Map<string, string[]>();
  for (const connection of connections) {
    if (connection.kind !== kind || connection.target.type !== "system" || connection.state === "disconnected") continue;
    const list = edges.get(key(connection.source)) ?? [];
    list.push(key(connection.target.system));
    edges.set(key(connection.source), list);
  }
  const goal = key(from);
  const seen = new Set<string>();
  const stack = [key(to)];
  while (stack.length > 0) {
    const node = stack.pop() as string;
    if (node === goal) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    stack.push(...(edges.get(node) ?? []));
  }
  return false;
}

/**
 * Checks a new connection against the rules: a source never targets itself, a
 * System target outside the source business is allowed only as an explicit
 * `share` (and the caller must separately hold authority in both businesses),
 * and depend/trigger edges stay acyclic.
 */
export function assertConnectionAllowed(
  input: ConnectInput,
  existing: readonly Pick<SystemConnection, "source" | "target" | "kind" | "state">[],
): void {
  if (input.target.type !== "system") return;
  const target = input.target.system;
  if (sameSystem(input.source, target)) {
    throw new SystemRuleError("system_connection_self", "A System does not connect to itself.");
  }
  if (target.businessId !== input.source.businessId && input.kind !== "share") {
    throw new SystemRuleError("system_connection_cross_business", "Only an explicit share crosses to another business.");
  }
  if (ACYCLIC_CONNECTION_KINDS.includes(input.kind) && wouldCreateCycle(existing, input.kind, input.source, target)) {
    throw new SystemRuleError("system_connection_cycle", `That ${input.kind} connection would form a loop.`);
  }
}

/** Under manual_review, a target change makes the connection stale until a
 * person reviews it. Other policies stay connected. Disconnected stays put. */
export function connectionStateAfterTargetChange(connection: Pick<SystemConnection, "state" | "propagation">): SystemConnection["state"] {
  if (connection.state === "disconnected") return "disconnected";
  return connection.propagation === "manual_review" ? "stale" : connection.state;
}
