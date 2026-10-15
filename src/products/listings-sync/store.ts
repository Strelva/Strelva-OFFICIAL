import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { confirmedBusinessFactsSchema, type ConfirmedBusinessFacts } from "@/platform/business-record/contracts";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { FIX_KINDS, LISTING_FACTS, listingFixSchema, surfaceReadingSchema, type ListingFix, type SurfaceReading } from "./contracts";

type Rpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> };
let override: Rpc | null | undefined;
/** Test seam. */
export function setListingsSyncDb(value: Rpc | null | undefined): void { override = value; }

const UNREADABLE = "Listings couldn't be read right now. Nothing changed.";
const MOVED = "These details changed while Strelva was checking. Check again.";

function db(): Rpc {
  if (override) return override;
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError(UNREADABLE);
  return client as unknown as Rpc;
}

async function call<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  const { data, error } = await db().rpc(name, args);
  if (error) {
    const detail = `${error.code ?? ""} ${error.message ?? ""}`;
    if (detail.includes("business_record_access_denied")) throw new WorkspaceAccessError();
    if (detail.includes("listing_sync_fix_moved") || detail.includes("listing_sync_claim_lost")) throw new WorkspaceConflictError(MOVED);
    throw new WorkspaceStoreError(UNREADABLE);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new WorkspaceStoreError(UNREADABLE);
  return parsed.data;
}

export type CheckTrigger = "fact.confirmed" | "sweep" | "check_now" | "after_fix";

const uuid = z.string().uuid();
const iso = z.string();
const claimedCheckRow = z.object({
  id: uuid, workspace_id: uuid, record_revision: z.coerce.number().int(), trigger: z.string(), claim_token: uuid,
}).passthrough();
export interface ClaimedCheck { id: string; workspaceId: string; recordRevision: number; trigger: string; claimToken: string }

export const rawTargetsSchema = z.object({
  tenants: z.array(z.object({ tenantId: z.string(), tenantStableId: z.string().uuid(), deliveryModel: z.string() }).strict()).max(50),
  connectedSites: z.array(z.object({ id: uuid, siteUrl: z.string(), siteHost: z.string(), platform: z.string(), injectSchema: z.boolean() }).strict()).max(50),
  agencies: z.array(uuid).max(50),
}).strict();
export type RawListingTargets = z.infer<typeof rawTargetsSchema>;

const fixRow = z.object({
  id: uuid, surface_key: z.string(), fact_key: z.enum([...LISTING_FACTS, "page"]), kind: z.enum(FIX_KINDS),
  proposed: z.record(z.string(), z.unknown()), status: listingFixSchema.shape.status,
  outcome_ref: z.string().nullable(), reason: z.string().nullable(), record_revision: z.coerce.number().int(),
}).passthrough();
const fromRow = (row: z.infer<typeof fixRow>): ListingFix => ({
  id: row.id, surfaceKey: row.surface_key, factKey: row.fact_key, kind: row.kind, proposed: row.proposed, status: row.status,
  outcomeRef: row.outcome_ref, reason: row.reason, recordRevision: row.record_revision,
});

const releaseOut = z.object({ number: z.number().int().positive(), recordedAt: iso }).strict();
const finishOut = z.object({ checkId: uuid, release: releaseOut.nullable() }).strict();
export type FinishedCheck = z.infer<typeof finishOut>;

const openPlanSchema = z.object({
  recordRevision: z.coerce.number().int(),
  readings: z.array(surfaceReadingSchema),
  fixes: z.array(listingFixSchema),
}).strict().nullable();
export type OpenListingsPlan = z.infer<typeof openPlanSchema>;

export const readListingsSyncSchema = z.object({
  access: z.enum(["owner", "admin", "member", "agency"]),
  latest: z.object({ id: uuid, status: z.enum(["queued", "running", "done", "failed"]), recordRevision: z.coerce.number().int(), trigger: z.string(),
    error: z.string().nullable(), createdAt: iso, finishedAt: iso.nullable() }).strict().nullable(),
  lastDone: z.object({ id: uuid, recordRevision: z.coerce.number().int(), readings: z.array(surfaceReadingSchema), differs: z.number().int(),
    compared: z.number().int(), finishedAt: iso.nullable() }).strict().nullable(),
  fixes: z.array(listingFixSchema),
  release: z.object({ number: z.number().int().positive(), recordedAt: iso, recordRevision: z.coerce.number().int() }).strict().nullable(),
  releaseCount: z.coerce.number().int().min(0),
}).strict();
export type ListingsSyncRead = z.infer<typeof readListingsSyncSchema>;

export const listingsSyncStore = {
  async queue(workspaceId: string, trigger: CheckTrigger, requestedBy?: string | null): Promise<string> {
    return call("listing_sync_queue_check", { p_workspace_id: workspaceId, p_trigger: trigger, p_requested_by: requestedBy ?? null }, uuid);
  },
  async claim(limit: number, checkId?: string): Promise<ClaimedCheck[]> {
    const rows = await call("listing_sync_claim_checks", { p_limit: limit, p_check_id: checkId ?? null }, z.array(claimedCheckRow));
    return rows.map(row => ({ id: row.id, workspaceId: row.workspace_id, recordRevision: row.record_revision, trigger: row.trigger, claimToken: row.claim_token }));
  },
  async confirmedFacts(workspaceId: string): Promise<ConfirmedBusinessFacts> {
    return call("listing_sync_confirmed_facts", { p_workspace_id: workspaceId }, confirmedBusinessFactsSchema);
  },
  async targets(workspaceId: string): Promise<RawListingTargets> {
    return call("listing_sync_targets", { p_workspace_id: workspaceId }, rawTargetsSchema);
  },
  async saveFixes(checkId: string, claimToken: string, fixes: Array<{ surfaceKey: string; factKey: string; kind: string; proposed: Record<string, unknown> }>): Promise<ListingFix[]> {
    const rows = await call("listing_sync_save_fixes", { p_check_id: checkId, p_claim_token: claimToken, p_fixes: fixes }, z.array(fixRow));
    return rows.map(fromRow);
  },
  async finish(checkId: string, claimToken: string, status: "done" | "failed", readings: SurfaceReading[], differs: number, compared: number, error: string | null): Promise<FinishedCheck> {
    return call("listing_sync_finish_check", { p_check_id: checkId, p_claim_token: claimToken, p_status: status, p_readings: readings, p_differs: differs, p_compared: compared, p_error: error }, finishOut);
  },
  async setFix(workspaceId: string, fixId: string, from: string[], to: string, patch: { outcomeRef?: string | null; reason?: string | null; decidedBy?: string | null } = {}): Promise<ListingFix> {
    const row = await call("listing_sync_set_fix", {
      p_fix_id: fixId, p_workspace_id: workspaceId, p_from: from, p_to: to,
      p_outcome_ref: patch.outcomeRef ?? null, p_reason: patch.reason ?? null, p_decided_by: patch.decidedBy ?? null,
    }, fixRow);
    return fromRow(row);
  },
  async declinePlan(workspaceId: string, recordRevision: number, decidedBy: string | null): Promise<number> {
    return call("listing_sync_decline_plan", { p_workspace_id: workspaceId, p_record_revision: recordRevision, p_decided_by: decidedBy }, z.number().int());
  },
  async due(limit: number, mode: "workspace" | "on"): Promise<string[]> {
    return call("listing_sync_due_workspaces", { p_limit: limit, p_mode: mode }, z.array(uuid));
  },
  async openPlan(workspaceId: string): Promise<OpenListingsPlan> {
    return call("listing_sync_open_plan", { p_workspace_id: workspaceId }, openPlanSchema);
  },
  async read(actor: WorkspaceActor, workspaceId: string): Promise<ListingsSyncRead> {
    return call("read_listing_sync", { p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail }, readListingsSyncSchema);
  },
};
export type ListingsSyncStore = typeof listingsSyncStore;
