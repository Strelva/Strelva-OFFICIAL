import { z } from "zod";
import { canonicalJson } from "@/platform/business-record/tenant-import";
import { getSupabase } from "@/platform/infra/db/client";
import {
  WORKSPACE_EXIT_STOPPED_MESSAGE,
  WorkspaceAccessError,
  WorkspaceConflictError,
  WorkspaceStoreError,
  type WorkspaceActor,
} from "@/platform/workspaces/types";
import { activationSchema, type Activation } from "./contracts";
import type { ActivationRepository } from "./repository";

/**
 * Activation step log in Postgres, as `operations/activation` saved work
 * (20261007155000_make_real_activations.sql). Each RPC is service-role,
 * security-definer and rechecks the actor; the database also enforces the
 * step-log rules (compare-and-set, history only grows, completed steps change
 * only through rollback). This file shapes arguments, validates what comes
 * back and maps errors.
 *
 * The repository is bound to one actor: every write records that actor as the
 * history event's author, and the database refuses an event by anyone else.
 */

type DbError = { message?: string; code?: string } | null;
export type ActivationsDb = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }>;
};

function activationsDb(): ActivationsDb {
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Activation storage is unavailable.");
  return client as unknown as ActivationsDb;
}

export function mapActivationError(error: DbError, fallback: string): never {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (detail.includes("native_google_owner_denied") || detail.includes("make_real_activation_access_denied") || detail.includes("make_real_activation_not_found")) {
    throw new WorkspaceAccessError();
  }
  if (detail.includes("make_real_activation_revision_conflict")) {
    throw new WorkspaceConflictError("This activation changed. Reload its latest state.");
  }
  if (detail.includes("make_real_activation_exists")) throw new WorkspaceConflictError("This activation already exists.");
  if (detail.includes("workspace_exit_future_work_blocked")) throw new WorkspaceConflictError(WORKSPACE_EXIT_STOPPED_MESSAGE);
  if (detail.includes("make_real_activation_invalid")) {
    throw new WorkspaceStoreError(`${fallback} The change breaks the activation's step log rules.`);
  }
  throw new WorkspaceStoreError(fallback);
}

const uuid = z.string().uuid();

export function createSupabaseActivationRepository(actor: WorkspaceActor, db?: ActivationsDb): ActivationRepository {
  const actorArgs = () => ({
    p_user_id: uuid.parse(actor.userId),
    p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()),
  });

  async function call(name: string, args: Record<string, unknown>, fallback: string): Promise<unknown> {
    const { data, error } = await (db ?? activationsDb()).rpc(name, args);
    if (error) mapActivationError(error, fallback);
    return data;
  }

  function parseRow(data: unknown, businessId: string, id: string, fallback: string): Activation {
    const parsed = activationSchema.safeParse(data);
    if (!parsed.success || parsed.data.businessId !== businessId || parsed.data.id !== id) {
      throw new WorkspaceStoreError(`${fallback} The response was malformed.`);
    }
    return parsed.data;
  }

  return {
    async get(businessId, id) {
      // A business id that is not a workspace id cannot name a stored activation.
      if (!uuid.safeParse(businessId).success) return null;
      const fallback = "The activation could not be loaded.";
      const data = await call("read_make_real_activation", { p_workspace_id: businessId, ...actorArgs(), p_activation_id: id }, fallback);
      if (data === null || data === undefined) return null;
      return parseRow(data, businessId, id, fallback);
    },
    async create(value) {
      const activation = activationSchema.parse(value);
      const fallback = "The activation could not be saved.";
      const data = await call("create_make_real_activation", {
        p_workspace_id: uuid.parse(activation.businessId), ...actorArgs(), p_activation: activation,
      }, fallback);
      parseRow(data, activation.businessId, activation.id, fallback);
    },
    async saveNativeGoogleRecovery(value,expectedRevision) {
      const activation=activationSchema.parse(value),fallback="The native Google receipt recovery could not be saved.";
      const data=await call("save_native_google_recovered_activation",{
        p_workspace_id:uuid.parse(activation.businessId),...actorArgs(),p_activation_id:activation.id,
        p_expected_revision:z.number().int().nonnegative().parse(expectedRevision),p_activation:activation,
      },fallback);
      const saved=parseRow(data,activation.businessId,activation.id,fallback);
      if(canonicalJson(saved)!==canonicalJson(activation))throw new WorkspaceStoreError(`${fallback} The response was malformed.`);
    },
    async saveNativeGoogleUndo(value,expectedRevision) {
      const activation=activationSchema.parse(value),fallback="The native Google undo could not be saved.";
      const data=await call("save_native_google_undo_activation",{
        p_workspace_id:uuid.parse(activation.businessId),...actorArgs(),p_activation_id:activation.id,
        p_expected_revision:z.number().int().nonnegative().parse(expectedRevision),p_activation:activation,
      },fallback);
      const saved=parseRow(data,activation.businessId,activation.id,fallback);
      if(canonicalJson(saved)!==canonicalJson(activation))throw new WorkspaceStoreError(`${fallback} The response was malformed.`);
    },
    async save(value, expectedRevision) {
      const activation = activationSchema.parse(value);
      const fallback = "The activation could not be saved.";
      const data = await call("save_make_real_activation", {
        p_workspace_id: uuid.parse(activation.businessId), ...actorArgs(), p_activation_id: activation.id,
        p_expected_revision: z.number().int().nonnegative().parse(expectedRevision), p_activation: activation,
      }, fallback);
      const saved = parseRow(data, activation.businessId, activation.id, fallback);
      if (saved.revision !== activation.revision) throw new WorkspaceStoreError(`${fallback} The response was malformed.`);
    },
  };
}
