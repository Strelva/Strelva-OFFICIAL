import { workspacePublishingScope } from "@/platform/infra/publishing-scope";
import { releaseFlagMayBeOn } from "@/platform/release-flags/resolve";
/**
 * One adapter per source lifecycle. An adapter turns the source's pending
 * asks into Needs you items and resolves a decision through the source's OWN
 * resolver: there is no second write path. Needs you owns the policy, the
 * item, delivery and expiry; the lifecycle owns the change.
 *
 * Built: tenant events (resolveEventAction: review replies, Google drafts,
 * content previews, newsletters, inquiry message reviews, structural asks,
 * offboarding) and service-request delivery commitments (agree scope, accept
 * result). The other lifecycles in the spec's section 6 table are not wired
 * yet; their asks stay on their own screens.
 */
import { createHash } from "node:crypto";
import type { UnifiedEvent } from "@/lib/types";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { ServiceRequest } from "@/platform/service-requests/types";
import { KIND_RULES, OWNER_ONLY_KINDS, isConfigurableKind, type ChangeKind, type Decision, type OwnerDecision, type ProposedItem, type SourceLifecycle } from "./contracts";
import { classifyTenantEvent, observedTenantRoute, tenantEventRevision } from "./tenant-classify";
import type { ServiceSession } from "./service-actor";

export interface AdapterContext {
  workspaceId: string;
  /** Present when a signed-in member is looking; some sources can only be read as a member. */
  actor?: WorkspaceActor;
  /**
   * Set only by the hourly cron: `actor` is then Strelva (system)'s read
   * identity for this business (service-actor.ts), good for propose and
   * currentRevision. It never reaches `resolve`: deciding takes the owner's
   * signed link or session.
   */
  service?: ServiceSession;
}

export type ResolveBy =
  /**
   * `service` is set only for a lifecycle that runs an owner's link decision
   * without an owner account (`ownerLinkWithoutAccount`): `actor` is then
   * Strelva (system)'s identity under a `make_real_link` session bound to
   * this item, and the owner stays the approver of record.
   */
  | { kind: "owner_link"; recipient: string; actor: WorkspaceActor | null; service?: ServiceSession }
  | { kind: "session"; actor: WorkspaceActor }
  | { kind: "expiry" };

export interface ResolveOutcome {
  outcome: "done" | "done_unverified" | "failed";
  reason?: string;
  receiptRef?: string;
}

export interface SourceAdapter {
  lifecycle: SourceLifecycle;
  /** Resolving needs a member identity (a workspace RPC), not just the owner recipient. */
  needsMemberActor: boolean;
  /**
   * An owner with no account may still decide this by signed link: Strelva
   * (system) reads and runs it under a session bound to the item
   * (owner-entry decision 6; Make real only). Never for access, money or exit.
   */
  ownerLinkWithoutAccount?: boolean;
  /** Pending asks for this business. `complete: false` means some sources could not be read. */
  propose(ctx: AdapterContext): Promise<{ items: ProposedItem[]; complete: boolean }>;
  /** The source's current revision, or null when it is no longer waiting on anyone. */
  currentRevision(ctx: AdapterContext, sourceId: string): Promise<string | null>;
  /** Optional: why a source stopped waiting (it lapsed on its own clock, the customer cancelled), for the withdrawn item. */
  goneReason?(ctx: AdapterContext, sourceId: string): Promise<string | null>;
  resolve(ctx: AdapterContext, item: OwnerDecision, decision: Decision, by: ResolveBy): Promise<ResolveOutcome>;
}

const EFFECTS: Partial<Record<ChangeKind, [string, string]>> = {
  "review.reply": ["Strelva posts this reply on Google.", "Nothing is posted."],
  "review.reply_critical": ["Strelva posts this reply on Google.", "Nothing is posted."],
  "customer.message": ["The message sends.", "Nothing sends."],
  "customer.commitment": ["The message sends with this commitment.", "Nothing sends."],
  "customer.broadcast": ["The newsletter sends to your list.", "Nothing sends."],
  "google.post": ["The post goes up on your Google listing.", "Nothing is posted."],
  "google.photo": ["The photo goes up on your Google listing.", "Nothing is posted."],
  "fact.inferred": ["Strelva uses this detail everywhere it appears.", "Nothing changes."],
  "copy.routine": ["The change goes live on your website.", "Your website stays as it is."],
  "copy.marketing": ["The new copy goes live on your website.", "Your website stays as it is."],
  structure: ["Strelva starts this change to your website.", "Your website stays as it is."],
  "system.go_live": ["It goes live.", "Nothing goes live."],
  "system.change_live": ["The change goes live.", "Nothing changes."],
  exit: ["Strelva prepares your handoff.", "Nothing changes."],
  "request.scope": ["The work is agreed and starts.", "Nothing starts; it waits for you."],
};

function effects(kind: ChangeKind): [string, string] {
  return EFFECTS[kind] ?? ["Strelva makes this change.", "Nothing changes."];
}

function urgentFor(kind: ChangeKind): boolean {
  return isConfigurableKind(kind) && KIND_RULES[kind].urgent;
}

// Tenant events -------------------------------------------------------------------

export interface TenantEventPorts {
  linkedTenants(workspaceId: string): Promise<string[]>;
  pendingEvents(tenantId: string): Promise<UnifiedEvent[]>;
  readEvent(eventId: string): Promise<UnifiedEvent | null>;
  resolveEventAction(tenantId: string, eventId: string, action: "approved" | "dismissed", actorId: string): Promise<{ changed: boolean; reason?: string }>;
}

function splitTenantSource(sourceId: string): { tenantId: string; eventId: string } | null {
  const at = sourceId.indexOf(":");
  if (at <= 0 || at === sourceId.length - 1) return null;
  return { tenantId: sourceId.slice(0, at), eventId: sourceId.slice(at + 1) };
}

/** The tenant event as a Needs you item, routed as it is routed today (spec section 6 step 2). */
export function tenantEventItem(event: UnifiedEvent): ProposedItem | null {
  if (event.status !== "pending") return null;
  const classification = classifyTenantEvent(event);
  if (!classification) return null;
  const observed = observedTenantRoute(event).route;
  if (observed !== "owner_decides" && observed !== "strelva_reviews") return null;
  const rating = classification.signals?.reviewRating;
  const kind: ChangeKind = classification.kind === "review.reply" && typeof rating === "number" && rating <= 2 ? "review.reply_critical" : classification.kind;
  if (kind === "suggestion" || kind === "health.owner_action") return null;
  const [approveEffect, notYetEffect] = event.metadata?.kind === "workspace_newsletter_issue"
    ? ["Keep this approved issue and its receipt. Sending is paused; no email sends.", "Keep the draft. Nothing sends."]
    : event.metadata?.kind === "workspace_google_listing_draft"
      ? ["Apply these exact words or business facts to this Google listing. Google may hold the change for review.", "Keep the draft. Nothing changes on Google."]
      : effects(kind);
  // A commitment (a price, a date, a promise) is always the owner's, owner only,
  // even when Strelva was reviewing the draft (inquiry 1.0 delta, C6).
  const commitment = kind === "customer.commitment";
  const route = commitment ? "owner_decides" : observed;
  return {
    kind,
    route,
    title: event.title.slice(0, 200).trim() || "A change is waiting",
    detail: event.body ? event.body.slice(0, 600) : null,
    approveEffect,
    notYetEffect,
    sourceLifecycle: "tenant_event",
    sourceId: `${event.tenantId}:${event.id}`,
    revisionHash: tenantEventRevision(event),
    urgent: route === "owner_decides" && urgentFor(kind),
    // The chase clock starts when Needs you first sees the ask, not when the
    // tenant event was written, so an older pending ask does not lapse at once.
    adminMayDecide: !commitment && !String(event.metadata?.kind).startsWith("workspace_") && !OWNER_ONLY_KINDS.has(kind),
  };
}

export function tenantEventAdapter(ports: TenantEventPorts): SourceAdapter {
  const scopes = async (workspaceId: string) => [...await ports.linkedTenants(workspaceId), ...(releaseFlagMayBeOn("publishing") ? [workspacePublishingScope(workspaceId)] : [])];
  return {
    lifecycle: "tenant_event",
    needsMemberActor: false,
    async propose(ctx) {
      const tenants = await scopes(ctx.workspaceId);
      let complete = true;
      const items: ProposedItem[] = [];
      for (const tenantId of tenants) {
        try {
          for (const event of await ports.pendingEvents(tenantId)) {
            if (event.tenantId !== tenantId || (tenantId === workspacePublishingScope(ctx.workspaceId) && event.metadata?.workspaceId !== ctx.workspaceId)) continue;
            const item = tenantEventItem(event);
            if (item) items.push(item);
          }
        } catch {
          complete = false;
        }
      }
      return { items, complete };
    },
    async currentRevision(ctx, sourceId) {
      const source = splitTenantSource(sourceId);
      if (!source) return null;
      if (!(await scopes(ctx.workspaceId)).includes(source.tenantId)) return null;
      const event = await ports.readEvent(source.eventId);
      if (!event || event.tenantId !== source.tenantId || event.status !== "pending") return null;
      return tenantEventRevision(event);
    },
    async resolve(ctx, item, decision, by) {
      const source = splitTenantSource(item.sourceId);
      if (!source || !(await scopes(ctx.workspaceId)).includes(source.tenantId)) return { outcome: "failed", reason: "source_not_linked" };
      // A lapse does nothing at the source: the event stays pending and the
      // operator queue keeps it as the owner's call until someone closes it.
      if (by.kind === "expiry") return { outcome: "done", reason: "Expired, nothing changed" };
      const actorId = by.kind === "owner_link" ? `owner-link:${by.recipient}` : by.actor.userId;
      let result: { changed: boolean; reason?: string };
      try {
        result = await ports.resolveEventAction(source.tenantId, source.eventId, decision === "approve" ? "approved" : "dismissed", actorId);
      } catch {
        return { outcome: "failed", reason: "resolver_threw" };
      }
      const receiptRef = `tenant_event:${source.eventId}`;
      if (result.changed) return result.reason ? { outcome: "done_unverified", reason: result.reason, receiptRef } : { outcome: "done", receiptRef };
      if (result.reason === "already_resolved" || result.reason === "not_found") return { outcome: "done", reason: "already_resolved", receiptRef };
      return { outcome: "failed", reason: result.reason ?? "not_changed" };
    },
  };
}

// Service requests ------------------------------------------------------------------

export interface ServiceRequestPorts {
  list(actor: WorkspaceActor, businessId: string): Promise<ServiceRequest[]>;
  change(actor: WorkspaceActor, input: { requestId: string; expectedRevision: number; idempotencyKey: string; change: { kind: "agree" } | { kind: "accept_result"; note: string } }): Promise<ServiceRequest>;
}

function serviceStage(request: ServiceRequest): "proposed" | "submitted" | null {
  if (request.status !== "requested" || request.providerAcceptance.status !== "accepted") return null;
  const status = request.deliveryCommitment?.status;
  return status === "proposed" || status === "submitted" ? status : null;
}

function serviceRevision(request: ServiceRequest): string {
  return createHash("sha256").update(JSON.stringify([request.id, request.revision, request.deliveryCommitment?.status ?? null, request.deliveryCommitment?.scope ?? null, request.deliveryCommitment?.dueAt ?? null])).digest("hex");
}

export function serviceRequestItem(request: ServiceRequest): ProposedItem | null {
  const stage = serviceStage(request);
  if (!stage) return null;
  const outcome = request.outcome.replace(/\s+/g, " ").trim();
  return {
    kind: "request.scope",
    route: "owner_decides",
    title: (stage === "proposed" ? `Agree scope and deadline: ${outcome}` : `Accept the result: ${outcome}`).slice(0, 200).trim(),
    detail: stage === "proposed" ? request.deliveryCommitment?.deliveryDefinition ?? null : request.deliveryCommitment?.result?.reviewUrl ?? null,
    approveEffect: stage === "proposed" ? "The work is agreed and starts." : "The work is accepted as done.",
    notYetEffect: "Nothing changes; it waits for you.",
    sourceLifecycle: "service_request",
    sourceId: `${request.id}:${stage}`,
    revisionHash: serviceRevision(request),
    urgent: false,
    adminMayDecide: true,
    openHref: `/workspace/delivery/${request.id}`,
  };
}

export function serviceRequestAdapter(ports: ServiceRequestPorts): SourceAdapter {
  async function find(actor: WorkspaceActor, workspaceId: string, sourceId: string) {
    const [requestId, stage] = sourceId.split(":");
    const request = (await ports.list(actor, workspaceId)).find(row => row.id === requestId && row.businessId === workspaceId);
    return request && serviceStage(request) === stage ? request : null;
  }
  return {
    lifecycle: "service_request",
    needsMemberActor: true,
    async propose(ctx) {
      if (!ctx.actor) return { items: [], complete: false };
      try {
        const rows = await ports.list(ctx.actor, ctx.workspaceId);
        return { items: rows.filter(row => row.businessId === ctx.workspaceId).flatMap(row => serviceRequestItem(row) ?? []), complete: true };
      } catch {
        return { items: [], complete: false };
      }
    },
    async currentRevision(ctx, sourceId) {
      if (!ctx.actor) return null;
      const request = await find(ctx.actor, ctx.workspaceId, sourceId);
      return request ? serviceRevision(request) : null;
    },
    async resolve(ctx, item, decision, by) {
      // Not yet and a lapse change nothing: the Request keeps its own stage.
      if (decision === "not_yet" || by.kind === "expiry") return { outcome: "done", reason: by.kind === "expiry" ? "Expired, nothing changed" : "Not yet" };
      const actor = by.kind === "session" ? by.actor : by.actor;
      if (!actor) return { outcome: "failed", reason: "owner_not_member" };
      try {
        const request = await find(actor, ctx.workspaceId, item.sourceId);
        if (!request) return { outcome: "done", reason: "already_resolved" };
        const stage = serviceStage(request);
        const updated = await ports.change(actor, {
          requestId: request.id,
          expectedRevision: request.revision,
          idempotencyKey: `needs-you:${item.id}`,
          change: stage === "proposed" ? { kind: "agree" } : { kind: "accept_result", note: "Accepted from Needs you." },
        });
        return { outcome: "done", receiptRef: `service_request:${updated.id}:${updated.revision}` };
      } catch {
        return { outcome: "failed", reason: "resolver_failed" };
      }
    },
  };
}
