import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import {
  NO_VIEWER,
  RELEASE_FLAGS,
  releaseFlagEnvMode,
  resolveReleaseFlag,
  workspaceReleaseOn,
  type ReleaseEnvironment,
  type ReleaseFlag,
  type ReleaseFlagRowState,
  type ReleaseViewer,
} from "./resolve";

/**
 * Service-role RPCs from 20261007130000_workspace_release_flags.sql. Flag rows
 * are cached per workspace for at most 60 seconds per server instance, so an
 * operator change takes effect within a minute without a deploy. A change made
 * through this module clears its own instance's cache at once.
 */

type DbError = { message?: string; code?: string } | null;
export type ReleaseFlagsDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }> };

let override: ReleaseFlagsDb | null = null;
export function setReleaseFlagsDb(client: ReleaseFlagsDb | null): void {
  override = client;
  cache.clear();
}
function db(): ReleaseFlagsDb {
  if (override) return override;
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Release flag storage is unavailable.");
  return client as unknown as ReleaseFlagsDb;
}

export const RELEASE_FLAG_CACHE_MS = 60_000;

const rowState = z.enum(["off", "operators", "on"]);
export const workspaceReleaseFlagsSchema = z.object({
  workspaceId: z.string().uuid(),
  flags: z.record(z.string(), z.object({ state: rowState, revision: z.number().int().positive(), changedAt: z.string() })),
  testers: z.array(z.string().uuid()),
  testerEmails: z.array(z.string()).default([]),
});
export type WorkspaceReleaseFlags = z.infer<typeof workspaceReleaseFlagsSchema>;

export const releaseFlagChangeSchema = z.object({
  id: z.string().uuid(),
  subject: z.string(),
  fromState: z.string().nullable(),
  toState: z.string(),
  testerEmail: z.string().nullable(),
  reason: z.string(),
  changedBy: z.string(),
  changedAt: z.string(),
});
export type ReleaseFlagChange = z.infer<typeof releaseFlagChangeSchema>;

export const ownerEntryResolutionSchema = z.object({
  workspaceId: z.string().uuid().nullable(),
  tenantStableId: z.string().uuid().nullable(),
  ownerEntry: rowState.nullable(),
  role: z.enum(["owner", "admin", "member"]).nullable(),
  tester: z.boolean(),
  operator: z.boolean(),
});
export type OwnerEntryResolution = z.infer<typeof ownerEntryResolutionSchema>;

export class ReleaseFlagConflictError extends WorkspaceConflictError {
  constructor(message = "Someone else changed this flag. Reload and try again.") {
    super(message);
    this.name = "ReleaseFlagConflictError";
  }
}
export class ReleaseFlagValidationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ReleaseFlagValidationError";
  }
}

const VALIDATION: Record<string, string> = {
  workspace_release_flag_unknown: "That is not a release flag.",
  workspace_release_state_invalid: "Choose off, operators, on or unset.",
  workspace_release_reason_required: "Give a reason of 3 to 500 characters.",
  workspace_release_workspace_invalid: "That is not a business workspace.",
  workspace_release_tester_unknown: "No verified Strelva account uses that email.",
  workspace_release_limit_invalid: "Ask for between 1 and 200 changes.",
};

/** Shared by readers in this migration family (release flags, linked sites). */
export async function callReleaseFlagsRpc<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>, fallback: string): Promise<T> {
  const { data, error } = await db().rpc(name, args);
  if (error) {
    const detail = `${error.code ?? ""} ${error.message ?? ""}`;
    if (detail.includes("workspace_release_operator_required") || detail.includes("workspace_access_denied")) throw new WorkspaceAccessError();
    if (detail.includes("workspace_release_revision_conflict")) throw new ReleaseFlagConflictError();
    for (const [code, message] of Object.entries(VALIDATION)) if (detail.includes(code)) throw new ReleaseFlagValidationError(code, message);
    throw new WorkspaceStoreError(fallback);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new WorkspaceStoreError(`${fallback} The response was malformed.`);
  return parsed.data;
}

const cache = new Map<string, { at: number; value: WorkspaceReleaseFlags }>();
const uuid = z.string().uuid();
const operatorEmail = (value: string) => z.string().email().parse(value.trim().toLowerCase());

/** `fresh` skips the cache (operator console); `now` is for tests. */
export async function readWorkspaceReleaseFlags(workspaceId: string, options: { fresh?: boolean; now?: number } = {}): Promise<WorkspaceReleaseFlags> {
  const id = uuid.parse(workspaceId);
  const now = options.now ?? Date.now();
  const hit = cache.get(id);
  if (!options.fresh && hit && now - hit.at >= 0 && now - hit.at < RELEASE_FLAG_CACHE_MS) return hit.value;
  const value = await callReleaseFlagsRpc("read_workspace_release_flags", { p_workspace_id: id }, workspaceReleaseFlagsSchema, "The release flags could not be read.");
  cache.set(id, { at: now, value });
  return value;
}

export function clearReleaseFlagCache(workspaceId?: string): void {
  if (workspaceId) cache.delete(workspaceId);
  else cache.clear();
}

export function rowStateFor(flags: WorkspaceReleaseFlags | null, flag: ReleaseFlag): ReleaseFlagRowState | null {
  return flags?.flags[flag]?.state ?? null;
}

/**
 * Whether one flag is on for one workspace and viewer. A failed read falls
 * back to the env value alone (no row), which never turns a flag on that the
 * env has off, and is logged.
 */
export async function workspaceReleaseFlagEnabled(
  flag: ReleaseFlag,
  workspaceId: string,
  viewer: ReleaseViewer = NO_VIEWER,
  environment: ReleaseEnvironment = process.env,
): Promise<boolean> {
  const workspaceRelease = workspaceReleaseOn(environment);
  const env = releaseFlagEnvMode(flag, environment);
  if (!workspaceRelease || env === "off") return false;
  let flags: WorkspaceReleaseFlags | null = null;
  try {
    flags = await readWorkspaceReleaseFlags(workspaceId);
  } catch (error) {
    console.error("[release-flags] read failed; using the env value", { flag, workspaceId, error: error instanceof Error ? error.message : String(error) });
  }
  const tester = Boolean(viewer.tester || (viewer.userId && flags?.testers.includes(viewer.userId)));
  return resolveReleaseFlag({ workspaceRelease, env, row: rowStateFor(flags, flag), viewer: { operator: viewer.operator, tester } });
}

export async function setWorkspaceReleaseFlag(input: {
  operatorEmail: string; workspaceId: string; flag: ReleaseFlag; state: ReleaseFlagRowState | "unset"; reason: string; expectedRevision: number;
}): Promise<WorkspaceReleaseFlags> {
  if (!RELEASE_FLAGS.includes(input.flag)) throw new ReleaseFlagValidationError("workspace_release_flag_unknown", VALIDATION.workspace_release_flag_unknown!);
  const value = await callReleaseFlagsRpc("set_workspace_release_flag", {
    p_operator_email: operatorEmail(input.operatorEmail),
    p_workspace_id: uuid.parse(input.workspaceId),
    p_flag: input.flag,
    p_state: input.state,
    p_reason: input.reason,
    p_expected_revision: z.number().int().min(0).parse(input.expectedRevision),
  }, workspaceReleaseFlagsSchema, "The release flag could not be changed.");
  cache.set(value.workspaceId, { at: Date.now(), value });
  return value;
}

export async function setWorkspaceReleaseTester(input: {
  operatorEmail: string; workspaceId: string; testerEmail: string; present: boolean; reason: string;
}): Promise<WorkspaceReleaseFlags> {
  const value = await callReleaseFlagsRpc("set_workspace_release_tester", {
    p_operator_email: operatorEmail(input.operatorEmail),
    p_workspace_id: uuid.parse(input.workspaceId),
    p_tester_email: z.string().email().parse(input.testerEmail.trim().toLowerCase()),
    p_present: input.present,
    p_reason: input.reason,
  }, workspaceReleaseFlagsSchema, "The tester could not be changed.");
  cache.set(value.workspaceId, { at: Date.now(), value });
  return value;
}

export async function readWorkspaceReleaseFlagHistory(operator: string, workspaceId: string, limit = 20): Promise<ReleaseFlagChange[]> {
  return callReleaseFlagsRpc("read_workspace_release_flag_history", {
    p_operator_email: operatorEmail(operator), p_workspace_id: uuid.parse(workspaceId), p_limit: z.number().int().min(1).max(200).parse(limit),
  }, z.array(releaseFlagChangeSchema), "The release flag history could not be read.");
}

/** Never cached: membership must be current for every redirect. */
export async function resolveTenantOwnerEntry(tenantId: string, actor: WorkspaceActor): Promise<OwnerEntryResolution> {
  return callReleaseFlagsRpc("resolve_tenant_owner_entry", {
    p_tenant_id: z.string().min(1).max(120).parse(tenantId),
    p_user_id: uuid.parse(actor.userId),
    p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()),
  }, ownerEntryResolutionSchema, "Owner entry could not be resolved.");
}
