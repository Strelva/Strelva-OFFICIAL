import { z } from "zod";
import { connectDb, type RpcDb } from "./index";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";

/** Owner evidence only. This is never agreement, provider or revenue authority. */
export const attributionSourceReceiptSchema = z.object({
  kind: z.literal("owner_statement"), reference: z.string().min(1).max(2000).refine(value => value === value.trim()),
}).strict();
export const recordBusinessAttributionSchema = z.object({
  workspaceId: z.uuid(), agencyWorkspaceId: z.uuid(), source: z.enum(["signup", "conversion", "referral"]),
  sourceReceipt: attributionSourceReceiptSchema, commandId: z.uuid(), expectedProviderId: z.uuid(),
}).strict();
const endingBase = z.object({
  attributionId: z.uuid(), businessWorkspaceId: z.uuid(), agencyWorkspaceId: z.uuid(),
  from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }),
  source: z.enum(["signup", "conversion", "referral"]), sourceReceipt: attributionSourceReceiptSchema,
  endedBy: z.uuid(), oldProviderId: z.uuid(),
  newOperatorAgencyWorkspaceId: z.uuid().nullable(), completionReceipt: z.record(z.string(), z.unknown()),
}).strict();
const endingSchema = z.union([
  endingBase.extend({ providerChangeRequestId: z.uuid() }).strict(),
  endingBase.extend({ providerChangeRequestId: z.null(), workspaceExitRequestId: z.uuid(), newOperatorAgencyWorkspaceId: z.null() }).strict(),
]);
export const businessAttributionReceiptSchema = z.object({
  attributionId: z.uuid(), businessWorkspaceId: z.uuid(), agencyWorkspaceId: z.uuid(),
  source: z.enum(["signup", "conversion", "referral"]), sourceReceipt: attributionSourceReceiptSchema,
  from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }).nullable(),
  confirmedBy: z.uuid(), commandId: z.uuid(), providerSnapshotId: z.uuid(),
  evidence: z.literal("owner_confirmed_statement"), financialEligibility: z.literal("not_selected"),
  ending: endingSchema.nullable(),
}).strict().superRefine((value, context) => {
  const ending = value.ending;
  if (value.to !== null && Date.parse(value.to) < Date.parse(value.from))
    context.addIssue({ code: "custom", message: "The attribution ends before it begins." });
  if ((value.to === null) !== (ending === null) || (ending && (
    ending.attributionId !== value.attributionId || ending.businessWorkspaceId !== value.businessWorkspaceId ||
    ending.agencyWorkspaceId !== value.agencyWorkspaceId || ending.source !== value.source ||
    ending.sourceReceipt.reference !== value.sourceReceipt.reference || ending.from !== value.from || ending.to !== value.to
  ))) context.addIssue({ code: "custom", message: "The attribution ending does not match its immutable opening." });
});
export const businessAttributionHistorySchema = z.object({
  businessWorkspaceId: z.uuid(), currentProvider: z.object({ providerId: z.uuid(), agencyWorkspaceId: z.uuid() }).strict().nullable(),
  attributions: z.array(businessAttributionReceiptSchema),
}).strict();
async function attributionRpc(name: string, args: Record<string, unknown>, database: RpcDb | null) {
  if (!database) throw new WorkspaceStoreError("Attribution evidence is unavailable.");
  const result = await database.rpc(name, args);
  if (result.error) {
    const message = result.error.message ?? "";
    if (/denied|owner_required/.test(message)) throw new WorkspaceAccessError();
    if (/stale|conflict|already_active|change_provider_required|input_invalid|agency_invalid|future_work_blocked/.test(message))
      throw new WorkspaceConflictError("The attribution or business authority changed. Reload its evidence before continuing.");
    throw new WorkspaceStoreError("Attribution evidence could not be confirmed.");
  }
  return result.data;
}
export async function recordBusinessAttribution(actor: WorkspaceActor, input: z.input<typeof recordBusinessAttributionSchema>, database: RpcDb | null = connectDb()) {
  const value = recordBusinessAttributionSchema.parse(input);
  const parsedReceipt = businessAttributionReceiptSchema.safeParse(await attributionRpc("record_business_attribution", {
    p_workspace_id: value.workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
    p_agency_workspace_id: value.agencyWorkspaceId, p_source: value.source, p_source_receipt: value.sourceReceipt,
    p_command_id: value.commandId, p_expected_provider_id: value.expectedProviderId,
  }, database));
  if (!parsedReceipt.success) throw new WorkspaceStoreError("The returned attribution receipt is invalid.");
  const receipt = parsedReceipt.data;
  if (receipt.businessWorkspaceId !== value.workspaceId || receipt.agencyWorkspaceId !== value.agencyWorkspaceId ||
      receipt.source !== value.source || receipt.confirmedBy !== actor.userId || receipt.commandId !== value.commandId ||
      receipt.providerSnapshotId !== value.expectedProviderId || receipt.sourceReceipt.reference !== value.sourceReceipt.reference)
    throw new WorkspaceStoreError("The returned attribution receipt does not match this command.");
  return receipt;
}
export async function readBusinessAttributions(actor: WorkspaceActor, workspaceId: string, database: RpcDb | null = connectDb()) {
  const businessId = z.uuid().parse(workspaceId);
  const parsedHistory = businessAttributionHistorySchema.safeParse(await attributionRpc("read_business_attributions", {
    p_workspace_id: businessId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
  }, database));
  if (!parsedHistory.success) throw new WorkspaceStoreError("The returned attribution history is invalid.");
  const history = parsedHistory.data;
  if (history.businessWorkspaceId !== businessId || history.attributions.some(row => row.businessWorkspaceId !== businessId))
    throw new WorkspaceStoreError("The returned attribution history belongs to another business.");
  return history;
}
