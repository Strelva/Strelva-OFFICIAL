import { workspacePublishingScope } from "@/platform/infra/publishing-scope";
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
  /** `withdrawn`: an Undo took back a change Google never got; its waiting draft is declined and no new one is prepared. */
  status: "needs_approval" | "posted" | "posted_unverified" | "write_unconfirmed" | "already_approved" | "already_on_google" | "failed" | "withdrawn";
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
  /**
   * Declines one still-waiting Google draft this business prepared from its record, as an owner's
   * "Not yet" would. Returns where it pointed, or null when it is not this business's, not waiting
   * any more, or not the viewer's to decide. Nothing is sent to Google.
   */
  withdraw(actor: WorkspaceActor, workspaceId: string, eventId: string): Promise<{ tenantId: string; locationId: string; kind: "hours" | "info" } | null>;
}
const defaults: RecordChangeDeps = {
  read: readBusinessRecord, patch: patchBusinessRecord,
  publishing: publishingEnabledForWorkspace, policy: recordGoogleApprovalPolicyEnabled,
  async locations(actor, workspaceId) {
    const { readPublishingSnapshot } = await import("./server");
    const snapshot = await readPublishingSnapshot(actor, workspaceId);
    return snapshot.bindings.flatMap(binding => binding.locations.map(location => ({ tenantId: binding.originTenantId ?? workspacePublishingScope(workspaceId), locationId: location.locationId })));
  },
  async prepare(actor, input) { return (await import("@/products/google-listing/server")).prepareGoogleListingDraft(actor, input); },
  async approve(tenantId, eventId, actorId) { return (await tenantPublishingPorts()).resolveEventAction(tenantId, eventId, "approved", actorId); },
  async withdraw(actor, workspaceId, eventId) {
    const ports = await tenantPublishingPorts();
    const event = await ports.getEventRaw(eventId);
    const meta = event?.metadata as { kind?: unknown; workspaceId?: unknown; locationId?: unknown; draft?: { action?: unknown } } | undefined;
    const kind = meta?.draft?.action;
    if (!event || event.status !== "pending" || meta?.kind !== "workspace_google_listing_draft" || meta.workspaceId !== workspaceId || typeof meta.locationId !== "string" || (kind !== "hours" && kind !== "info")) return null;
    const { googleTargetAllowed } = await import("@/products/google-listing/server");
    if (!(await googleTargetAllowed(actor, workspaceId, event.tenantId))) return null;
    const { decideTenantEventOnce } = await import("@/server/needs-you/tenant-event-decision");
    const resolved = await decideTenantEventOnce({ tenantId: event.tenantId, eventId, workspaceId, action: "dismissed", by: { kind: "session", actor }, fallback: () => ports.resolveEventAction(event.tenantId, eventId, "dismissed", actor.userId) });
    return resolved.changed ? { tenantId: event.tenantId, locationId: meta.locationId, kind } : null;
  },
};

/** The record commits first. Each Google effect has its own approval/receipt;
 * a provider failure never rolls back the website's source of truth. */
export async function changeRecordWithGoogle(
  actor: WorkspaceActor, workspaceId: string, expectedRevision: number, rawPatch: unknown, options: WriteOptions & { googleApprovalDisclosed?: boolean; withdrawGoogleEventIds?: readonly string[] },
  deps: RecordChangeDeps = defaults,
): Promise<{ record: BusinessRecordWriteResult; google: RecordGoogleEffect[]; propagationError?: string }> {
  const patch = businessRecordPatchSchema.parse(rawPatch);
  const commandId = z.string().uuid().parse(options.commandId ?? randomUUID());
  const publishing = await deps.publishing(workspaceId, actor);
  if (!publishing) return { record: await deps.patch(actor, workspaceId, expectedRevision, patch, { ...options, commandId }), google: [] };
  const before = await deps.read(actor, workspaceId);
  if (options.source === "owner" && before.access !== "owner") throw new WorkspaceAccessError("Only an owner can approve a record change and its Google effects.");
  const policy = options.source === "owner" && options.googleApprovalDisclosed === true && await deps.policy(workspaceId, actor);
  const { withdrawGoogleEventIds, ...writeOptions } = options;
  const record = await deps.patch(actor, workspaceId, expectedRevision, patch, { ...writeOptions, commandId });
  if (!record.changeCount) return { record, google: [] };
  const kinds: Array<"hours" | "info"> = [];
  if (patch.facts && Object.hasOwn(patch.facts, "hours")) kinds.push("hours");
  const infoFields = (["phone", "description", "links"] as const).filter(key => patch.facts && Object.hasOwn(patch.facts, key));
  if (infoFields.length) kinds.push("info");
  if (!kinds.length) return { record, google: [] };
  let locations: Awaited<ReturnType<RecordChangeDeps["locations"]>>;
  try { locations = await deps.locations(actor, workspaceId); }
  catch { return { record, google: [], propagationError: "The record was saved. Google listings could not be read; review them before applying this change." }; }
  // Undo of a change Google never got: decline the draft still waiting for it instead of preparing a second, opposite one.
  const withdrawn = new Map<string, string>();
  if (options.source === "owner" && withdrawGoogleEventIds?.length) for (const eventId of new Set(withdrawGoogleEventIds)) {
    try {
      const target = await deps.withdraw(actor, workspaceId, eventId);
      if (target) withdrawn.set(`${target.tenantId}\u0000${target.locationId}\u0000${target.kind}`, eventId);
    } catch { /* Left waiting: a fresh draft below says what Google should show now. */ }
  }
  const google: RecordGoogleEffect[] = [];
  for (const location of locations) for (const kind of kinds) {
    const effect = { ...location, kind };
    const withdrawnId = withdrawn.get(`${location.tenantId}\u0000${location.locationId}\u0000${kind}`);
    if (withdrawnId) { google.push({ ...effect, eventId: withdrawnId, status: "withdrawn" }); continue; }
    let approvalAttempted = false;
    try {
      const draft = await deps.prepare(actor, { workspaceId, ...effect, commandId, expectedRecordRevision: record.revision, ...(kind === "info" ? { infoFields } : {}) });
      if (draft.status === "approved") { google.push({ ...effect, eventId: draft.id, status: "already_approved" }); continue; }
      if (draft.status === "dismissed") { google.push({ ...effect, eventId: draft.id, status: "failed", reason: "This Google change was declined. Review the listing before preparing another." }); continue; }
      if (!policy) { google.push({ ...effect, eventId: draft.id, status: "needs_approval" }); continue; }
      approvalAttempted = true;
      const result = await deps.approve(location.tenantId, draft.id, actor.userId);
      const status = result.changed ? result.reason === "already_on_google" ? "already_on_google" : result.reason ? "posted_unverified" : "posted" : result.reason === "already_resolved" ? "already_approved" : ["google_write_unconfirmed", "action_reconciliation_required"].includes(result.reason ?? "") ? "write_unconfirmed" : "failed";
      google.push({ ...effect, eventId: draft.id, status, ...(result.reason ? { reason: result.reason } : {}) });
    } catch {
      google.push({ ...effect, status: approvalAttempted ? "write_unconfirmed" : "failed", reason: approvalAttempted ? "The record was saved. Google's result could not be confirmed. Check the listing and receipt before preparing another change." : "The record was saved. This Google change remains unapplied; prepare or approve it from the listing." });
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
  if (result.google.some(effect => effect.status === "posted_unverified" || effect.status === "write_unconfirmed" || effect.status === "already_approved")) return "unconfirmed";
  if (result.google.every(effect => effect.status === "withdrawn")) return null;
  return "confirmed";
}
