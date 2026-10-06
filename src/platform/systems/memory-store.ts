import { randomUUID } from "node:crypto";
import { WorkspaceAccessError, type WorkspaceActor } from "@/platform/workspaces/types";
import { canonicalJson, sha256 } from "@/platform/business-record/tenant-import";
import {
  connectInputSchema,
  createSystemInputSchema,
  issueOutputInputSchema,
  recordRevisionInputSchema,
  systemLifecycleSchema,
  connectionStateSchema,
  updateSystemInputSchema,
  type ConnectInput,
  type ConnectionState,
  type CreateSystemInput,
  type IssueOutputInput,
  type RecordRevisionInput,
  type System,
  type SystemConnection,
  type SystemDetail,
  type SystemGraph,
  type SystemLifecycle,
  type SystemOutput,
  type SystemRef,
  type SystemRevision,
  type UpdateSystemInput,
} from "./contracts";
import {
  acceptOutput,
  applyLifecycleTransition,
  applyCurrentRevisionSwap,
  applySystemRevision,
  applySystemUpdate,
  assertConnectionAllowed,
  connectionStateAfterTargetChange,
  connectionTargetKey,
  defaultPropagation,
  outputRevisionFor,
  systemOriginId,
  SystemRuleError,
} from "./invariants";
import type { SystemStore } from "./store";

export type SystemAccess = "owner" | "admin" | "member" | "agency";

/** What an agency may reach in one business: Systems adopted from this
 * saved work, or from the website tenants that work hosts. */
export interface AgencySystemScope {
  savedWorkIds: readonly string[];
  tenantStableIds?: readonly string[];
}

export interface MemorySystemStoreOptions {
  /** Who may do what in which business. Return null for no access. */
  access: (actor: WorkspaceActor, businessId: string) => SystemAccess | null;
  /** For an `agency` actor: the exact work it was delegated (read) or
   * assigned (read and write). Absent or empty means no access, as in SQL. */
  agencyScope?: (actor: WorkspaceActor, businessId: string, write: boolean) => AgencySystemScope;
  /** Businesses whose exit completed: reads continue, writes stop. */
  stopped?: (businessId: string) => boolean;
  now?: () => string;
}

const WRITERS: readonly SystemAccess[] = ["owner", "admin", "agency"];

/** Same rules as the Supabase store, held in memory. Used by tests and by
 * local fixtures; it is not a cache of the database. */
export function createMemorySystemStore(options: MemorySystemStoreOptions): SystemStore {
  const now = options.now ?? (() => new Date().toISOString());
  const systems = new Map<string, System>();
  const revisions = new Map<string, SystemRevision[]>();
  const outputs = new Map<string, SystemOutput[]>();
  const connections = new Map<string, SystemConnection>();
  const commands = new Map<string, { digest: string; actor: string; result: unknown }>();

  const key = (ref: SystemRef) => `${ref.businessId}:${ref.systemId}`;

  /** Null scope: a direct member, the whole business. */
  type Scope = AgencySystemScope | null;

  function assertAccess(actor: WorkspaceActor, businessId: string, write: boolean): Scope {
    const access = options.access(actor, businessId);
    if (!access || (write && !WRITERS.includes(access))) throw new WorkspaceAccessError();
    if (write && options.stopped?.(businessId)) {
      throw new SystemRuleError("system_business_stopped", "New work is stopped for this business.");
    }
    if (access !== "agency") return null;
    const scope = options.agencyScope?.(actor, businessId, write);
    if (!scope?.savedWorkIds.length) throw new WorkspaceAccessError();
    return scope;
  }

  function inScope(system: Pick<System, "origin">, scope: Scope): boolean {
    if (!scope) return true;
    if (system.origin?.kind === "saved_work") return scope.savedWorkIds.includes(system.origin.ref);
    if (system.origin?.kind === "tenant") return (scope.tenantStableIds ?? []).includes(system.origin.ref);
    return false;
  }

  function connectionInScope(connection: SystemConnection, businessId: string, scope: Scope): boolean {
    if (!scope) return true;
    const sourceOk = connection.businessId !== businessId || inScope(systems.get(key(connection.source)) ?? { origin: null }, scope);
    const target = connection.target.type === "system" ? connection.target.system : null;
    const targetOk = !target || target.businessId !== businessId || inScope(systems.get(key(target)) ?? { origin: null }, scope);
    return sourceOk && targetOk;
  }

  function load(ref: SystemRef, scope: Scope = null): System {
    const system = systems.get(key(ref));
    if (!system || !inScope(system, scope)) throw new WorkspaceAccessError();
    return system;
  }

  function expectChange(system: System, expected: number) {
    if (system.changeNumber !== expected) {
      throw new SystemRuleError("system_change_conflict", "The System changed since it was read. Reload and try again.");
    }
  }

  /** Replays a command, or runs it once and remembers the result. */
  function once<T>(actor: WorkspaceActor, businessId: string, commandId: string, body: unknown, run: () => T): T {
    const id = `${businessId}:${commandId}`;
    const digest = sha256(canonicalJson(body));
    const prior = commands.get(id);
    if (prior) {
      if (prior.digest !== digest || prior.actor !== actor.userId) {
        throw new SystemRuleError("system_command_conflict", "This command id was already used for a different change.");
      }
      return structuredClone(prior.result) as T;
    }
    const result = run();
    commands.set(id, { digest, actor: actor.userId, result: structuredClone(result) });
    return result;
  }

  function markDependentsAfterChange(ref: SystemRef) {
    for (const [id, connection] of connections) {
      if (connection.target.type !== "system" || connection.target.system.systemId !== ref.systemId
        || connection.target.system.businessId !== ref.businessId) continue;
      const state = connectionStateAfterTargetChange(connection);
      if (state !== connection.state) connections.set(id, { ...connection, state, updatedAt: now() });
    }
  }

  return {
    async readGraph(actor, businessId) {
      const scope = assertAccess(actor, businessId, false);
      const graph: SystemGraph = {
        businessId,
        systems: [...systems.values()].filter((system) => system.businessId === businessId && inScope(system, scope))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
        connections: [...connections.values()].filter((connection) => (connection.businessId === businessId
          || (connection.target.type === "system" && connection.target.system.businessId === businessId))
          && connectionInScope(connection, businessId, scope)),
      };
      return structuredClone(graph);
    },

    async readSystem(actor, ref) {
      const scope = assertAccess(actor, ref.businessId, false);
      const detail: SystemDetail = {
        system: load(ref, scope),
        revisions: revisions.get(key(ref)) ?? [],
        outputs: outputs.get(key(ref)) ?? [],
      };
      return structuredClone(detail);
    },

    async createSystem(actor, businessId, rawInput: CreateSystemInput, commandId) {
      const input = createSystemInputSchema.parse(rawInput);
      const scope = assertAccess(actor, businessId, true);
      // An agency creates a System only from its own work.
      if (scope && !inScope({ origin: input.origin ?? null }, scope)) throw new WorkspaceAccessError();
      return once(actor, businessId, commandId, { kind: "create", input }, () => {
        if (input.origin && [...systems.values()].some((system) => system.businessId === businessId
          && system.origin?.kind === input.origin?.kind && system.origin?.ref === input.origin?.ref)) {
          throw new SystemRuleError("system_origin_conflict", "That existing thing is already a System.");
        }
        const at = now();
        const system: System = {
          id: input.origin ? systemOriginId(businessId, input.origin) : randomUUID(), businessId, name: input.name, purpose: input.purpose ?? null, kind: input.kind,
          lifecycle: "draft", currentRevision: null, origin: input.origin ?? null, changeNumber: 1, createdAt: at, updatedAt: at,
        };
        systems.set(key({ businessId, systemId: system.id }), system);
        return structuredClone(system);
      });
    },

    async updateSystem(actor, ref, expectedChange, rawPatch: UpdateSystemInput) {
      const patch = updateSystemInputSchema.parse(rawPatch);
      const system = load(ref, assertAccess(actor, ref.businessId, true));
      expectChange(system, expectedChange);
      const next = applySystemUpdate(system, patch, now());
      systems.set(key(ref), next);
      return structuredClone(next);
    },

    async recordRevision(actor, ref, expectedChange, rawInput: RecordRevisionInput, commandId, options) {
      const input = recordRevisionInputSchema.parse(rawInput);
      const activate = options?.activate ?? true;
      const scope = assertAccess(actor, ref.businessId, true);
      load(ref, scope);
      return once(actor, ref.businessId, commandId, { kind: "revision", ref, expectedChange, input, activate }, () => {
        const system = load(ref, scope);
        if (activate || expectedChange !== null) expectChange(system, expectedChange ?? -1);
        const at = now();
        const existing = revisions.get(key(ref)) ?? [];
        const revision: SystemRevision = {
          id: randomUUID(), businessId: ref.businessId, systemId: ref.systemId,
          number: existing.reduce((max, item) => Math.max(max, item.number), 0) + 1, implementation: input.implementation,
          summary: input.summary ?? null, createdAt: at, createdBy: actor.userId,
        };
        revisions.set(key(ref), [...existing, revision]);
        if (!activate) return structuredClone({ system, revision });
        const next = applySystemRevision(system, revision, at);
        systems.set(key(ref), next);
        markDependentsAfterChange(ref);
        return structuredClone({ system: next, revision });
      });
    },

    async setCurrentRevision(actor, ref, revisionId, expectedCurrentRevisionId) {
      const system = load(ref, assertAccess(actor, ref.businessId, true));
      const revision = (revisions.get(key(ref)) ?? []).find((item) => item.id === revisionId);
      if (!revision) throw new WorkspaceAccessError();
      const next = applyCurrentRevisionSwap(system, revision, expectedCurrentRevisionId, now());
      if (next !== system) {
        systems.set(key(ref), next);
        markDependentsAfterChange(ref);
      }
      return structuredClone(next);
    },

    async transitionLifecycle(actor, ref, expectedChange, rawTo: SystemLifecycle) {
      const to = systemLifecycleSchema.parse(rawTo);
      const system = load(ref, assertAccess(actor, ref.businessId, true));
      expectChange(system, expectedChange);
      const next = applyLifecycleTransition(system, to, now());
      systems.set(key(ref), next);
      return structuredClone(next);
    },

    async issueOutput(actor, ref, rawInput: IssueOutputInput, commandId) {
      const input = issueOutputInputSchema.parse(rawInput);
      const scope = assertAccess(actor, ref.businessId, true);
      load(ref, scope);
      return once(actor, ref.businessId, commandId, { kind: "output", ref, input }, () => {
        const system = load(ref, scope);
        const revision = outputRevisionFor(system);
        const output: SystemOutput = {
          id: randomUUID(), businessId: ref.businessId, systemId: ref.systemId, revision,
          kind: input.kind, title: input.title, status: "issued", snapshotHash: input.snapshotHash, issuedAt: now(), acceptedAt: null,
        };
        outputs.set(key(ref), [...(outputs.get(key(ref)) ?? []), output]);
        return structuredClone(output);
      });
    },

    async acceptOutput(actor, ref, outputId) {
      load(ref, assertAccess(actor, ref.businessId, true));
      const list = outputs.get(key(ref)) ?? [];
      const index = list.findIndex((output) => output.id === outputId);
      if (index < 0) throw new WorkspaceAccessError();
      const accepted = acceptOutput(list[index]!, now());
      list[index] = accepted;
      return structuredClone(accepted);
    },

    async connect(actor, rawInput: ConnectInput, commandId) {
      const input = connectInputSchema.parse(rawInput);
      const businessId = input.source.businessId;
      const scope = assertAccess(actor, businessId, true);
      load(input.source, scope);
      if (input.target.type === "system") {
        const target = input.target.system;
        let targetScope = scope;
        if (target.businessId !== businessId && input.kind === "share") {
          // An explicit share needs authority on both sides.
          targetScope = assertAccess(actor, target.businessId, true);
        }
        // A target outside the actor's scope reads as missing, as in SQL.
        const existingTarget = systems.get(key(target));
        if ((target.businessId === businessId || input.kind === "share") && (!existingTarget || !inScope(existingTarget, targetScope))) {
          throw new SystemRuleError("system_connection_target_missing", "The target System does not exist.");
        }
      }
      return once(actor, businessId, commandId, { kind: "connect", input }, () => {
        assertConnectionAllowed(input, [...connections.values()]);
        const targetKey = connectionTargetKey(input.target);
        const existing = [...connections.values()].find((connection) => connection.source.systemId === input.source.systemId
          && connection.kind === input.kind && connectionTargetKey(connection.target) === targetKey);
        const at = now();
        const connection: SystemConnection = existing
          ? { ...existing, state: "connected", propagation: input.propagation ?? existing.propagation,
            purpose: input.purpose === undefined ? existing.purpose : input.purpose, updatedAt: at }
          : {
            id: randomUUID(), businessId, source: input.source, kind: input.kind, target: input.target, state: "connected",
            propagation: input.propagation ?? defaultPropagation(input.kind), contractVersion: 1,
            purpose: input.purpose ?? null, createdAt: at, updatedAt: at,
          };
        connections.set(connection.id, connection);
        return structuredClone(connection);
      });
    },

    async setConnectionState(actor, businessId, connectionId, rawState: ConnectionState) {
      const state = connectionStateSchema.parse(rawState);
      const scope = assertAccess(actor, businessId, false);
      const found = connections.get(connectionId);
      const connection = found && connectionInScope(found, businessId, scope) ? found : undefined;
      // The source business acts on its connections; the target business of
      // a share may only revoke it.
      const targetBusiness = connection?.target.type === "system" ? connection.target.system.businessId : null;
      if (!connection || (connection.businessId !== businessId
        && !(connection.kind === "share" && targetBusiness === businessId && state === "disconnected"))) {
        throw new WorkspaceAccessError();
      }
      // Turning a connection off needs write access where the actor stands.
      // Anything else needs current write access on the source and, across
      // businesses, the target, so a user removed from either side cannot
      // reconnect.
      const required = state === "disconnected" ? [businessId] : [connection.businessId, targetBusiness];
      for (const id of new Set(required)) {
        if (id && !connectionInScope(connection, id, assertAccess(actor, id, true))) throw new WorkspaceAccessError();
      }
      if (state === "connected" && connection.state === "disconnected") {
        // Reconnecting rechecks loop rules against what exists now.
        assertConnectionAllowed(
          { source: connection.source, kind: connection.kind, target: connection.target },
          [...connections.values()].filter((other) => other.id !== connection.id),
        );
      }
      const next = { ...connection, state, updatedAt: now() };
      connections.set(connectionId, next);
      return structuredClone(next);
    },
  };
}
