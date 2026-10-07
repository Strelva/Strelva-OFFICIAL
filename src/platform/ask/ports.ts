import type { UnifiedEvent } from "@/lib/types";
import { observedTenantRoute } from "@/platform/needs-you/tenant-classify";
import { createPossibility, type DeclaredEffect, type PossibilityRepository } from "@/platform/possibilities";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { AskChangeKind, AskChangeOrigin, AskNeedsYouRoute, AskedOnBehalf } from "./contracts";
import type { AskAuthoritySnapshot } from "./authority";

/**
 * Ports Ask Strelva depends on. Each has a narrow interface so this module
 * does not wait on the streams that build the real thing; the adapters here
 * are the working defaults until those land.
 */

// ── Needs you ───────────────────────────────────────────────────────────────

/** One drafted change, handed to the Needs you policy. */
export interface AskDraft {
  workspaceId: string;
  systemId: string | null;
  tenantId: string | null;
  /** The Ask tool that drafted it. */
  toolId: string;
  kind: AskChangeKind;
  origin: AskChangeOrigin;
  askedOnBehalf: AskedOnBehalf | null;
  summary: string;
  /** The pending tenant events the draft created (today's approval store). */
  eventIds: string[];
}

export interface AskNeedsYouRouting {
  route: AskNeedsYouRoute;
  /** The Needs you item the owner (or Strelva) decides on, when one exists. */
  itemRef: string | null;
  /** Where the decision is made. Never an approval link itself. */
  decideAt: string | null;
}

/**
 * The narrow port to src/platform/needs-you. Ask
 * Strelva never decides the route itself; it only reports what this says.
 */
export interface NeedsYouPort {
  submit(draft: AskDraft): Promise<AskNeedsYouRouting>;
}

/**
 * Today's tenant queue, used while Needs you is off and for a site not yet
 * linked to a business. Today's tenant tools already queue a pending event
 * that `/api/approve` and the dashboard review queue (`/dashboard/review`)
 * resolve, so email approval keeps working (needs-you spec section 6, step
 * 4). It routes every Ask draft to the owner and points at that event. It
 * never answers `handle`. A draft that created no pending event has nothing
 * to decide, so it is `never`. `createNeedsYouAskAdapter` is the real port.
 */
export function createTenantEventNeedsYouAdapter(options: { decideAt?: string } = {}): NeedsYouPort {
  const decideAt = options.decideAt ?? "/dashboard/review";
  return {
    async submit(draft) {
      if (draft.eventIds.length === 0) return { route: "never", itemRef: null, decideAt: null };
      return { route: "owner_decides", itemRef: draft.eventIds[0]!, decideAt };
    },
  };
}

/** The parts of a Needs you item Ask reports back. */
export interface AskNeedsYouItem {
  id: string;
  route: "strelva_reviews" | "owner_decides";
  state: string;
  sourceLifecycle: string;
  sourceId: string;
}

/** Bound to the signed-in actor by the caller. */
export interface NeedsYouAskDeps {
  /** Tenants linked to this business (needs_you_linked_tenants). */
  linkedTenants(workspaceId: string): Promise<string[]>;
  /** Record Ask origin and the real policy route before the tenant source opens an item. */
  prepare?(draft: AskDraft): Promise<void>;
  /** Open items for every pending ask the adapters can read (Needs you `sync`). */
  sync(workspaceId: string): Promise<unknown>;
  /** Open items, every route (the store's list, not the owner view). */
  openItems(workspaceId: string): Promise<AskNeedsYouItem[]>;
  /** The tenant event, to report the route it actually took when no item opened. */
  readEvent(eventId: string): Promise<UnifiedEvent | null>;
  /** Used for a draft whose site is not linked to a business yet: today's tenant queue. */
  fallback: NeedsYouPort;
  /** Where the owner decides: Home's Needs you. */
  decideAt(workspaceId: string): string;
}

const ROUTE_RANK: Record<AskNeedsYouRoute, number> = { never: -1, handle: 0, handle_after_notice: 1, strelva_reviews: 2, owner_decides: 3 };

/**
 * The real Needs you port. Ask's tenant tools still queue a pending tenant
 * event (today's approval store); this opens the Needs you item for it
 * through the tenant-event adapter and reports the item's route, so the
 * route Ask names is the one the policy holds and the item the owner
 * decides is the one Home and the email show. Ask never decides the route.
 *
 * - Site not linked to this business: today's tenant queue (fallback).
 * - Several events: the strictest route wins; the item named is the first
 *   one the owner decides.
 * - An event that opened no item (published under today's rules, or already
 *   resolved): the route it actually took (`observedTenantRoute`).
 */
export function createNeedsYouAskAdapter(deps: NeedsYouAskDeps): NeedsYouPort {
  return {
    async submit(draft) {
      if (draft.eventIds.length === 0) return { route: "never", itemRef: null, decideAt: null };
      if (!draft.tenantId) return deps.fallback.submit(draft);
      const linked = await deps.linkedTenants(draft.workspaceId).catch(() => null);
      if (!linked || !linked.includes(draft.tenantId)) return deps.fallback.submit(draft);
      await deps.prepare?.(draft);
      await deps.sync(draft.workspaceId);
      const items = await deps.openItems(draft.workspaceId);
      let route: AskNeedsYouRoute = "never";
      let item: AskNeedsYouItem | null = null;
      for (const eventId of draft.eventIds) {
        const sourceId = `${draft.tenantId}:${eventId}`;
        const open = items.find((row) => row.state === "open" && row.sourceLifecycle === "tenant_event" && row.sourceId === sourceId);
        let eventRoute: AskNeedsYouRoute;
        if (open) {
          eventRoute = open.route;
          if (!item || (open.route === "owner_decides" && item.route !== "owner_decides")) item = open;
        } else {
          const event = await deps.readEvent(eventId).catch(() => null);
          // An event that can't be read is held for the owner: never claim it was handled.
          eventRoute = event && event.tenantId === draft.tenantId ? observedTenantRoute(event).route : "owner_decides";
        }
        if (ROUTE_RANK[eventRoute] > ROUTE_RANK[route]) route = eventRoute;
      }
      return {
        route,
        itemRef: item?.id ?? null,
        decideAt: route === "owner_decides" ? deps.decideAt(draft.workspaceId) : null,
      };
    },
  };
}

// ── Requests ────────────────────────────────────────────────────────────────

export interface AskRequestInput {
  workspaceId: string;
  systemId: string | null;
  /** The person's own words. */
  words: string;
  /** What Strelva understood the outcome to be. */
  outcome: string;
  /** What Strelva already read, for the operator. */
  read: string[];
  askedOnBehalf: AskedOnBehalf | null;
  topic: string;
  idempotencyKey: string;
}

export interface AskFiledRequest {
  id: string;
  status: "requested";
}

/** Files a Request to Strelva at Asked. Never claims the work is accepted. */
export interface AskRequestPort {
  file(actor: WorkspaceActor, input: AskRequestInput): Promise<AskFiledRequest>;
  list(actor: WorkspaceActor, workspaceId: string): Promise<Array<{ id: string; request: string; status: string; accepted: string; updatedAt: string }>>;
}

export interface ServiceRequestLike {
  id: string;
  request: string;
  status: string;
  providerAcceptance: { status: string };
  updatedAt: string;
}

/** Adapter over src/platform/service-requests (provider `strelva`). */
export function createServiceRequestAdapter(service: {
  execute(actor: WorkspaceActor, raw: unknown): Promise<ServiceRequestLike>;
  list(actor: WorkspaceActor, query: { businessId: string }): Promise<ServiceRequestLike[]>;
}): AskRequestPort {
  return {
    async file(actor, input) {
      const saved = await service.execute(actor, {
        action: "save",
        businessId: input.workspaceId,
        status: "requested",
        request: input.words.slice(0, 3_000),
        outcome: input.outcome.slice(0, 3_000),
        context: {
          source: "ask_strelva",
          systemId: input.systemId,
          askedOnBehalf: input.askedOnBehalf,
          alreadyRead: input.read.slice(0, 20),
        },
        scope: [input.topic.slice(0, 120)],
        provider: { kind: "strelva" },
        idempotencyKey: input.idempotencyKey,
      });
      return { id: saved.id, status: "requested" };
    },
    async list(actor, workspaceId) {
      const rows = await service.list(actor, { businessId: workspaceId });
      return rows.slice(0, 20).map((row) => ({
        id: row.id, request: row.request.slice(0, 300), status: row.status, accepted: row.providerAcceptance.status, updatedAt: row.updatedAt,
      }));
    },
  };
}

// ── Possibilities ───────────────────────────────────────────────────────────

export interface AskPossibilityInput {
  workspaceId: string;
  systemId: string | null;
  title: string;
  intent: string;
  /** Short key for the System the Possibility introduces (e.g. consult-booking). */
  introduces: { key: string; name: string; purpose: string; summary: string } | null;
  /** A change to an existing System: summary only; the candidate is built later. */
  check: string;
  words?: string;
  origin?: AskChangeOrigin;
  askedOnBehalf?: AskedOnBehalf | null;
  candidate?: { kind: "website-pages"; pages: Array<{ path: string; title: string; description: string; paragraphs: string[] }> };
}

export interface AskOpenedPossibility {
  id: string;
  status: "exploring";
  /** False when the repository does not survive a deploy (in-memory today). */
  durable: boolean;
  previewHref?: string;
  reviewStatus?: "needs_you" | "pending_sync";
}

export interface AskPossibilityPort {
  open(actor: WorkspaceActor, input: AskPossibilityInput): Promise<AskOpenedPossibility>;
  list(workspaceId: string): Promise<Array<{ id: string; title: string; status: string }>>;
}

/**
 * Adapter over src/platform/possibilities. Opening never changes anything
 * live; Make real runs later through the same approvals. Only a new System
 * can be opened here today: a change to an existing System needs a pinned
 * baseline revision, which managed websites do not have yet.
 */
export class AskPossibilityUnsupportedError extends Error {}
export class AskPreparedPossibilityError extends Error {
  constructor(public readonly draftId: string | null) { super("A native draft was prepared, but the Possibility could not finish saving. No live change was made."); }
}

export function createPossibilityAdapter(repository: PossibilityRepository, options: {
  durable: boolean; newId?: () => string; now?: () => string;
  prepare?: (actor: WorkspaceActor, input: AskPossibilityInput, possibilityId: string) => Promise<{ content: Record<string, unknown>; effects: DeclaredEffect[]; previewHref: string }>;
}): AskPossibilityPort {
  const newId = options.newId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date().toISOString());
  return {
    async open(actor, input) {
      if (!input.introduces || !input.candidate || !options.prepare) throw new AskPossibilityUnsupportedError("This alternative needs a supported working candidate or a pinned existing System baseline.");
      const id = newId();
      const prepared = await options.prepare(actor, input, id);
      const possibility = createPossibility({
        title: input.title,
        intent: input.intent,
        introduces: [{
          key: input.introduces.key,
          name: input.introduces.name,
          purpose: input.introduces.purpose,
          candidate: { summary: input.introduces.summary, content: prepared.content },
        }],
        checks: [{ id: "owner-tries-it", description: input.check }],
        effects: prepared.effects,
      }, { id, businessId: input.workspaceId, actorId: actor.userId, at: now() });
      try { await repository.create(possibility); }
      catch { throw new AskPreparedPossibilityError(typeof prepared.content.rebuildWorkId === "string" ? prepared.content.rebuildWorkId : null); }
      return { id: possibility.id, status: "exploring", durable: options.durable, previewHref: prepared.previewHref };
    },
    async list(workspaceId) {
      return (await repository.list(workspaceId)).map((p) => ({ id: p.id, title: p.title, status: p.status }));
    },
  };
}

// ── Authority re-read ───────────────────────────────────────────────────────

/** Reads the authority snapshot fresh. Called before every tool call. */
export interface AskAuthorityReader {
  read(): Promise<AskAuthoritySnapshot>;
}
