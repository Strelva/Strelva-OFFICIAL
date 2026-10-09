import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import {
  WORKSPACE_EXIT_STOPPED_MESSAGE,
  WorkspaceAccessError,
  WorkspaceConflictError,
  WorkspaceStoreError,
  type WorkspaceActor,
} from "@/platform/workspaces/types";
import { possibilitySchema, type Possibility } from "./contracts";
import type { PossibilityRepository } from "./repository";

/**
 * Possibilities in Postgres (20261008130000_system_possibilities.sql). Every
 * RPC is service-role, security-definer and rechecks the actor through
 * system_actor_scope; the database also holds compare-and-set, the
 * one-event-per-revision history, closed states, and the stale rule (a
 * pinned System's pointer move returns the Possibility to Exploring in the
 * same transaction). This file shapes arguments, validates what comes back
 * and maps errors. It replaces createInMemoryPossibilityRepository behind the
 * same PossibilityRepository interface.
 *
 * History lives in `system_possibility_events`; a read returns the newest
 * events, and a save sends the whole document, of which the database keeps
 * only the events newer than the stored revision.
 */

type DbError = { message?: string; code?: string } | null;
export type PossibilitiesDb = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }>;
};

function possibilitiesDb(): PossibilitiesDb {
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Possibility storage is unavailable.");
  return client as unknown as PossibilitiesDb;
}

export const POSSIBILITY_STALE_MESSAGE = "A System this changes moved since it was built. It is back to Exploring for a refresh.";

export function mapPossibilityError(error: DbError, fallback: string): never {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (detail.includes("native_google_owner_denied") || detail.includes("business_record_access_denied") || detail.includes("system_possibility_not_found") || detail.includes("system_not_found")) {
    throw new WorkspaceAccessError();
  }
  if (detail.includes("system_possibility_revision_conflict")) throw new WorkspaceConflictError("This possibility changed. Reload before deciding.");
  if (detail.includes("system_possibility_closed")) throw new WorkspaceConflictError("This possibility is closed.");
  if (detail.includes("system_possibility_stale")) throw new WorkspaceConflictError(POSSIBILITY_STALE_MESSAGE);
  if (detail.includes("system_possibility_exists")) throw new WorkspaceConflictError("This possibility already exists.");
  if (detail.includes("workspace_exit_future_work_blocked")) throw new WorkspaceConflictError(WORKSPACE_EXIT_STOPPED_MESSAGE);
  if (detail.includes("system_possibility_invalid")) throw new WorkspaceStoreError(`${fallback} The change breaks the possibility's rules.`);
  throw new WorkspaceStoreError(fallback);
}

const uuid = z.string().uuid();

/** Possibility ids in Postgres are UUIDs; anything else names nothing stored. */
export function isStoredPossibilityId(id: string): boolean {
  return uuid.safeParse(id).success;
}

const listedSchema = z.array(z.object({
  sourceRef: z.string().nullable(),
  lastActivityAt: z.string(),
  possibility: z.unknown(),
}).passthrough());

export interface ListedPossibility {
  possibility: Possibility;
  sourceRef: string | null;
  lastActivityAt: string;
}

export interface SupabasePossibilityRepository extends PossibilityRepository {
  /** Creates, or returns the one already stored for this source (a backfill rerun). */
  createFromSource(value: Possibility, sourceRef: string): Promise<{ possibility: Possibility; replayed: boolean }>;
  listWithSources(businessId: string): Promise<ListedPossibility[]>;
}

export function createSupabasePossibilityRepository(actor: WorkspaceActor, db?: PossibilitiesDb): SupabasePossibilityRepository {
  const actorArgs = () => ({
    p_user_id: uuid.parse(actor.userId),
    p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()),
  });

  async function call(name: string, args: Record<string, unknown>, fallback: string): Promise<unknown> {
    const { data, error } = await (db ?? possibilitiesDb()).rpc(name, args);
    if (error) mapPossibilityError(error, fallback);
    return data;
  }

  function parse(data: unknown, businessId: string, fallback: string, id?: string): Possibility {
    const raw = data && typeof data === "object" ? { ...(data as Record<string, unknown>) } : data;
    if (raw && typeof raw === "object") delete (raw as Record<string, unknown>).replayed;
    const parsed = possibilitySchema.safeParse(raw);
    if (!parsed.success || parsed.data.businessId !== businessId || (id && parsed.data.id !== id)) {
      throw new WorkspaceStoreError(`${fallback} The response was malformed.`);
    }
    return parsed.data;
  }

  async function create(value: Possibility, sourceRef: string | null) {
    const p = possibilitySchema.parse(value);
    const fallback = "The possibility could not be saved.";
    const data = await call("create_system_possibility", {
      p_workspace_id: uuid.parse(p.businessId), ...actorArgs(), p_body: { ...p, id: uuid.parse(p.id) }, p_source_ref: sourceRef,
    }, fallback);
    const replayed = Boolean(data && typeof data === "object" && (data as Record<string, unknown>).replayed === true);
    return { possibility: parse(data, p.businessId, fallback), replayed };
  }

  async function listWithSources(businessId: string): Promise<ListedPossibility[]> {
    if (!uuid.safeParse(businessId).success) return [];
    const fallback = "Possibilities could not be loaded.";
    const rows = listedSchema.safeParse(await call("list_system_possibilities", { p_workspace_id: businessId, ...actorArgs() }, fallback));
    if (!rows.success) throw new WorkspaceStoreError(`${fallback} The response was malformed.`);
    return rows.data.map((row) => ({ possibility: parse(row.possibility, businessId, fallback), sourceRef: row.sourceRef, lastActivityAt: row.lastActivityAt }));
  }

  return {
    async get(businessId, id) {
      if (!uuid.safeParse(businessId).success || !isStoredPossibilityId(id)) return null;
      const fallback = "The possibility could not be loaded.";
      const data = await call("read_system_possibility", { p_workspace_id: businessId, ...actorArgs(), p_possibility_id: id }, fallback);
      if (data === null || data === undefined) return null;
      return parse(data, businessId, fallback, id);
    },
    async create(value) {
      const { possibility, replayed } = await create(value, null);
      if (replayed || possibility.id !== value.id) throw new WorkspaceStoreError("The possibility could not be saved. The response was malformed.");
    },
    async createFromSource(value, sourceRef) {
      return create(value, sourceRef);
    },
    async save(value, expectedRevision) {
      const p = possibilitySchema.parse(value);
      const fallback = "The possibility could not be saved.";
      const data = await call("save_system_possibility", {
        p_workspace_id: uuid.parse(p.businessId), ...actorArgs(), p_possibility_id: uuid.parse(p.id),
        p_expected_revision: z.number().int().nonnegative().parse(expectedRevision), p_body: p,
      }, fallback);
      const saved = parse(data, p.businessId, fallback, p.id);
      if (saved.revision !== p.revision) throw new WorkspaceStoreError(`${fallback} The response was malformed.`);
    },
    async finalizeNativeGoogleCompletion(value,expectedRevision,activationId) {
      const p=possibilitySchema.parse(value),fallback="The native Google completion could not be finalized.";
      const data=await call("finalize_native_google_completion",{
        p_workspace_id:uuid.parse(p.businessId),...actorArgs(),p_possibility_id:uuid.parse(p.id),
        p_expected_revision:z.number().int().nonnegative().parse(expectedRevision),p_activation_id:activationId,p_body:p,
      },fallback);
      const saved=parse(data,p.businessId,fallback,p.id);
      if(saved.revision!==p.revision || saved.status!=="made_real" || saved.activationId!==activationId || saved.candidateRevision!==p.candidateRevision)throw new WorkspaceStoreError(`${fallback} The response was malformed.`);
    },
    async finalizeNativeGoogleUndo(value,expectedRevision,activationId) {
      const p=possibilitySchema.parse(value),fallback="The native Google undo could not be finalized.";
      const data=await call("finalize_native_google_undo",{
        p_workspace_id:uuid.parse(p.businessId),...actorArgs(),p_possibility_id:uuid.parse(p.id),
        p_expected_revision:z.number().int().nonnegative().parse(expectedRevision),p_activation_id:activationId,p_body:p,
      },fallback);
      const saved=parse(data,p.businessId,fallback,p.id);
      if(saved.revision!==p.revision || saved.status!=="withdrawn" || saved.activationId)throw new WorkspaceStoreError(`${fallback} The response was malformed.`);
    },
    async list(businessId) {
      return (await listWithSources(businessId)).map((row) => row.possibility);
    },
    listWithSources,
  };
}

/** The candidate a signed preview link may show: open, same candidate revision. No actor: the link is the authority. */
export async function readPossibilityPreview(input: { businessId: string; possibilityId: string; candidateRevision: number }, db?: PossibilitiesDb): Promise<Omit<Possibility, "history" | "createdBy"> | null> {
  if (!uuid.safeParse(input.businessId).success || !isStoredPossibilityId(input.possibilityId)) return null;
  const { data, error } = await (db ?? possibilitiesDb()).rpc("read_system_possibility_preview", {
    p_workspace_id: input.businessId, p_possibility_id: input.possibilityId, p_candidate_revision: input.candidateRevision,
  });
  if (error) mapPossibilityError(error, "The preview could not be loaded.");
  if (data === null || data === undefined) return null;
  const parsed = possibilitySchema.omit({ history: true, createdBy: true }).partial({ keyEpochs: true, consumedApprovalIds: true }).safeParse(data);
  if (!parsed.success || parsed.data.businessId !== input.businessId || parsed.data.id !== input.possibilityId) return null;
  return parsed.data;
}

/** Strelva's 90-day idle withdraw (spec decision 6). Each withdraw is recorded as an event, the receipt. */
export async function withdrawIdlePossibilities(input: { idleDays?: number; limit?: number } = {}, db?: PossibilitiesDb): Promise<Array<{ workspaceId: string; possibilityId: string; title: string | null }>> {
  const { data, error } = await (db ?? possibilitiesDb()).rpc("withdraw_idle_system_possibilities", {
    p_idle_days: input.idleDays ?? 90, p_limit: input.limit ?? 100,
  });
  if (error) mapPossibilityError(error, "Idle possibilities could not be withdrawn.");
  const parsed = z.array(z.object({ workspaceId: z.string().uuid(), possibilityId: z.string().uuid(), title: z.string().nullable() })).safeParse(data);
  if (!parsed.success) throw new WorkspaceStoreError("Idle possibilities could not be withdrawn. The response was malformed.");
  return parsed.data;
}
