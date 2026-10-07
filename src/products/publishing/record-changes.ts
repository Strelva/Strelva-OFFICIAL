import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { businessRecordPatchSchema, type BusinessRecord, type BusinessRecordWriteResult } from "@/platform/business-record/contracts";
import { patchBusinessRecord, readBusinessRecord, type WriteOptions } from "@/platform/business-record/service";
import { publishingEnabledForWorkspace, recordGoogleApprovalPolicyEnabled } from "./release";

export interface RecordGoogleEffect {
  tenantId: string;
  locationId: string;
  kind: "hours" | "info";
  status: "needs_approval" | "posted" | "posted_unverified" | "failed";
  eventId?: string;
  reason?: string;
}
export interface RecordChangeDeps {
  read: typeof readBusinessRecord;
  patch: typeof patchBusinessRecord;
  publishing(workspaceId: string, actor: WorkspaceActor): Promise<boolean>;
  policy(workspaceId: string, actor: WorkspaceActor): Promise<boolean>;
  locations(actor: WorkspaceActor, workspaceId: string): Promise<Array<{ tenantId: string; locationId: string }>>;
  prepare(actor: WorkspaceActor, input: { workspaceId: string; tenantId: string; locationId: string; kind: "hours" | "info"; commandId: string }): Promise<{ id: string }>;
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
  async approve(tenantId, eventId, actorId) { return (await import("@/lib/event-actions")).resolveEventAction(tenantId, eventId, "approved", actorId); },
};

/** The record commits first. Each Google effect has its own approval/receipt;
 * a provider failure never rolls back the website's source of truth. */
export async function changeRecordWithGoogle(
  actor: WorkspaceActor, workspaceId: string, expectedRevision: number, rawPatch: unknown, options: WriteOptions,
  deps: RecordChangeDeps = defaults,
): Promise<{ record: BusinessRecordWriteResult; google: RecordGoogleEffect[]; propagationError?: string }> {
  const patch = businessRecordPatchSchema.parse(rawPatch);
  const commandId = z.string().uuid().parse(options.commandId ?? randomUUID());
  const publishing = await deps.publishing(workspaceId, actor);
  if (!publishing) return { record: await deps.patch(actor, workspaceId, expectedRevision, patch, { ...options, commandId }), google: [] };
  const before = await deps.read(actor, workspaceId);
  if (options.source === "owner" && before.access !== "owner") throw new WorkspaceAccessError("Only an owner can approve a record change and its Google effects.");
  const policy = options.source === "owner" && await deps.policy(workspaceId, actor);
  const record = await deps.patch(actor, workspaceId, expectedRevision, patch, { ...options, commandId });
  if (!record.changeCount) return { record, google: [] };
  const kinds: Array<"hours" | "info"> = [];
  if (patch.facts?.hours) kinds.push("hours");
  if (["phone", "description", "links"].some(key => patch.facts?.[key])) kinds.push("info");
  if (!kinds.length) return { record, google: [] };
  let locations: Awaited<ReturnType<RecordChangeDeps["locations"]>>;
  try { locations = await deps.locations(actor, workspaceId); }
  catch { return { record, google: [], propagationError: "The record was saved. Google listings could not be read; review them before applying this change." }; }
  const google: RecordGoogleEffect[] = [];
  for (const location of locations) for (const kind of kinds) {
    const effect = { ...location, kind };
    try {
      const draft = await deps.prepare(actor, { workspaceId, ...effect, commandId });
      if (!policy) { google.push({ ...effect, eventId: draft.id, status: "needs_approval" }); continue; }
      const result = await deps.approve(location.tenantId, draft.id, actor.userId);
      google.push({ ...effect, eventId: draft.id, status: result.changed ? result.reason ? "posted_unverified" : "posted" : "failed", ...(result.reason ? { reason: result.reason } : {}) });
    } catch {
      google.push({ ...effect, status: "failed", reason: "The record was saved. This Google change remains unapplied; prepare or approve it from the listing." });
    }
  }
  return { record, google };
}

/** App-edge adapter keeps the existing details-save contract. */
export const patchRecordWithGoogle: typeof patchBusinessRecord = async (...args) => (await changeRecordWithGoogle(...args)).record;

/** Effects the form names before an owner saves. A flag flip alone is not a consent screen. */
export function recordGoogleApprovalCopy(record: BusinessRecord, enabled: boolean): string | null {
  return enabled && record.access === "owner"
    ? "Saving your phone, website or description also approves applying those facts to each connected Google listing. Google may hold a change for review. The record stays saved if Google fails."
    : null;
}
