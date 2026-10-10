import { nativeGoogleGrantGeneration, assertCurrentNativeGoogleGrant } from "./native/contracts";
import { nativeGoogleGrantPinSchema } from "@/platform/make-real/google-provider-reference";
import { assertGoogleDispatchGrant } from "./dispatch-grant";
import { decryptSecret } from "@/platform/infra/crypto/secrets";
import { maintenancePinSchema, checkBundleMaintenanceEvent } from "./maintenance";
import { googleVersionPinSchema, googleVersionDraftCurrent, type GoogleVersionPin } from "./versions";
import { systemsReleasedFor, systemsReleaseEnabledForWorkspace } from "@/platform/systems-release";
import { publishingWorkspaceId, workspacePublishingScope } from "@/platform/infra/publishing-scope";
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
import { assertActingAgency } from "@/platform/workspaces/acting-provider";
import { publishingEnabledForWorkspace } from "@/products/publishing/server";
import { readPublishingSnapshot } from "@/products/publishing/server";
import { defaultTenantReplyDeps } from "./tenant-replies";
import { readListingControl, noteListingAccess, setListingPaused } from "./controls";
import { googleDraftInputSchema, postInputSchema, type ListingReceipt } from "./contracts";
import { createListingPost, syncHoursFromRecord, syncInfoFromRecord, undoListingChange, receiptHeadline, type ListingContext, type ListingWriteOutcome, postReviewReply, withdrawReviewReply } from "./service";
import { infoToGoogle, hoursToGoogle, type RecordInfo } from "./record";

const infoSchema = z.object({ phone: factValueSchemas.phone.nullable().optional(), description: factValueSchemas.description.nullable().optional(), links: factValueSchemas.links.nullable().optional() }).strict();

const draftSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("hours"), hours: factValueSchemas.hours.nullable() }),
  z.object({ action: z.literal("info"), record: infoSchema }),
  z.object({ action: z.literal("post"), post: postInputSchema }),
  z.object({ action: z.literal("reply"), reviewId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/), text: z.string().min(1).max(4096) }),
]);
const metadataSchema = z.object({ kind: z.literal("workspace_google_listing_draft"), workspaceId: z.string().uuid(), locationId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), draft: draftSchema, version: googleVersionPinSchema.optional(), maintenance: maintenancePinSchema.optional(), nativeGrant: nativeGoogleGrantPinSchema.optional() });

/** Existing approval events own the exact frozen copy, never a separate approval store. */
export async function prepareGoogleListingDraft(actor: WorkspaceActor, raw: z.infer<typeof googleDraftInputSchema>, version?: { pin: GoogleVersionPin; hours?: z.infer<typeof factValueSchemas.hours> | null }): Promise<UnifiedEvent> {
  const input = googleDraftInputSchema.parse(raw);
  if (!(await publishingEnabledForWorkspace(input.workspaceId, actor))) throw new Error("Publishing is not enabled for this business.");
  if (!(await googleTargetAllowed(actor, input.workspaceId, input.tenantId))) throw new Error("Only an authorized owner can prepare Google changes.");
  const snapshot = await readPublishingSnapshot(actor, input.workspaceId);
  const binding = snapshot.bindings.find(row => (row.originTenantId === input.tenantId || (!row.originTenantId && publishingWorkspaceId(input.tenantId) === input.workspaceId)) && row.locations.some(location => location.locationId === input.locationId));
  if (version && (binding?.id !== version.pin.bindingId || !(await systemsReleasedFor(actor, input.workspaceId)))) throw new Error("This Google Version is unavailable.");
  if (!binding) throw new Error("This Google listing does not belong to this website.");
  if ((await readListingControl(input.workspaceId, input.locationId)).paused) throw new Error("The Google listing is paused.");
  let nativeGrant: z.infer<typeof nativeGoogleGrantPinSchema> | undefined;
  if (publishingWorkspaceId(input.tenantId)) {
    const { readGoogleBindingForTenant } = await import("@/platform/account-bindings/store");
    const native = await readGoogleBindingForTenant(input.tenantId);
    const location = native?.locations.find(item => item.locationId === input.locationId);
    if (!native || !location || !native.subject) throw new Error("Reconnect the exact native Google account before preparing this draft.");
    nativeGrant = { bindingId: native.id, accountId: location.accountId, grantGeneration: nativeGoogleGrantGeneration(native) };
    await assertCurrentNativeGoogleGrant(input.workspaceId, input.locationId, nativeGrant);
  }
  const record = await readBusinessRecord(actor, input.workspaceId);
  if (input.expectedRecordRevision !== undefined && record.revision !== input.expectedRecordRevision) throw new Error("Your record changed before this Google draft could be prepared. Nothing was approved on Google.");
  let draft: z.infer<typeof draftSchema>;
  if (input.kind === "post") draft = { action: "post", post: postInputSchema.parse(input.post) };
  else if (input.kind === "hours" && version) draft = { action: "hours", hours: factValueSchemas.hours.nullable().parse(version.hours) };
  else if (input.kind === "hours") draft = { action: "hours", hours: record.facts.hours?.value === undefined && input.expectedRecordRevision !== undefined ? null : factValueSchemas.hours.parse(record.facts.hours?.value) };
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
  if (version && !(await googleVersionDraftCurrent({ workspaceId: input.workspaceId, locationId: input.locationId, bindingId: binding.id, pin: version.pin, draft }))) throw new Error("This Google Version changed. Prepare a fresh draft.");
  const display = draft.action === "hours" ? draft.hours ? hoursToGoogle(draft.hours) : { regularHours: null, specialHours: null } : draft.action === "info" ? infoToGoogle(draft.record).body : draft.action === "post" ? draft.post : draft;
  const digest = sha256(canonicalJson({ tenantId: input.tenantId, locationId: input.locationId, draft, revision: version ? null : record.revision, ...(version ? { version: version.pin } : {}) }));
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
  const event = await (await tenantPublishingPorts()).addEvent({ tenantId: input.tenantId, source: "google", type: "content_update", title: draft.action === "post" ? "Review your Google post" : `Review your Google ${draft.action}`, body: JSON.stringify(display, null, 2), status: "pending", metadata: { kind: "workspace_google_listing_draft", workspaceId: input.workspaceId, locationId: input.locationId, draft, reviewAudience: "owner", recordRevision: record.revision, ...(nativeGrant ? { nativeGrant } : {}), ...(version ? { version: version.pin } : {}) } }, { requirePersistence: true });
  if (commandKey && redis) await redis.set(commandKey, { digest, eventId: event.id }, { ex: 90 * 24 * 60 * 60 });
  return event;
}

export function isGoogleListingEvent(event: UnifiedEvent): boolean { return event.metadata?.kind === "workspace_google_listing_draft"; }

/**
 * The context for an agency writing for the business (operator_instruction or
 * operator_undo): every such write rechecks that this person is the acting
 * provider for Google on this location (#255), before its receipt and again
 * just before the call.
 */
export function asActingAgency(ctx: ListingContext, actor: WorkspaceActor): ListingContext {
  return { ...ctx, authorizeProvider: async () => { await assertActingAgency(actor, ctx.workspaceId, { effect: "google", kind: "google_location", ref: ctx.location.locationId }); } };
}

export async function tenantListingContext(tenantId: string, workspaceId: string, locationId: string, nativeGrant?: z.infer<typeof nativeGoogleGrantPinSchema>): Promise<ListingContext> {
  const deps = await defaultTenantReplyDeps();
  const nativeWorkspace = publishingWorkspaceId(tenantId);
  const target = nativeWorkspace ? { workspaceId: nativeWorkspace } : await deps.bindingTarget(tenantId);
  if (target?.workspaceId !== workspaceId) throw new Error("The Google listing is not linked to this business.");
  const grant = await deps.grant(tenantId);
  if (!grant || grant.status !== "connected") throw new Error("Google disconnected. Reconnect Google to continue.");
  const { readGoogleBindingForTenant } = await import("@/platform/account-bindings/store");
  const binding = await readGoogleBindingForTenant(tenantId);
  const saved = binding?.workspaceId === workspaceId ? binding.locations.find(location => location.locationId === locationId) : undefined;
  const checkNative = async () => {
    if (!nativeGrant) return;
    if (nativeWorkspace !== workspaceId || grant.source !== "binding" || grant.workspaceId !== workspaceId || grant.bindingId !== nativeGrant.bindingId) throw new Error("The exact native Google grant changed.");
    const pinned = await assertCurrentNativeGoogleGrant(workspaceId, locationId, nativeGrant);
    assertGoogleDispatchGrant(grant, grant, pinned, workspaceId, locationId);
    if (decryptSecret(pinned.refreshTokenCiphertext) !== grant.refreshToken || decryptSecret(pinned.accessTokenCiphertext) !== grant.accessToken) throw new Error("The captured native Google credentials changed.");
  };
  await checkNative();
  // A native request has one pinned place; it never consults legacy metadata.
  const fallback = saved || nativeGrant ? null : await deps.location(tenantId, grant);
  const location = saved ?? (fallback?.locationId.replace(/^locations\//, "") === locationId ? fallback : null);
  if (!location || (nativeGrant && location.accountId !== nativeGrant.accountId)) throw new Error("The Google location changed. Prepare a new draft.");
  const control = await readListingControl(workspaceId, locationId);
  // Database/event awaits can outlive the captured consent. Check before refresh.
  await checkNative();
  const token = await deps.accessToken(grant);
  if (!token) throw new Error("Reconnect Google to continue.");
  await checkNative();
  if (nativeGrant && token !== grant.accessToken) throw new Error("The captured native Google access token changed.");
  const authorize = async () => {
    const current = await deps.grant(tenantId);
    const liveBinding = nativeGrant ? await assertCurrentNativeGoogleGrant(workspaceId, locationId, nativeGrant) : await readGoogleBindingForTenant(tenantId);
    assertGoogleDispatchGrant(grant, current, liveBinding, workspaceId, locationId);
  };
  const rawClient = deps.client(token);
  const client = nativeGrant ? {
    ...rawClient,
    listReviews: async (...args: Parameters<typeof rawClient.listReviews>) => { await authorize(); return rawClient.listReviews(...args); },
    getReview: async (...args: Parameters<typeof rawClient.getReview>) => { await authorize(); return rawClient.getReview(...args); },
    getLocation: async (...args: Parameters<typeof rawClient.getLocation>) => { await authorize(); return rawClient.getLocation(...args); },
    getPost: async (...args: Parameters<typeof rawClient.getPost>) => { await authorize(); return rawClient.getPost(...args); },
  } : rawClient;
  return { workspaceId, bindingId: grant.bindingId ?? null, lifecycle: control.paused ? "paused" : "live", location: { accountId: location.accountId, locationId }, client: paceGoogleWrites(client, workspaceId, locationId, undefined, authorize), receipts: deps.receipts() };
}

export type GoogleExecutionResult = { accepted: boolean; verified?: boolean; receiptId?: string; reason?: string };
/** The event action claims/settles the shared event. This executor owns only the Google effect. */
export interface GoogleListingExecutionDeps {
 authorize: typeof authorizePublishingEvent; context: typeof tenantListingContext; maintenance: typeof checkBundleMaintenanceEvent;
 events:typeof tenantPublishingPorts; noteAccess:typeof noteListingAccess;
}
export async function executeGoogleListingEvent(input: { tenantId: string; event: UnifiedEvent; actorId: string; attemptId: string }, deps:GoogleListingExecutionDeps={authorize:authorizePublishingEvent,context:tenantListingContext,maintenance:checkBundleMaintenanceEvent,events:tenantPublishingPorts,noteAccess:noteListingAccess}): Promise<GoogleExecutionResult | null> {
  if (!isGoogleListingEvent(input.event)) return null;
  const metadata = metadataSchema.parse(input.event.metadata);
  if (input.event.tenantId !== input.tenantId || input.actorId === "auto-reply-policy") return { accepted: false, reason: "permission_denied" };
  const authorization = await deps.authorize({ ...input, event: { ...input.event, metadata: { ...input.event.metadata, businessId: metadata.workspaceId } } });
  if (!authorization.allowed) return { accepted: false, reason: authorization.reason };
  if (metadata.draft.action !== "post" && !metadata.version && !metadata.maintenance) {
    const { getSupabase } = await import("@/platform/infra/db/client");
    const db = getSupabase();
    if (!db) return { accepted: false, reason: "record_unavailable" };
    const { data, error } = await (db as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> }).rpc("check_google_listing_record_revision", { p_workspace_id: metadata.workspaceId, p_revision: input.event.metadata?.recordRevision });
    if (error || data !== true) return { accepted: false, reason: "Your business details changed. Prepare a fresh Google draft." };
  }
  if (metadata.draft.action === "reply" && !metadata.maintenance) return { accepted:false, reason:"maintenance_pin_required" };
  if(metadata.maintenance) {
    if(process.env.STRELVA_BUNDLE_MAINTENANCE_RELEASE!=="1")return {accepted:false,reason:"maintenance_release_off"};
    // Fail closed before token refresh or any provider read, not only before the write.
    await deps.maintenance({preparationId:metadata.maintenance.preparationId,eventId:input.event.id,workspaceId:metadata.workspaceId,bindingId:metadata.maintenance.bindingId,locationId:metadata.locationId,draft:metadata.draft});
  }
  if (metadata.nativeGrant) await assertCurrentNativeGoogleGrant(metadata.workspaceId, metadata.locationId, metadata.nativeGrant);
  const ctx = await deps.context(input.tenantId, metadata.workspaceId, metadata.locationId, metadata.nativeGrant);
  if (metadata.version && (!(await systemsReleaseEnabledForWorkspace(metadata.workspaceId, authorization.viewer)) || !(await googleVersionDraftCurrent({ workspaceId: metadata.workspaceId, locationId: metadata.locationId, bindingId: ctx.bindingId, pin: metadata.version, draft: metadata.draft })))) return { accepted: false, reason: "This Google Version changed. Prepare a fresh draft." };
  if (metadata.maintenance) {
    const recheck = () => deps.maintenance({preparationId:metadata.maintenance!.preparationId,eventId:input.event.id,workspaceId:metadata.workspaceId,bindingId:ctx.bindingId,locationId:metadata.locationId,draft:metadata.draft});
    await recheck();
  }
  ctx.authorizeService = async () => {
    if (metadata.nativeGrant) await assertCurrentNativeGoogleGrant(metadata.workspaceId, metadata.locationId, metadata.nativeGrant);
    const current = await deps.authorize(input);
    if (!current.allowed || (input.actorId.startsWith("make-real-service:") && current.bindingId !== ctx.bindingId)) throw new Error("Google service authority ended before dispatch.");
    if (metadata.maintenance) await deps.maintenance({preparationId:metadata.maintenance.preparationId,eventId:input.event.id,workspaceId:metadata.workspaceId,bindingId:ctx.bindingId,locationId:metadata.locationId,draft:metadata.draft});
  };
  let accepted = false;
  ctx.onWriteAccepted = async () => {
    // Observe the accepted provider response before any persistence can fail.
    accepted = true;
    await (await deps.events()).markExecutionExternalAccepted(input.event.id);
  };
  ctx.onWriteUnconfirmed = async () => (await deps.events()).markExecutionExternalUnconfirmed(input.event.id);
  try {
    const authority = { kind: "owner_approval" as const, actor: input.actorId, approvalRef: input.event.id };
    // The approval owns the write, even if saving the event marker fails.
    // A durable rejection permits a retry; uncertainty always blocks it.
    const idempotencyKey = `google-draft:${input.event.id}`;
    const draft = metadata.draft;
    const outcome = draft.action === "hours" ? await syncHoursFromRecord(ctx, { hours: draft.hours, authority, idempotencyKey, retryFailed: true }) : draft.action === "info" ? await syncInfoFromRecord(ctx, { record: draft.record, authority, idempotencyKey, retryFailed: true }) : draft.action === "reply" ? await postReviewReply(ctx, {reviewId:draft.reviewId,text:draft.text,authority,idempotencyKey,retryFailed:true}) : await createListingPost(ctx, { post: draft.post, authority, idempotencyKey, retryFailed: true });
    if (outcome.status === "write_unconfirmed") return { accepted: false, reason: "google_write_unconfirmed", receiptId: outcome.receipt.id };
    if (outcome.status === "refused" && outcome.reason === "nothing_to_change") return { accepted: true, verified: true, reason: "already_on_google" };
    await deps.noteAccess(ctx.workspaceId, ctx.location.locationId, outcome.status === "failed" ? outcome.accessPending : outcome.status === "refused" && outcome.reason === "api_access_pending");
    if (outcome.status === "refused") return { accepted: false, reason: outcome.reason };
    return { accepted: outcome.status !== "failed", verified: outcome.status === "posted", receiptId: outcome.receipt.id, reason: outcome.status === "failed" ? outcome.message : undefined };
  } catch (error) {
    if (accepted) return { accepted: true, verified: false, reason: "Google accepted the change; its receipt needs reconciliation." };
    throw error;
  }
}

export async function undoWorkspaceGoogleChange(actor: WorkspaceActor, input: { workspaceId: string; tenantId: string; locationId: string; receiptId: string; nativeGrant?: z.infer<typeof nativeGoogleGrantPinSchema> }): Promise<ListingWriteOutcome> {
  if (!(await publishingEnabledForWorkspace(input.workspaceId, actor)) || !(await googleTargetAllowed(actor, input.workspaceId, input.tenantId))) throw new Error("Only an authorized owner can undo this Google change.");
  if ((await readBusinessRecord(actor, input.workspaceId)).access !== "owner") throw new Error("This Google change needs the business owner's instruction.");
  return undoListingChange(await tenantListingContext(input.tenantId, input.workspaceId, input.locationId, input.nativeGrant), { receiptId: input.receiptId, authority: { kind: "owner_undo", actor: actor.userId }, retryFailed: true });
}

export async function readWorkspaceGoogle(actor: WorkspaceActor, workspaceId: string) {
  const snapshot = await readPublishingSnapshot(actor, workspaceId);
  const { readLinkedSites } = await import("@/platform/owner-entry/linked-sites");
  const { sites } = await readLinkedSites(actor, workspaceId);
  const allowed = new Set(sites.map(site => site.tenantId));
  const owner = (await readBusinessRecord(actor, workspaceId)).access === "owner";
  return Promise.all(snapshot.bindings.filter(binding => (binding.originTenantId ? allowed.has(binding.originTenantId) : true)).flatMap(binding => binding.locations.map(async location => {
    const tenantId = binding.originTenantId ?? workspacePublishingScope(workspaceId);
    const [control, events, canManage] = await Promise.all([readListingControl(workspaceId, location.locationId), tenantPublishingPorts().then(ports => ports.getEvents(tenantId, { limit: 1000, status: "pending" })), binding.originTenantId ? hasTenantPermission(tenantId, "publishing:manage") : Promise.resolve(owner)]);
    const receipts = snapshot.receipts.filter(receipt => receipt.locationId === location.locationId && receipt.bindingId === binding.id) as unknown as ListingReceipt[];
    return { tenantId, locationId: location.locationId, name: location.title ?? "Google listing", control, canManage: owner && canManage, connected: binding.status === "connected", drafts: events.filter(event => isGoogleListingEvent(event) && event.metadata?.workspaceId === workspaceId && event.metadata?.locationId === location.locationId).map(event => ({ id: event.id, title: event.title, body: event.body })), receipts: receipts.map(receipt => ({ id: receipt.id, headline: receiptHeadline(receipt), before: receipt.before, after: receipt.after, authority: receipt.authority, readback: receipt.readback, status: receipt.status, undo: Boolean(receipt.undo) && ["posted", "posted_unverified", "held_by_google"].includes(receipt.status) })) };
  })));
}
export { setListingPaused };

export async function changeWorkspaceGoogleReply(actor: WorkspaceActor, input: { workspaceId: string; tenantId: string; locationId: string; reviewId: string; text?: string; withdraw: boolean; commandId: string }): Promise<ListingWriteOutcome> {
  if (!(await publishingEnabledForWorkspace(input.workspaceId, actor)) || !(await googleTargetAllowed(actor, input.workspaceId, input.tenantId))) throw new Error("Only an authorized owner can change a Google reply.");
  if ((await readBusinessRecord(actor, input.workspaceId)).access !== "owner") throw new Error("This reply needs the business owner's instruction.");
  const ctx = await tenantListingContext(input.tenantId, input.workspaceId, input.locationId);
  const authority = { kind: "owner_approval" as const, actor: actor.userId };
  const idempotencyKey = `reply-command:${input.workspaceId}:${z.string().uuid().parse(input.commandId)}`;
  const outcome = await (input.withdraw ? withdrawReviewReply(ctx, { reviewId: input.reviewId, authority, idempotencyKey, retryFailed: true }) : postReviewReply(ctx, { reviewId: input.reviewId, text: input.text ?? "", authority, idempotencyKey, retryFailed: true }));
  if (!publishingWorkspaceId(input.tenantId) && ["posted", "posted_unverified", "held_by_google"].includes(outcome.status)) {
    try { await (await tenantPublishingPorts()).mirrorPublishedReviewReply(input.tenantId, input.reviewId, input.withdraw ? null : input.text ?? ""); }
    catch { outcome.message += " Google accepted it; the workspace review copy needs reconciliation."; }
  }
  return outcome;
}

/** A native target is the checked business, not an invented legacy tenant. */
export async function googleTargetAllowed(actor: WorkspaceActor, workspaceId: string, scope: string): Promise<boolean> {
  const nativeWorkspace = publishingWorkspaceId(scope);
  if (nativeWorkspace) return nativeWorkspace === workspaceId && (await readBusinessRecord(actor, workspaceId)).access === "owner";
  return !!await readLinkedSite(actor, workspaceId, scope) && await hasTenantPermission(scope, "publishing:manage");
}

/** @deprecated Use asActingAgency. */
export const asActingProvider = asActingAgency;
