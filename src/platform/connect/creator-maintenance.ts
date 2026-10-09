import { z } from "zod";
import { connectDb, type RpcDb } from "./index";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";

const timestamp = z.string().datetime({ offset: true });
const receiptSchema = z.object({ id: z.uuid(), listing_id: z.uuid(), maintainer_state: z.enum(["creator", "takeover", "tapered"]), agreement_version: z.string().nullable(), rate_reference: z.string().nullable(), effective_from: timestamp, recorded_by: z.uuid(), recorded_at: timestamp }).strict();
export const creatorMaintenanceGraphSchema = z.object({
  workspaceId: z.uuid(), canMaintain: z.boolean(),
  listings: z.array(z.object({ id: z.uuid(), definitionId: z.string(), sourceRevisionId: z.uuid(), agreementVersion: z.string().nullable(), rateReference: z.string().nullable(), maintainerState: z.enum(["creator", "takeover", "tapered"]), history: z.array(receiptSchema) }).strict()),
  agreements: z.array(z.object({ version: z.string(), rateReference: z.string(), rateBps: z.number().int().min(0).max(10000), effectiveFrom: timestamp, effectiveUntil: timestamp.nullable() }).strict()),
}).strict();
export type CreatorMaintenanceGraph = z.infer<typeof creatorMaintenanceGraphSchema>;
const commandBase = { workspaceId: z.uuid(), listingId: z.uuid(), sourceRevisionId: z.uuid(), effectiveFrom: timestamp };
export const creatorMaintenanceCommandSchema = z.discriminatedUnion("state", [
  z.object({ ...commandBase, state: z.literal("takeover") }).strict(),
  z.object({ ...commandBase, state: z.enum(["creator", "tapered"]), agreementVersion: z.string().trim().min(1).max(200), rateReference: z.string().trim().min(1).max(200) }).strict(),
]);
async function rpc(name: string, args: Record<string, unknown>, db: RpcDb | null) {
  if (!db) throw new WorkspaceStoreError("Creator maintenance records are unavailable.");
  const result = await db.rpc(name, args);
  if (result.error) {
    const message = result.error.message ?? "";
    if (/denied|owner_required|future_work_blocked/.test(message)) throw new WorkspaceAccessError();
    if (/conflict|stale|terms_invalid|agreement_required/.test(message)) throw new WorkspaceConflictError("The listing, maintenance date or recorded agreement changed. Reload before continuing.");
    throw new WorkspaceStoreError("Creator maintenance could not be confirmed.");
  }
  return result.data;
}
export async function readCreatorMaintenance(actor: WorkspaceActor, workspaceId: string, db: RpcDb | null = connectDb()) {
  const id = z.uuid().parse(workspaceId);
  const parsed = creatorMaintenanceGraphSchema.safeParse(await rpc("read_creator_maintenance_operations", { p_workspace_id: id, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail }, db));
  if (!parsed.success) throw new WorkspaceStoreError("The maintenance history is invalid.");
  const graph = parsed.data;
  if (graph.workspaceId !== id || graph.listings.some(listing => listing.history.some(receipt => receipt.listing_id !== listing.id))) throw new WorkspaceStoreError("The maintenance history does not match this workspace.");
  return graph;
}
export async function recordCreatorMaintenance(actor: WorkspaceActor, raw: unknown, db: RpcDb | null = connectDb()) {
  const input = creatorMaintenanceCommandSchema.parse(raw);
  const agreement = input.state === "takeover" ? null : input.agreementVersion;
  const rate = input.state === "takeover" ? null : input.rateReference;
  const parsed = receiptSchema.safeParse(await rpc("record_creator_maintenance_from_workspace", { p_workspace_id: input.workspaceId, p_listing_id: input.listingId, p_source_revision_id: input.sourceRevisionId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_state: input.state, p_agreement: agreement, p_rate: rate, p_effective: input.effectiveFrom }, db));
  if (!parsed.success) throw new WorkspaceStoreError("The maintenance receipt is invalid.");
  const receipt = parsed.data;
  if (receipt.listing_id !== input.listingId || receipt.recorded_by !== actor.userId || receipt.maintainer_state !== input.state || receipt.agreement_version !== agreement || receipt.rate_reference !== rate || Date.parse(receipt.effective_from) !== Date.parse(input.effectiveFrom)) throw new WorkspaceStoreError("The maintenance receipt does not match this command.");
  return receipt;
}
