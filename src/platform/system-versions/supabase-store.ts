import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import { canonicalJson, sha256 } from "@/platform/business-record/tenant-import";
import { WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import type { JsonObject, JsonValue } from "./compare";
import type { SystemRef } from "./refs";
import type { ConnectionOwnership, VersionStore } from "./store";
import {
  VERSION_CONTEXT_KINDS,
  VersionAccessError,
  VersionStaleError,
  VersionValidationError,
  type SourceRevision,
  type SourceSystemRecord,
  type VersionActor,
  type VersionLineage,
  type VersionRole,
} from "./types";

/**
 * Postgres adapter for the Version store port, over
 * 20261007150000_system_versions.sql. Every function is a service-role
 * security-definer RPC that rechecks the actor in the database (membership,
 * system_actor_scope on the Version's own System, source shares and grants);
 * this file only shapes arguments, validates responses and maps errors onto
 * the same error classes the in-memory store throws. It passes the same
 * contract suite (src/__tests__/system-versions-store-contract.test.ts).
 */

type DbError = { message?: string; code?: string } | null;
export type VersionsDb = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }>;
};

let override: VersionsDb | null = null;

/** Tests may supply their own client. */
export function setVersionsDb(client: VersionsDb | null): void {
  override = client;
}

export function versionsDb(): VersionsDb {
  if (override) return override;
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Version storage is unavailable.");
  return client as unknown as VersionsDb;
}

const ACCESS_CODES = ["business_record_access_denied", "system_not_found", "system_version_binding_foreign"];

export function mapVersionsError(error: DbError, fallback: string): never {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (ACCESS_CODES.some((code) => detail.includes(code))) throw new VersionAccessError();
  if (detail.includes("system_version_stale") || detail.includes("system_version_revision_exists") || detail.includes("system_version_exists")) {
    throw new VersionStaleError(detail.includes("revision_exists") ? "That source revision was already published." : undefined);
  }
  if (detail.includes("system_version_binding_taken")) {
    throw new VersionValidationError("That account is already connected to another Version. Connect a separate account for this one.");
  }
  if (detail.includes("workspace_exit_future_work_blocked")) throw new VersionValidationError("New work is stopped for this business.");
  for (const code of ["system_version_input_invalid", "system_version_history_immutable", "system_version_identity_immutable",
    "system_version_baseline_backward", "system_input_invalid", "system_command_conflict"]) {
    if (detail.includes(code)) throw new VersionValidationError(`The Version change was refused (${code}).`);
  }
  throw new WorkspaceStoreError(fallback);
}

const uuid = z.string().uuid();
const iso = z.string().min(1).max(64);
const json: z.ZodType<JsonValue> = z.lazy(() => z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(json), z.record(z.string(), json)]));
const jsonObject = z.record(z.string(), json) as unknown as z.ZodType<JsonObject>;
const ref = z.object({ businessId: uuid, systemId: uuid }).strict();

const sourceSchema = z.object({
  source: ref,
  hidden: z.boolean(),
  sharedWith: z.array(uuid),
  createdAt: iso,
}).strict();

const revisionSchema = z.object({
  source: z.object({ businessId: uuid, systemId: uuid, revisionId: uuid, number: z.number().int().positive() }).strict(),
  label: z.string().max(40).optional(),
  summary: z.string(),
  definition: jsonObject,
  requires: z.object({ bindingKinds: z.array(z.string()) }).strict(),
  publishedBy: uuid,
  publishedAt: iso,
}).strict();

const lineageSchema = z.object({
  id: uuid,
  version: ref,
  source: ref,
  context: z.object({ kind: z.enum(VERSION_CONTEXT_KINDS), label: z.string() }).strict(),
  baseline: z.object({ revision: z.number().int().positive(), definition: jsonObject }).strict(),
  overrides: z.array(z.object({ path: z.string(), value: json, setBy: uuid, setAt: iso }).strict()),
  bindings: z.array(z.object({ kind: z.string(), connectionId: z.string(), ownerBusinessId: uuid, boundBy: uuid, boundAt: iso }).strict()),
  localData: z.record(z.string(), json),
  releases: z.array(z.object({
    number: z.number().int().positive(), definition: jsonObject, baselineRevision: z.number().int().positive(),
    overridePaths: z.array(z.string()), releasedBy: uuid, releasedAt: iso,
  }).strict()),
  currentRelease: z.number().int().positive().nullable(),
  decisions: z.array(z.union([
    z.object({ sourceRevision: z.number().int().positive(), choice: z.literal("adopted"),
      resolutions: z.array(z.object({ path: z.string(), choice: z.enum(["keep_local", "take_upstream"]) }).strict()), by: uuid, at: iso }).strict(),
    z.object({ sourceRevision: z.number().int().positive(), choice: z.literal("declined"), reason: z.string(), by: uuid, at: iso }).strict(),
  ])),
  grants: z.array(z.object({
    granteeBusinessId: uuid, scope: z.enum(["lineage", "lineage_and_data"]), grantedBy: uuid, grantedAt: iso, revokedAt: iso.optional(),
  }).strict()),
  rowRevision: z.number().int().positive(),
  createdBy: uuid,
  createdAt: iso,
  updatedAt: iso,
}).strict();

const actorSchema = z.object({
  userId: uuid,
  memberships: z.array(z.object({ businessId: uuid, role: z.enum(["owner", "admin", "member"]) }).strict()),
}).strict();

function actorArgs(actor: VersionActor) {
  if (!actor.verifiedEmail) throw new VersionAccessError();
  return {
    p_user_id: uuid.parse(actor.userId),
    p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()),
  };
}

function refArgs(source: SystemRef) {
  const parsed = ref.safeParse({ businessId: source.businessId, systemId: source.systemId });
  // A non-UUID ref can never name a stored System: treat it as missing.
  return parsed.success ? parsed.data : null;
}

async function call<T>(db: VersionsDb, name: string, args: Record<string, unknown>, schema: z.ZodType<T>, fallback: string): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) mapVersionsError(error, fallback);
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new WorkspaceStoreError(`${fallback} The response was malformed.`);
  return parsed.data;
}

function toRecord(value: z.infer<typeof sourceSchema>): SourceSystemRecord {
  return { source: value.source, sharedWith: value.sharedWith, createdAt: value.createdAt };
}

export function createSupabaseVersionStore(client?: VersionsDb): VersionStore {
  const db = () => client ?? versionsDb();
  return {
    async getSource(actor, source) {
      const at = refArgs(source);
      if (!at) return null;
      const value = await call(db(), "read_system_version_source", { p_workspace_id: at.businessId, ...actorArgs(actor), p_system_id: at.systemId },
        sourceSchema.nullable(), "The source could not be loaded.");
      return value ? toRecord(value) : null;
    },
    async putSource(actor, record) {
      const at = refArgs(record.source);
      if (!at) throw new VersionValidationError("A source must be a stored System.");
      await call(db(), "put_system_version_source", {
        p_workspace_id: at.businessId, ...actorArgs(actor), p_system_id: at.systemId,
        p_shared_with: [...new Set(record.sharedWith.map((item) => uuid.parse(item)))],
      }, sourceSchema, "The source could not be saved.");
    },
    async getRevision(actor, source, number) {
      const at = refArgs(source);
      if (!at) return null;
      const list = await call(db(), "read_system_version_source_revisions", {
        p_workspace_id: at.businessId, ...actorArgs(actor), p_system_id: at.systemId, p_number: number,
      }, z.array(revisionSchema), "The source revision could not be loaded.");
      return (list[0] as SourceRevision | undefined) ?? null;
    },
    async listRevisions(actor, source) {
      const at = refArgs(source);
      if (!at) return [];
      return call(db(), "read_system_version_source_revisions", {
        p_workspace_id: at.businessId, ...actorArgs(actor), p_system_id: at.systemId, p_number: null,
      }, z.array(revisionSchema), "The source revisions could not be loaded.") as Promise<SourceRevision[]>;
    },
    async insertRevision(actor, revision) {
      return call(db(), "publish_system_version_source_revision", { ...actorArgs(actor), p_revision: revision },
        revisionSchema, "The source revision could not be published.") as Promise<SourceRevision>;
    },
    async getLineage(actor, id) {
      if (!uuid.safeParse(id).success) return null;
      return call(db(), "read_system_version", { ...actorArgs(actor), p_version_id: id }, lineageSchema.nullable(),
        "The Version could not be loaded.") as Promise<VersionLineage | null>;
    },
    async findLineageByVersion(actor, version) {
      const at = refArgs(version);
      if (!at) return null;
      return call(db(), "read_system_version_for_system", { p_workspace_id: at.businessId, ...actorArgs(actor), p_system_id: at.systemId },
        lineageSchema.nullable(), "The Version could not be loaded.") as Promise<VersionLineage | null>;
    },
    async connectionHolder(actor, connectionId) {
      return call(db(), "system_version_connection_holder", { ...actorArgs(actor), p_connection_ref: connectionId },
        z.string().nullable(), "The connection could not be checked.");
    },
    async insertLineage(actor, lineage) {
      return call(db(), "create_system_version", { ...actorArgs(actor), p_lineage: lineage }, lineageSchema,
        "The Version could not be created.") as Promise<VersionLineage>;
    },
    async updateLineage(actor, lineage, expectedRowRevision) {
      return call(db(), "save_system_version", {
        ...actorArgs(actor), p_version_id: uuid.parse(lineage.id), p_expected_row_revision: expectedRowRevision, p_lineage: lineage,
      }, lineageSchema, "The Version could not be saved.") as Promise<VersionLineage>;
    },
  };
}

/** Connection ownership from the database: `calendar:<id>` and `tenant:<stableId>` refs. */
export function createSupabaseConnectionOwnership(client?: VersionsDb): ConnectionOwnership {
  return {
    async ownerOf(actor, connectionId) {
      return call(client ?? versionsDb(), "read_system_version_connection_owner", { ...actorArgs(actor), p_connection_ref: connectionId },
        uuid.nullable(), "The connection could not be checked.");
    },
  };
}

/** The signed-in actor's direct memberships, as the Versions service needs them. */
export async function readVersionActor(actor: WorkspaceActor, client?: VersionsDb): Promise<VersionActor> {
  const value = await call(client ?? versionsDb(), "read_version_actor", {
    p_user_id: uuid.parse(actor.userId), p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()),
  }, actorSchema, "Your access could not be checked.");
  return { userId: value.userId, verifiedEmail: actor.verifiedEmail.trim().toLowerCase(), memberships: value.memberships as Array<{ businessId: string; role: VersionRole }> };
}

/**
 * A new source System in the actor's business: an agency's own source, or the
 * hidden same-business source both locations descend from (Twin Trees).
 */
export async function createSourceSystem(
  actor: VersionActor,
  input: { businessId: string; name: string; kind: string; purpose?: string; hidden: boolean; commandId: string },
  client?: VersionsDb,
): Promise<{ source: SystemRef; hidden: boolean }> {
  const body = { name: input.name, kind: input.kind, ...(input.purpose ? { purpose: input.purpose } : {}), hidden: input.hidden };
  const value = await call(client ?? versionsDb(), "create_system_version_source", {
    p_workspace_id: uuid.parse(input.businessId), ...actorArgs(actor), p_input: body,
    p_command_id: uuid.parse(input.commandId), p_command_digest: sha256(canonicalJson({ kind: "version_source", body })),
  }, z.object({ system: z.object({ id: uuid, businessId: uuid }).passthrough(), source: sourceSchema, replayed: z.boolean().optional() }).strict(),
  "The source could not be created.");
  return { source: value.source.source, hidden: value.source.hidden };
}
