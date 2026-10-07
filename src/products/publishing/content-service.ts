import { publishingWorkspaceId } from "@/platform/infra/publishing-scope";
import { z } from "zod";
import { tenantPublishingPorts } from "@/platform/infra/tenant-publishing";
import type { UnifiedEvent } from "@/platform/infra/event-contract";
import { COLLECTION_TYPES, validateEntryData, type CollectionType } from "@/platform/infra/collection-types";

import { canonicalJson, sha256 } from "@/platform/business-record/tenant-import";
import { authorizePublishingEvent } from "./authority";
import { publishingEnabledForWorkspace } from "./release";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import { getSupabase } from "@/platform/infra/db/client";

export const COLLECTION_PUBLISH = "workspace_collection_publish";
export const NEWSLETTER_ISSUE = "workspace_newsletter_issue";
const collectionType = z.enum(["blog", "video", "product"]);
export const contentDraftSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("collection"), type: collectionType, slug: z.string().regex(/^[a-z0-9-]{1,80}$/).optional(), status: z.enum(["draft", "published"]).optional(), data: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ kind: z.literal("newsletter"), subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(12000) }).strict(),
]);
export type ContentDraft = z.infer<typeof contentDraftSchema>;
export interface ContentTarget { workspaceId: string; systemId: string; tenantId: string; kind: "website" | "newsletter"; actor?: WorkspaceActor }
interface Baseline { status: string; data: unknown }
export interface ContentPorts {
  enabled(workspaceId: string, actor?: WorkspaceActor | null): Promise<boolean>;
  authorize(input: { tenantId: string; event: UnifiedEvent; actorId: string }): Promise<{ allowed: boolean; reason?: string; actor?: WorkspaceActor | null }>;
  entry(tenant: string, type: CollectionType, slug: string, systemId?: string): Promise<Baseline | null>;
  add(event: Omit<UnifiedEvent, "id" | "createdAt">): Promise<UnifiedEvent>;
  publish(input: Record<string, unknown>): Promise<{ receiptId: string; verified: boolean }>;
  approveIssue(input: Record<string, unknown>): Promise<{ receiptId: string; verified: boolean }>;
}

export function contentBaseline(row: Baseline | null): unknown { return row ? { status: row.status, data: row.data } : null; }
export function contentFingerprint(value: unknown): string { return sha256(canonicalJson(value)); }

async function rpc(name: string, input: Record<string, unknown>) {
  const db = getSupabase();
  if (!db) throw new Error("Publishing storage is unavailable.");
  const { data, error } = await (db as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> }).rpc(name, { p_input: input });
  if (error) {
    const detail = z.object({ message: z.string() }).safeParse(error);
    if (detail.success && detail.data.message.includes("publishing_baseline_changed")) throw new Error("publishing_baseline_changed");
    throw new Error("The publishing change could not be confirmed. Reload before trying again.");
  }
  return z.object({ receiptId: z.string().uuid(), verified: z.boolean() }).parse(data);
}
const defaultPorts: ContentPorts = {
  enabled: (workspaceId, actor) => actor ? publishingEnabledForWorkspace(workspaceId, actor) : workspaceReleaseFlagEnabled("publishing", workspaceId),
  authorize: authorizePublishingEvent,
  entry: async (scope, type, slug, systemId) => {
    const workspaceId = publishingWorkspaceId(scope);
    if (!workspaceId) return (await tenantPublishingPorts()).getEntry(scope, type, slug);
    return (await readNativeContent(workspaceId, systemId!)).find(row => row.type === type && row.slug === slug) ?? null;
  },
  add: async event => (await tenantPublishingPorts()).addEvent(event, { requirePersistence: true }),
  publish: input => rpc(publishingWorkspaceId(String(input.tenantId)) ? "publish_native_workspace_collection" : "publish_workspace_collection", input),
  approveIssue: input => rpc(publishingWorkspaceId(String(input.tenantId)) ? "approve_native_workspace_newsletter_issue" : "approve_workspace_newsletter_issue", input),
};

/** Compose a proposed output without touching the live collection or sending mail.
 * The immutable event is the existing governed-work/Needs you approval source. */
export async function prepareContentDraft(target: ContentTarget, raw: unknown, ports: ContentPorts = defaultPorts): Promise<UnifiedEvent> {
  if (!(await ports.enabled(target.workspaceId, target.actor))) throw new Error("Publishing is not enabled for this business.");
  const draft = contentDraftSchema.parse(raw);
  if ((draft.kind === "newsletter") !== (target.kind === "newsletter")) throw new Error("This output belongs to a different System.");
  let payload: Record<string, unknown>; let title: string; let body: string;
  if (draft.kind === "collection") {
    const parsed = validateEntryData(draft.type, draft.data);
    if (!parsed.success) throw parsed.error;
    const data = parsed.data as Record<string, unknown>;
    if (Buffer.byteLength(JSON.stringify(data)) > 12000) throw new Error("This entry is too large to review safely.");
    const slug = draft.slug ?? String(data[COLLECTION_TYPES[draft.type].titleField]).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
    z.string().regex(/^[a-z0-9-]{1,80}$/).parse(slug);
    const before = contentBaseline(await ports.entry(target.tenantId, draft.type, slug, target.systemId));
    payload = { type: draft.type, slug, data, before, baselineHash: contentFingerprint(before), ...(draft.status ? { status: draft.status } : {}) };
    title = `${draft.status === "draft" ? "Unpublish" : "Publish"} ${COLLECTION_TYPES[draft.type].label.toLowerCase()}: ${String(data[COLLECTION_TYPES[draft.type].titleField]).slice(0, 160)}`;
    body = JSON.stringify(data, null, 2);
  } else {
    payload = { subject: draft.subject, body: draft.body };
    title = `Approve newsletter: ${draft.subject}`; body = draft.body;
  }
  return ports.add({ tenantId: target.tenantId, source: "ai", type: draft.kind === "collection" ? "content_update" : "newsletter_draft", title, body, status: "pending",
    metadata: { kind: draft.kind === "collection" ? COLLECTION_PUBLISH : NEWSLETTER_ISSUE, businessId: target.workspaceId, workspaceId: target.workspaceId, systemId: target.systemId,
      reviewAudience: "owner", publishing: payload, publishingHash: contentFingerprint(payload), sendingPaused: draft.kind === "newsletter" } });
}

/** Called only inside the existing event-action claim. Provider-free newsletter
 * approval issues a permanent snapshot; a later send needs a separate gate. */
export async function executePublishingEvent(input: { tenantId: string; event: UnifiedEvent; actorId: string; attemptId: string }, ports: ContentPorts = defaultPorts): Promise<null | { accepted: boolean; reason?: string; receiptId?: string; verified?: boolean }> {
  const { event } = input;
  const kind = event.metadata?.kind;
  if (kind !== COLLECTION_PUBLISH && kind !== NEWSLETTER_ISSUE) return null;
  if (event.tenantId !== input.tenantId || event.status !== "pending") return { accepted: false, reason: "publishing_wrong_scope" };
  const metadata = event.metadata!;
  const scope = z.object({ businessId: z.string().uuid(), systemId: z.string().uuid(), publishing: z.record(z.string(), z.unknown()), publishingHash: z.string() }).safeParse(metadata);
  if (!scope.success || contentFingerprint(scope.data.publishing) !== scope.data.publishingHash) return { accepted: false, reason: "publishing_draft_changed" };
  const authority = await ports.authorize(input);
  if (!authority.allowed) return { accepted: false, reason: authority.reason ?? "publishing_approval_required" };
  if (!(await ports.enabled(scope.data.businessId, authority.actor))) return { accepted: false, reason: "publishing_disabled" };
  const { publishing } = scope.data;
  try {
    const shared = { workspaceId: scope.data.businessId, systemId: scope.data.systemId, tenantId: input.tenantId, eventId: event.id, actor: input.actorId, draftHash: scope.data.publishingHash };
    if (kind === NEWSLETTER_ISSUE) {
      const draft = contentDraftSchema.parse({ kind: "newsletter", ...publishing });
      const result = await ports.approveIssue({ ...shared, ...draft });
      return { accepted: true, reason: "newsletter_sending_paused", ...result };
    }
    const parsed = z.object({ type: collectionType, slug: z.string().regex(/^[a-z0-9-]{1,80}$/), data: z.record(z.string(), z.unknown()), before: z.unknown(), baselineHash: z.string(), status: z.enum(["draft", "published"]).optional() }).parse(publishing);
    const data = validateEntryData(parsed.type, parsed.data);
    if (!data.success) return { accepted: false, reason: "publishing_invalid" };
    // SQL first recovers this draft's accepted receipt, then checks the baseline
    // under its transaction lock for a new write. A later edit must not hide an
    // earlier acceptance or cause recovery to overwrite that later edit.
    const result = await ports.publish({ ...shared, ...parsed, data: data.data });
    return { accepted: true, ...result };
  } catch (error) { return { accepted: false, reason: error instanceof Error && error.message === "publishing_baseline_changed" ? "publishing_stale" : "publishing_storage_unconfirmed" }; }
}

export async function readContentWorkspace(target: ContentTarget) {
  const nativeWorkspace = publishingWorkspaceId(target.tenantId);
  const nativeEntries = nativeWorkspace && target.kind === "website" ? await readNativeContent(nativeWorkspace, target.systemId) : null;
  const [entries, events, outputs, receipts] = await Promise.all([
    target.kind === "website" ? Promise.all((["blog", "video", "product"] as const).map(async type => ({ type, entries: nativeEntries ? nativeEntries.filter(row => row.type === type) : await (await tenantPublishingPorts()).listEntriesForType(target.tenantId, type, { limit: 100 }) }))) : Promise.resolve([]),
    tenantPublishingPorts().then(ports => ports.getEventsRaw(target.tenantId, { limit: 100 })),
    target.kind === "newsletter" ? readNewsletterIssues(target.workspaceId, target.tenantId) : Promise.resolve([]),
    target.kind === "website" ? readCollectionReceipts(target) : Promise.resolve([]),
  ]);
  return { target, entries, drafts: events.filter(event => event.metadata?.systemId === target.systemId && [COLLECTION_PUBLISH, NEWSLETTER_ISSUE].includes(String(event.metadata?.kind))), outputs, receipts, sendingEnabled: false as const };
}

async function readNewsletterIssues(workspaceId: string, tenantId: string): Promise<unknown[]> {
  const db = getSupabase();
  if (!db) throw new Error("Publishing storage is unavailable.");
  const { data, error } = await (db as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> }).rpc(publishingWorkspaceId(tenantId) ? "read_native_workspace_newsletter_issues" : "read_workspace_newsletter_issues", publishingWorkspaceId(tenantId) ? { p_workspace_id: workspaceId } : { p_workspace_id: workspaceId, p_tenant_id: tenantId });
  if (error || !Array.isArray(data)) throw new Error("Newsletter receipts could not be loaded.");
  return data;
}

async function readCollectionReceipts(target: ContentTarget): Promise<unknown[]> {
  const db = getSupabase();
  if (!db) throw new Error("Publishing storage is unavailable.");
  const { data, error } = await (db as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> }).rpc(publishingWorkspaceId(target.tenantId) ? "read_native_workspace_collection_receipts" : "read_workspace_collection_receipts", { p_workspace_id: target.workspaceId, ...(publishingWorkspaceId(target.tenantId) ? {} : { p_tenant_id: target.tenantId }), p_system_id: target.systemId });
  if (error || !Array.isArray(data)) throw new Error("Publishing receipts could not be loaded.");
  return data;
}

/** Undo is a fresh, baseline-bound owner approval. Existing published content
 * stays live while a restore is reviewed; a first publication can be unpublished. */
export async function prepareContentRestore(target: ContentTarget, receiptId: string): Promise<UnifiedEvent> {
  const receipt = z.object({ id: z.string().uuid(), request: z.object({ type: collectionType, slug: z.string(), data: z.record(z.string(), z.unknown()) }),
    beforeState: z.object({ status: z.enum(["draft", "published"]), data: z.record(z.string(), z.unknown()) }).nullable() }).parse(
      (await readCollectionReceipts(target)).find(row => (row as { id?: string }).id === receiptId));
  return prepareContentDraft(target, { kind: "collection", type: receipt.request.type, slug: receipt.request.slug,
    data: receipt.beforeState?.data ?? receipt.request.data, status: receipt.beforeState?.status ?? "draft" });
}

async function readNativeContent(workspaceId: string, systemId: string) {
  const db = getSupabase();
  if (!db) throw new Error("Publishing storage is unavailable.");
  const { data, error } = await (db as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> }).rpc("read_native_workspace_collection", { p_workspace_id: workspaceId, p_system_id: systemId });
  if (error) throw new Error("Publishing content could not be read.");
  return z.array(z.object({ type: collectionType, slug: z.string(), status: z.string(), data: z.record(z.string(), z.unknown()) })).parse(data);
}
