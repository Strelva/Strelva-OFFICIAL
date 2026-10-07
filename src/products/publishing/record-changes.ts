import { tenantPublishingPorts } from "@/platform/infra/tenant-publishing";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { businessRecordPatchSchema, type BusinessRecordWriteResult } from "@/platform/business-record/contracts";
import { patchBusinessRecord, readBusinessRecord, type WriteOptions } from "@/platform/business-record/service";
import { publishingEnabledForWorkspace, recordGoogleApprovalPolicyEnabled } from "./release";

export interface RecordGoogleEffect {
  tenantId: string;
  locationId: string;
  kind: "hours" | "info";
  status: "needs_approval" | "posted" | "posted_unverified" | "already_approved" | "already_on_google" | "failed";
  eventId?: string;
  reason?: string;
}
export interface RecordChangeDeps {
  read: typeof readBusinessRecord;
  patch: typeof patchBusinessRecord;
  publishing(workspaceId: string, actor: WorkspaceActor): Promise<boolean>;
  policy(workspaceId: string, actor: WorkspaceActor): Promise<boolean>;
  locations(actor: WorkspaceActor, workspaceId: string): Promise<Array<{ tenantId: string; locationId: string }>>;
  prepare(actor: WorkspaceActor, input: { workspaceId: string; tenantId: string; locationId: string; kind: "hours" | "info"; commandId: string; expectedRecordRevision: number; infoFields?: Array<"phone" | "description" | "links"> }): Promise<{ id: string; status?: string }>;
  approve(tenantId: string, eventId: string, actorId: string): Promise<{ changed: boolean; reason?: string }>;
}
const defaults: RecordChangeDeps = {
  read: readBusinessRecord, patch: patchBusinessRecord,
  publishing: publishingEnabledForWorkspace, policy: recordGoogleApprovalPolicyEnabled,
  async locations(actor, workspaceId) {
    const { readPublishingSnapshot } = await import("./server");
    const snapshot = await readPublishingSnapshot(actor, workspaceId);
    return snapshot.bindings.flatMap(binding => binding.originTenantId
      ? binding.locations.map(location => ({ tenantId: binding.originTenantId!, locationId: location.locationId })) : []);
  },
  async prepare(actor, input) { return (await import("@/products/google-listing/server")).prepareGoogleListingDraft(actor, input); },
  async approve(tenantId, eventId, actorId) { return (await tenantPublishingPorts()).resolveEventAction(tenantId, eventId, "approved", actorId); },
};

/** The record commits first. Each Google effect has its own approval/receipt;
 * a provider failure never rolls back the website's source of truth. */
export async function changeRecordWithGoogle(
  actor: WorkspaceActor, workspaceId: string, expectedRevision: number, rawPatch: unknown, options: WriteOptions & { googleApprovalDisclosed?: boolean },
  deps: RecordChangeDeps = defaults,
): Promise<{ record: BusinessRecordWriteResult; google: RecordGoogleEffect[]; propagationError?: string }> {
  const patch = businessRecordPatchSchema.parse(rawPatch);
  const commandId = z.string().uuid().parse(options.commandId ?? randomUUID());
  const publishing = await deps.publishing(workspaceId, actor);
  if (!publishing) return { record: await deps.patch(actor, workspaceId, expectedRevision, patch, { ...options, commandId }), google: [] };
  const before = await deps.read(actor, workspaceId);
  if (options.source === "owner" && before.access !== "owner") throw new WorkspaceAccessError("Only an owner can approve a record change and its Google effects.");
  const policy = options.source === "owner" && options.googleApprovalDisclosed === true && await deps.policy(workspaceId, actor);
  const record = await deps.patch(actor, workspaceId, expectedRevision, patch, { ...options, commandId });
  if (!record.changeCount) return { record, google: [] };
  const kinds: Array<"hours" | "info"> = [];
  if (patch.facts?.hours) kinds.push("hours");
  const infoFields = (["phone", "description", "links"] as const).filter(key => patch.facts && Object.hasOwn(patch.facts, key));
  if (infoFields.length) kinds.push("info");
  if (!kinds.length) return { record, google: [] };
  let locations: Awaited<ReturnType<RecordChangeDeps["locations"]>>;
  try { locations = await deps.locations(actor, workspaceId); }
  catch { return { record, google: [], propagationError: "The record was saved. Google listings could not be read; review them before applying this change." }; }
  const google: RecordGoogleEffect[] = [];
  for (const location of locations) for (const kind of kinds) {
    const effect = { ...location, kind };
    try {
      const draft = await deps.prepare(actor, { workspaceId, ...effect, commandId, expectedRecordRevision: record.revision, ...(kind === "info" ? { infoFields } : {}) });
      if (draft.status === "approved") { google.push({ ...effect, eventId: draft.id, status: "already_approved" }); continue; }
      if (draft.status === "dismissed") { google.push({ ...effect, eventId: draft.id, status: "failed", reason: "This Google change was declined. Review the listing before preparing another." }); continue; }
      if (!policy) { google.push({ ...effect, eventId: draft.id, status: "needs_approval" }); continue; }
      const result = await deps.approve(location.tenantId, draft.id, actor.userId);
      const status = result.changed ? result.reason === "already_on_google" ? "already_on_google" : result.reason ? "posted_unverified" : "posted" : result.reason === "already_resolved" ? "already_approved" : "failed";
      google.push({ ...effect, eventId: draft.id, status, ...(result.reason ? { reason: result.reason } : {}) });
    } catch {
      google.push({ ...effect, status: "failed", reason: "The record was saved. This Google change remains unapplied; prepare or approve it from the listing." });
    }
  }
  return { record, google };
}

/** App-edge adapter keeps the existing details-save contract. */
export const patchRecordWithGoogle: typeof patchBusinessRecord = async (...args) => (await changeRecordWithGoogle(...args)).record;

export { recordGoogleApprovalCopy } from "./record-consent";

export type RecordGoogleSummary = "needs_approval" | "confirmed" | "unconfirmed" | "failed" | "unavailable";
export function recordGoogleSummary(result: { google: RecordGoogleEffect[]; propagationError?: string }): RecordGoogleSummary | null {
  if (result.propagationError) return "unavailable";
  if (!result.google.length) return null;
  if (result.google.some(effect => effect.status === "failed")) return "failed";
  if (result.google.some(effect => effect.status === "needs_approval")) return "needs_approval";
  if (result.google.some(effect => effect.status === "posted_unverified" || effect.status === "already_approved")) return "unconfirmed";
  return "confirmed";
}
