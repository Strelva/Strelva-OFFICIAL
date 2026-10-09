import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { canonicalJson, sha256 } from "@/platform/business-record/tenant-import";
import { WorkspaceAccessError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import {
  connectInputSchema,
  connectionStateSchema,
  createSystemInputSchema,
  issueOutputInputSchema,
  recordRevisionInputSchema,
  systemConnectionSchema,
  systemDetailSchema,
  systemGraphSchema,
  systemLifecycleSchema,
  systemOutputSchema,
  systemRefSchema,
  systemRevisionSchema,
  systemSchema,
  updateSystemInputSchema,
} from "./contracts";
import { SYSTEM_RULE_CODES, SystemRuleError, type SystemRuleCode } from "./invariants";
import type { SystemStore } from "./store";

/** Thin RPC layer over 20261004120000_systems.sql. Every function is a
 * service-role security-definer RPC that rechecks the actor; this file only
 * shapes arguments and maps database errors. */

type DbError = { message?: string; code?: string } | null;
export type SystemsDb = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }>;
};

let override: SystemsDb | null = null;

/** Tests may supply their own client. */
export function setSystemsDb(client: SystemsDb | null): void {
  override = client;
}

export function systemsDb(): SystemsDb {
  if (override) return override;
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("System storage is unavailable.");
  return client as unknown as SystemsDb;
}

const ACCESS_CODES = ["business_record_access_denied", "system_not_found"];
const MESSAGES: Partial<Record<SystemRuleCode, string>> = {
  system_change_conflict: "The System changed since it was read. Reload and try again.",
  system_command_conflict: "This command id was already used for a different change.",
  system_origin_conflict: "That existing thing is already a System.",
  system_identity_immutable: "A System keeps its identity.",
  system_kind_immutable: "A System keeps its kind for life.",
  system_lifecycle_invalid: "That lifecycle change is not allowed.",
  system_revision_required: "A System needs a revision before it can go live.",
  system_output_requires_revision: "Only a System with a revision can issue something.",
  system_output_transition_invalid: "Only an issued output can be accepted.",
  system_connection_self: "A System does not connect to itself.",
  system_connection_cross_business: "Only an explicit share crosses to another business.",
  system_connection_cycle: "That connection would form a loop.",
  system_connection_target_missing: "The target System does not exist.",
  system_input_invalid: "The request is not a valid System change.",
  system_business_stopped: "New work is stopped for this business.",
  system_baseline_moved: "The System's current revision moved since it was read.",
};

export function mapSystemsError(error: DbError, fallback: string): never {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (ACCESS_CODES.some((code) => detail.includes(code))) throw new WorkspaceAccessError();
  if (detail.includes("workspace_exit_future_work_blocked")) {
    throw new SystemRuleError("system_business_stopped", MESSAGES.system_business_stopped as string);
  }
  // Longest first so a code is never shadowed by a prefix of another.
  for (const code of [...SYSTEM_RULE_CODES].sort((a, b) => b.length - a.length)) {
    if (detail.includes(code)) throw new SystemRuleError(code, MESSAGES[code] ?? fallback);
  }
  throw new WorkspaceStoreError(fallback);
}

function actorArgs(actor: WorkspaceActor) {
  return {
    p_user_id: z.string().uuid().parse(actor.userId),
    p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()),
  };
}

const uuid = z.string().uuid();
const changeNumber = z.number().int().positive();
/** Replayed responses carry `replayed: true`; the schemas strip it. */
const digest = (body: unknown) => sha256(canonicalJson(body));
export async function callSystems<T>(
  name: string, args: Record<string, unknown>, schema: z.ZodType<T>, fallback: string, db: SystemsDb = systemsDb(),
): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) mapSystemsError(error, fallback);
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new WorkspaceStoreError(`${fallback} The response was malformed.`);
  return parsed.data;
}

export function createSupabaseSystemStore(db?: SystemsDb): SystemStore {
  const call = <T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>, fallback: string) =>
    callSystems(name, args, schema, fallback, db ?? systemsDb());

  return {
    async readGraph(actor, businessId) {
      return call("read_business_systems", { p_workspace_id: uuid.parse(businessId), ...actorArgs(actor) },
        systemGraphSchema, "The Systems could not be loaded.");
    },
    async readSystem(actor, rawRef) {
      const ref = systemRefSchema.parse(rawRef);
      return call("read_business_system", { p_workspace_id: ref.businessId, ...actorArgs(actor), p_system_id: ref.systemId },
        systemDetailSchema, "The System could not be loaded.");
    },
    async createSystem(actor, businessId, rawInput, commandId) {
      const input = createSystemInputSchema.parse(rawInput);
      return call("create_business_system", {
        p_workspace_id: uuid.parse(businessId), ...actorArgs(actor), p_input: input,
        p_command_id: uuid.parse(commandId), p_command_digest: digest({ kind: "create", input }),
      }, systemSchema, "The System could not be created.");
    },
    async updateSystem(actor, rawRef, expectedChange, rawPatch) {
      const ref = systemRefSchema.parse(rawRef);
      const patch = updateSystemInputSchema.parse(rawPatch);
      return call("update_business_system", {
        p_workspace_id: ref.businessId, ...actorArgs(actor), p_system_id: ref.systemId,
        p_expected_change: changeNumber.parse(expectedChange), p_patch: patch,
      }, systemSchema, "The System could not be saved.");
    },
    async recordRevision(actor, rawRef, expectedChange, rawInput, commandId, options) {
      const ref = systemRefSchema.parse(rawRef);
      const input = recordRevisionInputSchema.parse(rawInput);
      const activate = options?.activate ?? true;
      const expected = activate ? changeNumber.parse(expectedChange) : changeNumber.nullable().parse(expectedChange);
      return call("record_system_revision", {
        p_workspace_id: ref.businessId, ...actorArgs(actor), p_system_id: ref.systemId, p_expected_change: expected,
        p_input: input, p_command_id: uuid.parse(commandId), p_activate: activate,
        p_command_digest: digest({ kind: "revision", ref, expectedChange: expected, input, activate }),
      }, z.object({ system: systemSchema, revision: systemRevisionSchema }), "The revision could not be recorded.");
    },
    async setCurrentRevision(actor, rawRef, revisionId, expectedCurrentRevisionId) {
      const ref = systemRefSchema.parse(rawRef);
      return call("set_system_current_revision", {
        p_workspace_id: ref.businessId, ...actorArgs(actor), p_system_id: ref.systemId,
        p_revision_id: uuid.parse(revisionId), p_expected_current: uuid.nullable().parse(expectedCurrentRevisionId),
      }, systemSchema, "The current revision could not be changed.");
    },
    async transitionLifecycle(actor, rawRef, expectedChange, to) {
      const ref = systemRefSchema.parse(rawRef);
      return call("transition_system_lifecycle", {
        p_workspace_id: ref.businessId, ...actorArgs(actor), p_system_id: ref.systemId,
        p_expected_change: changeNumber.parse(expectedChange), p_to: systemLifecycleSchema.parse(to),
      }, systemSchema, "The System could not change state.");
    },
    async issueOutput(actor, rawRef, rawInput, commandId) {
      const ref = systemRefSchema.parse(rawRef);
      const input = issueOutputInputSchema.parse(rawInput);
      return call("issue_system_output", {
        p_workspace_id: ref.businessId, ...actorArgs(actor), p_system_id: ref.systemId, p_input: input,
        p_command_id: uuid.parse(commandId), p_command_digest: digest({ kind: "output", ref, input }),
      }, systemOutputSchema, "The output could not be issued.");
    },
    async acceptOutput(actor, rawRef, outputId) {
      const ref = systemRefSchema.parse(rawRef);
      return call("accept_system_output", {
        p_workspace_id: ref.businessId, ...actorArgs(actor), p_system_id: ref.systemId, p_output_id: uuid.parse(outputId),
      }, systemOutputSchema, "The output could not be accepted.");
    },
    async connect(actor, rawInput, commandId) {
      const input = connectInputSchema.parse(rawInput);
      return call("connect_system", {
        p_workspace_id: input.source.businessId, ...actorArgs(actor), p_input: input,
        p_command_id: uuid.parse(commandId), p_command_digest: digest({ kind: "connect", input }),
      }, systemConnectionSchema, "The connection could not be saved.");
    },
    async setConnectionState(actor, businessId, connectionId, state) {
      return call("set_system_connection_state", {
        p_workspace_id: uuid.parse(businessId), ...actorArgs(actor), p_connection_id: uuid.parse(connectionId),
        p_state: connectionStateSchema.parse(state),
      }, systemConnectionSchema, "The connection could not be updated.");
    },
  };
}
