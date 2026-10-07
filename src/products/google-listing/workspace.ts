import { paceGoogleWrites } from "./pacing";
import { z } from "zod";
import { tenantPublishingPorts } from "@/platform/infra/tenant-publishing";
import type { UnifiedEvent } from "@/platform/infra/event-contract";
import { canonicalJson, sha256 } from "@/platform/business-record/tenant-import";
import { getRedis } from "@/platform/infra/redis";
import { authorizePublishingEvent } from "@/products/publishing/server";
import { hasTenantPermission } from "@/platform/infra/auth";
import { readLinkedSite } from "@/platform/owner-entry/linked-sites";
import { readBusinessRecord } from "@/platform/business-record/service";
import { factValueSchemas } from "@/platform/business-record/contracts";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { publishingEnabledForWorkspace } from "@/products/publishing/server";
import { readPublishingSnapshot } from "@/products/publishing/server";
import { defaultTenantReplyDeps } from "./tenant-replies";
import { readListingControl, noteListingAccess, setListingPaused } from "./controls";
import { googleDraftInputSchema, postInputSchema, type ListingReceipt } from "./contracts";
import { createListingPost, syncHoursFromRecord, syncInfoFromRecord, undoListingChange, receiptHeadline, type ListingContext, type ListingWriteOutcome, postReviewReply, withdrawReviewReply } from "./service";
import { infoToGoogle, hoursToGoogle, type RecordInfo } from "./record";

const infoSchema = z.object({ phone: factValueSchemas.phone.nullable().optional(), description: factValueSchemas.description.nullable().optional(), links: factValueSchemas.links.nullable().optional() }).strict();

const draftSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("hours"), hours: factValueSchemas.hours }),
  z.object({ action: z.literal("info"), record: infoSchema }),
  z.object({ action: z.literal("post"), post: postInputSchema }),
]);
const metadataSchema = z.object({ kind: z.literal("workspace_google_listing_draft"), workspaceId: z.string().uuid(), locationId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), draft: draftSchema });

/** Existing approval events own the exact frozen copy, never a separate approval store. */
export async function prepareGoogleListingDraft(actor: WorkspaceActor, raw: z.infer<typeof googleDraftInputSchema>): Promise<UnifiedEvent> {
  const input = googleDraftInputSchema.parse(raw);
  if (!(await publishingEnabledForWorkspace(input.workspaceId, actor))) throw new Error("Publishing is not enabled for this business.");
  const site = await readLinkedSite(actor, input.workspaceId, input.tenantId);
  if (!site || !(await hasTenantPermission(input.tenantId, "publishing:manage"))) throw new Error("Only an authorized owner can prepare Google changes.");
  const snapshot = await readPublishingSnapshot(actor, input.workspaceId);
  const binding = snapshot.bindings.find(row => row.originTenantId === input.tenantId && row.locations.some(location => location.locationId === input.locationId));
  if (!binding) throw new Error("This Google listing does not belong to this website.");
  if ((await readListingControl(input.workspaceId, input.locationId)).paused) throw new Error("The Google listing is paused.");
  const record = await readBusinessRecord(actor, input.workspaceId);
  if (input.expectedRecordRevision !== undefined && record.revision !== input.expectedRecordRevision) throw new Error("Your record changed before this Google draft could be prepared. Nothing was approved on Google.");
  let draft: z.infer<typeof draftSchema>;
  if (input.kind === "post") draft = { action: "post", post: postInputSchema.parse(input.post) };
  else if (input.kind === "hours") draft = { action: "hours", hours: factValueSchemas.hours.parse(record.facts.hours?.value) };
  else {
    const info: RecordInfo = {};
    for (const key of input.infoFields ?? ["phone", "description", "links"] as const) {
      const value = record.facts[key]?.value;
      if (value !== undefined) Object.assign(info, { [key]: factValueSchemas[key].parse(value) });
      else if (input.infoFields?.includes(key)) Object.assign(info, { [key]: null });
    }
    if (!infoToGoogle(info).updateMask.length) throw new Error("Add your phone, website or description to Business details first.");
    draft = { action: "info", record: info };
  }
  const display = draft.action === "hours" ? hoursToGoogle(draft.hours) : draft.action === "info" ? infoToGoogle(draft.record).body : draft.post;
  const digest = sha256(canonicalJson({ tenantId: input.tenantId, locationId: input.locationId, draft, revision: record.revision }));
  const redis = input.commandId ? getRedis() : null;
  const commandKey = input.commandId ? `google-listing-draft:${input.workspaceId}:${input.commandId}:${input.locationId}:${input.kind}` : null;
  if (commandKey) {
    if (!redis) throw new Error("Draft persistence is unavailable.");
    const prior = await redis.get<{ digest: string; eventId?: string }>(commandKey);
    if (prior) {
      if (prior.digest !== digest) throw new Error("This command already prepared a different draft.");
      const event = prior.eventId ? await (await tenantPublishingPorts()).getEventRaw(prior.eventId) : null;
      if (event) return event;
      throw new Error("This draft needs reconciliation. Nothing was prepared again.");
    }
    const reserved = await redis.set(commandKey, { digest }, { nx: true, ex: 90 * 24 * 60 * 60 });
    if (!reserved) throw new Error("This draft is already being prepared.");
  }
  const event = await (await tenantPublishingPorts()).addEvent({ tenantId: input.tenantId, source: "google", type: "content_update", title: draft.action === "post" ? "Review your Google post" : `Review your Google ${draft.action}`, body: JSON.stringify(display, null, 2), status: "pending", metadata: { kind: "workspace_google_listing_draft", workspaceId: input.workspaceId, locationId: input.locationId, draft, reviewAudience: "owner", recordRevision: record.revision } }, { requirePersistence: true });
  if (commandKey && redis) await redis.set(commandKey, { digest, eventId: event.id }, { ex: 90 * 24 * 60 * 60 });
  return event;
}

export function isGoogleListingEvent(event: UnifiedEvent): boolean { return event.metadata?.kind === "workspace_google_listing_draft"; }

export async function tenantListingContext(tenantId: string, workspaceId: string, locationId: string): Promise<ListingContext> {
  const deps = await defaultTenantReplyDeps();
  const target = await deps.bindingTarget(tenantId);
  if (target?.workspaceId !== workspaceId) throw new Error("The Google listing is not linked to this business.");
  const grant = await deps.grant(tenantId);
  if (!grant || grant.status !== "connected") throw new Error("Google disconnected. Reconnect Google to continue.");
  const { readGoogleBindingForTenant } = await import("@/platform/account-bindings/store");
  const binding = await readGoogleBindingForTenant(tenantId);
  const saved = binding?.workspaceId === workspaceId ? binding.locations.find(location => location.locationId === locationId) : undefined;
  const fallback = saved ? null : await deps.location(tenantId, grant);
  const location = saved ?? (fallback?.locationId.replace(/^locations\//, "") === locationId ? fallback : null);
  if (!location) throw new Error("The Google location changed. Prepare a new draft.");
  const control = await readListingControl(workspaceId, locationId);
  const token = await deps.accessToken(grant);
  if (!token) throw new Error("Reconnect Google to continue.");
  return { workspaceId, bindingId: grant.bindingId ?? null, lifecycle: control.paused ? "paused" : "live", location: { accountId: location.accountId, locationId }, client: paceGoogleWrites(deps.client(token), workspaceId, locationId), receipts: deps.receipts() };
}

export type GoogleExecutionResult = { accepted: boolean; verified?: boolean; receiptId?: string; reason?: string };
/** The event action claims/settles the shared event. This executor owns only the Google effect. */
export async function executeGoogleListingEvent(input: { tenantId: string; event: UnifiedEvent; actorId: string; attemptId: string }): Promise<GoogleExecutionResult | null> {
  if (!isGoogleListingEvent(input.event)) return null;
  const metadata = metadataSchema.parse(input.event.metadata);
  if (input.event.tenantId !== input.tenantId || input.actorId === "auto-reply-policy") return { accepted: false, reason: "permission_denied" };
  const authorization = await authorizePublishingEvent({ ...input, event: { ...input.event, metadata: { ...input.event.metadata, businessId: metadata.workspaceId } } });
  if (!authorization.allowed) return { accepted: false, reason: authorization.reason };
  if (metadata.draft.action !== "post") {
    const { getSupabase } = await import("@/platform/infra/db/client");
    const db = getSupabase();
    if (!db) return { accepted: false, reason: "record_unavailable" };
    const { data, error } = await (db as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> }).rpc("check_google_listing_record_revision", { p_workspace_id: metadata.workspaceId, p_revision: input.event.metadata?.recordRevision });
    if (error || data !== true) return { accepted: false, reason: "Your business details changed. Prepare a fresh Google draft." };
  }
  const ctx = await tenantListingContext(input.tenantId, metadata.workspaceId, metadata.locationId);
  ctx.onWriteAccepted = async () => (await tenantPublishingPorts()).markExecutionExternalAccepted(input.event.id);
  ctx.onWriteUnconfirmed = async () => (await tenantPublishingPorts()).markExecutionExternalUnconfirmed(input.event.id);
  let accepted = false;
  const base = ctx.client;
  ctx.client = { ...base, patchLocation: async (...args) => { const result = await base.patchLocation(...args); if (result.ok) accepted = true; return result; }, createPost: async (...args) => { const result = await base.createPost(...args); if (result.ok) accepted = true; return result; } };
  try {
    const authority = { kind: "owner_approval" as const, actor: input.actorId, approvalRef: input.event.id };
    const idempotencyKey = `google-draft:${input.event.id}:${input.attemptId}`;
    const draft = metadata.draft;
    const outcome = draft.action === "hours" ? await syncHoursFromRecord(ctx, { hours: draft.hours, authority, idempotencyKey }) : draft.action === "info" ? await syncInfoFromRecord(ctx, { record: draft.record, authority, idempotencyKey }) : await createListingPost(ctx, { post: draft.post, authority, idempotencyKey });
    if (outcome.status === "write_unconfirmed") return { accepted: false, reason: "google_write_unconfirmed", receiptId: outcome.receipt.id };
    if (outcome.status === "refused" && outcome.reason === "nothing_to_change") return { accepted: true, verified: true, reason: "already_on_google" };
    await noteListingAccess(ctx.workspaceId, ctx.location.locationId, outcome.status === "failed" ? outcome.accessPending : outcome.status === "refused" && outcome.reason === "api_access_pending");
    if (outcome.status === "refused") return { accepted: false, reason: outcome.reason };
    return { accepted: outcome.status !== "failed", verified: outcome.status === "posted", receiptId: outcome.receipt.id, reason: outcome.status === "failed" ? outcome.message : undefined };
  } catch (error) {
    if (accepted) return { accepted: true, verified: false, reason: "Google accepted the change; its receipt needs reconciliation." };
    throw error;
  }
}

export async function undoWorkspaceGoogleChange(actor: WorkspaceActor, input: { workspaceId: string; tenantId: string; locationId: string; receiptId: string }): Promise<ListingWriteOutcome> {
  if (!(await publishingEnabledForWorkspace(input.workspaceId, actor)) || !(await readLinkedSite(actor, input.workspaceId, input.tenantId)) || !(await hasTenantPermission(input.tenantId, "publishing:manage"))) throw new Error("Only an authorized owner can undo this Google change.");
  if ((await readBusinessRecord(actor, input.workspaceId)).access !== "owner") throw new Error("This Google change needs the business owner's instruction.");
  return undoListingChange(await tenantListingContext(input.tenantId, input.workspaceId, input.locationId), { receiptId: input.receiptId, authority: { kind: "owner_undo", actor: actor.userId } });
}

export async function readWorkspaceGoogle(actor: WorkspaceActor, workspaceId: string) {
  const snapshot = await readPublishingSnapshot(actor, workspaceId);
  const { readLinkedSites } = await import("@/platform/owner-entry/linked-sites");
  const { sites } = await readLinkedSites(actor, workspaceId);
  const allowed = new Set(sites.map(site => site.tenantId));
  const owner = (await readBusinessRecord(actor, workspaceId)).access === "owner";
  return Promise.all(snapshot.bindings.filter(binding => binding.originTenantId && allowed.has(binding.originTenantId)).flatMap(binding => binding.locations.map(async location => {
    const tenantId = binding.originTenantId!;
    const [control, events, canManage] = await Promise.all([readListingControl(workspaceId, location.locationId), tenantPublishingPorts().then(ports => ports.getEvents(tenantId, { limit: 1000, status: "pending" })), hasTenantPermission(tenantId, "publishing:manage")]);
    const receipts = snapshot.receipts.filter(receipt => receipt.locationId === location.locationId && receipt.bindingId === binding.id) as unknown as ListingReceipt[];
    return { tenantId, locationId: location.locationId, name: location.title ?? "Google listing", control, canManage: owner && canManage, connected: binding.status === "connected", drafts: events.filter(event => isGoogleListingEvent(event) && event.metadata?.workspaceId === workspaceId && event.metadata?.locationId === location.locationId).map(event => ({ id: event.id, title: event.title, body: event.body })), receipts: receipts.map(receipt => ({ id: receipt.id, headline: receiptHeadline(receipt), before: receipt.before, after: receipt.after, authority: receipt.authority, readback: receipt.readback, status: receipt.status, undo: Boolean(receipt.undo) && ["posted", "posted_unverified", "held_by_google"].includes(receipt.status) })) };
  })));
}
export { setListingPaused };

export async function changeWorkspaceGoogleReply(actor: WorkspaceActor, input: { workspaceId: string; tenantId: string; locationId: string; reviewId: string; text?: string; withdraw: boolean }): Promise<ListingWriteOutcome> {
  if (!(await publishingEnabledForWorkspace(input.workspaceId, actor)) || !(await readLinkedSite(actor, input.workspaceId, input.tenantId)) || !(await hasTenantPermission(input.tenantId, "publishing:manage"))) throw new Error("Only an authorized owner can change a Google reply.");
  if ((await readBusinessRecord(actor, input.workspaceId)).access !== "owner") throw new Error("This reply needs the business owner's instruction.");
  const ctx = await tenantListingContext(input.tenantId, input.workspaceId, input.locationId);
  const authority = { kind: "owner_approval" as const, actor: actor.userId };
  const outcome = await (input.withdraw ? withdrawReviewReply(ctx, { reviewId: input.reviewId, authority }) : postReviewReply(ctx, { reviewId: input.reviewId, text: input.text ?? "", authority }));
  if (["posted", "posted_unverified", "held_by_google"].includes(outcome.status)) {
    try { await (await tenantPublishingPorts()).mirrorPublishedReviewReply(input.tenantId, input.reviewId, input.withdraw ? null : input.text ?? ""); }
    catch { outcome.message += " Google accepted it; the workspace review copy needs reconciliation."; }
  }
  return outcome;
}
