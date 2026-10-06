import { createPossibility, type PossibilityRepository } from "@/platform/possibilities";
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
 * The narrow port to src/platform/needs-you (built on another stream). Ask
 * Strelva never decides the route itself; it only reports what this says.
 */
export interface NeedsYouPort {
  submit(draft: AskDraft): Promise<AskNeedsYouRouting>;
}

/**
 * Stub adapter until the Needs you policy is wired in. Today's tenant tools
 * already queue a pending event that `/api/approve` and the dashboard review
 * queue (`/dashboard/review`) resolve, so email approval keeps working (spec
 * section 6, step 4). This adapter routes every Ask draft to the owner and
 * points at that event. It never answers `handle`: nothing drafted in Ask
 * publishes on its own until the real policy says it may. A draft that
 * created no pending event has nothing to decide, so it is `never`.
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
  /** Short key for the System the Possibility introduces (e.g. consult_booking). */
  introduces: { key: string; name: string; purpose: string; summary: string } | null;
  /** A change to an existing System: summary only; the candidate is built later. */
  check: string;
}

export interface AskOpenedPossibility {
  id: string;
  status: "exploring";
  /** False when the repository does not survive a deploy (in-memory today). */
  durable: boolean;
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
export function createPossibilityAdapter(repository: PossibilityRepository, options: { durable: boolean; newId?: () => string; now?: () => string }): AskPossibilityPort {
  const newId = options.newId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date().toISOString());
  return {
    async open(actor, input) {
      if (!input.introduces) throw new Error("possibility_needs_baseline");
      const possibility = createPossibility({
        title: input.title,
        intent: input.intent,
        introduces: [{
          key: input.introduces.key,
          name: input.introduces.name,
          purpose: input.introduces.purpose,
          candidate: { summary: input.introduces.summary, content: {} },
        }],
        checks: [{ id: "owner_tries_it", description: input.check }],
      }, { id: newId(), businessId: input.workspaceId, actorId: actor.userId, at: now() });
      await repository.create(possibility);
      return { id: possibility.id, status: "exploring", durable: options.durable };
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
