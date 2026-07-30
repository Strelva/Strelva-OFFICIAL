/**
 * UnifiedEvent data layer - Redis-backed event queue for dashboard.
 * Uses sorted sets with timestamp scores for efficient time-range queries.
 */

import type { UnifiedEvent } from "./types";
import { getRedis } from "./redis";
import { DEFAULT_TENANT } from "./storage/core";
import { insertEvent, setEventStatus } from "./db/repositories";
import { dualWritePgEnabled, eventToInsert, governedWorkReadPgEnabled } from "./db/dual-write";
import { shadowDecisionFromResolve, shadowProposalFromEvent } from "./governed-work/shadow";
import { getGovernedEventById, listGovernedEventsForTenant } from "./governed-work/repository";
import { isGovernedScopeEvent } from "./governed-work/read";

const EVENT_RETENTION_DAYS = 90;
const EVENT_TTL_SECONDS = EVENT_RETENTION_DAYS * 24 * 60 * 60;

/** Keep retention anchored to creation time. Updating an event must not turn a
 *  90-day operational record into an immortal key or restart its retention
 *  window. A record already beyond the window gets one final second so Redis
 *  can remove it without accepting an invalid EX value. */
function remainingEventTtlSeconds(event: Pick<UnifiedEvent, "createdAt">): number {
  const createdAt = new Date(event.createdAt).getTime();
  if (!Number.isFinite(createdAt)) return EVENT_TTL_SECONDS;
  const expiresAt = createdAt + EVENT_TTL_SECONDS * 1000;
  return Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
}

export class EventPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventPersistenceError";
  }
}

type AddEventOptions = {
  requirePersistence?: boolean;
};

/**
 * Redis key for tenant event sorted set.
 * Score = timestamp (ms). Member = event id (current format). The event body
 * lives at event:{id}. Legacy rows hold a JSON-encoded event as the member;
 * the read path handles both (see getEvents).
 *
 * Storing the id (not the JSON) means a mutate only rewrites event:{id} and
 * never has to zrem-old/zadd-new on the set — which is what made update/resolve
 * race-prone (a stale `zrem(JSON.stringify(existing))` could orphan or drop the
 * wrong member). With a stable id member there is no zset divergence to guard.
 */
function eventsKey(tenantId: string): string {
  return `events:${tenantId}`;
}

/**
 * Derive an event id (and any embedded legacy body) from a raw zset member.
 * Current rows are the bare id string; legacy rows are JSON; the Upstash client
 * may also hand back an already-parsed object.
 */
function memberToRef(item: unknown): { id: string | null; embedded: UnifiedEvent | null } {
  if (item && typeof item === "object") {
    const obj = item as UnifiedEvent;
    return { id: obj.id ?? null, embedded: obj.id ? obj : null };
  }
  if (typeof item === "string") {
    if (item.startsWith("{")) {
      try {
        const obj = JSON.parse(item) as UnifiedEvent;
        return { id: obj.id ?? null, embedded: obj.id ? obj : null };
      } catch {
        return { id: null, embedded: null };
      }
    }
    return { id: item, embedded: null };
  }
  return { id: null, embedded: null };
}

/**
 * Redis key for individual event lookup.
 */
function eventKey(eventId: string): string {
  return `event:${eventId}`;
}

function actionLockKey(eventId: string): string {
  return `event-action:${eventId}`;
}

export async function claimEventAction(
  id: string,
  action: "approved" | "dismissed",
  actor = "user",
): Promise<{ acquired: true; attemptId: string } | { acquired: false; reason: string }> {
  const redis = getRedis();
  if (!redis) return { acquired: false, reason: "persistence_unavailable" };

  const existing = await redis.get<UnifiedEvent>(eventKey(id));
  if (!existing) return { acquired: false, reason: "not_found" };
  if (existing.status !== "pending") return { acquired: false, reason: "already_resolved" };

  const activeAttempt = await redis.get<string>(actionLockKey(id));
  if (activeAttempt) return { acquired: false, reason: "action_in_progress" };

  // A process can die after a provider accepts a non-idempotent write but
  // before Strelva resolves the event. Never infer that an expired Redis lock
  // means the provider write did not happen. Both the "processing" marker (the
  // attempt is mid-flight) and the "external_accepted" marker (the write WAS
  // accepted but the event didn't resolve) survive the lock and force operator
  // reconciliation instead of risking a duplicate external write.
  const execState = existing.metadata?.execution?.state;
  if (execState === "processing" || execState === "external_accepted") {
    return { acquired: false, reason: "action_reconciliation_required" };
  }

  const attemptId = `attempt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const acquired: unknown = await redis.set(actionLockKey(id), attemptId, { nx: true, ex: 15 * 60 });
  if (acquired === null || acquired === undefined || acquired === false) {
    return { acquired: false, reason: "action_in_progress" };
  }

  const startedAt = new Date().toISOString();
  const marked = await updateEvent(id, (event) => ({
    ...event,
    metadata: {
      ...event.metadata,
      execution: { state: "processing", action, actor, attemptId, startedAt },
    },
  }));
  if (!marked.changed || marked.event?.status !== "pending") {
    await redis.del(actionLockKey(id));
    return { acquired: false, reason: "action_in_progress" };
  }

  return { acquired: true, attemptId };
}

/**
 * Stamp a pending event's execution as "external_accepted" — call this the
 * instant a NON-IDEMPOTENT external write (GBP post/hours/photo, review reply,
 * newsletter) is accepted by the provider, BEFORE attempting to resolve the
 * event. If the subsequent resolve loses its lock or the process dies, the
 * marker survives so claimEventAction refuses a retry (which would duplicate the
 * write). No-op if the execution attempt no longer matches (best-effort).
 */
export async function markExecutionExternalAccepted(id: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await updateEvent(id, (event) => {
    const execution = event.metadata?.execution;
    if (!execution || execution.state !== "processing") return event;
    return {
      ...event,
      metadata: {
        ...event.metadata,
        execution: { ...execution, state: "external_accepted" },
      },
    };
  }).catch(() => {});
}

export async function finishEventAction(
  id: string,
  attemptId: string,
  outcome: { state: "completed" | "failed"; reason?: string },
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await updateEvent(id, (event) => {
      const execution = event.metadata?.execution;
      if (!execution || execution.attemptId !== attemptId) return event;
      // Never downgrade an "external_accepted" marker to "failed": the provider
      // write already went through, so unblocking the claim would let a retry
      // duplicate it. Keep it blocking so an operator reconciles instead.
      if (execution.state === "external_accepted" && outcome.state === "failed") {
        return event;
      }
      return {
        ...event,
        metadata: {
          ...event.metadata,
          execution: {
            ...execution,
            state: outcome.state,
            finishedAt: new Date().toISOString(),
            ...(outcome.reason ? { reason: outcome.reason } : {}),
          },
        },
      };
    });
  } finally {
    const owner = await redis.get<string>(actionLockKey(id));
    if (owner === attemptId) await redis.del(actionLockKey(id));
  }
}

/**
 * Add a new event to the queue.
 */
export async function addEvent(
  event: Omit<UnifiedEvent, "id" | "createdAt">,
  opts: AddEventOptions = {}
): Promise<UnifiedEvent> {
  const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = new Date().toISOString();
  const full: UnifiedEvent = { ...event, id, createdAt };
  const requiresPersistence =
    opts.requirePersistence ||
    (process.env.NODE_ENV === "production" &&
      event.status === "pending" &&
      (event.source === "ai" ||
        event.type === "newsletter_draft" ||
        event.type === "review" ||
        event.type === "content_update" ||
        event.type === "change_request" ||
        event.type === "suggestion"));

  const redis = getRedis();
  if (!redis) {
    if (requiresPersistence) {
      throw new EventPersistenceError("Redis is required for durable event queue persistence.");
    }
    // Not durably persisted (Redis unavailable + non-prod, so requiresPersistence
    // is false). Warn loudly for pending items — a silently-dropped pending draft
    // / review / change-request has masked real data loss in dev/staging before.
    if (full.status === "pending") {
      console.warn(
        `[events] Redis unavailable — pending ${full.type} for tenant ${full.tenantId} was NOT persisted (in-memory only, will vanish).`
      );
    }
    return full;
  }

  const score = Date.now();
  // event:{id} is the source of truth for the body; the zset member is just the
  // id (an index entry). Write the record first so a reader that sees the id can
  // always resolve it.
  await redis.set(eventKey(id), full, { ex: EVENT_TTL_SECONDS });
  await redis.zadd(eventsKey(event.tenantId), { score, member: id });
  // Prune index entries older than the record TTL. The event:{id} bodies expire
  // at EVENT_TTL_SECONDS but their zset members don't, so without this the index
  // grows unbounded and fills the recency window that getEvents /
  // getOpenChangeRequest scan with ids that no longer resolve. Bounding by score
  // keeps the index aligned with what's actually still readable.
  await redis.zremrangebyscore(eventsKey(event.tenantId), 0, score - EVENT_TTL_SECONDS * 1000);

  // Postgres shadow-write (Phase-2 dual-write). Null-safe + never throws; Redis
  // above stays the source of truth and reads. Gated by DUAL_WRITE_PG.
  if (dualWritePgEnabled()) {
    await insertEvent(eventToInsert(full));
  }

  // Governed-work proposal shadow (Phase-2b ontology). SEPARATE flag
  // (GOVERNED_WORK_DUAL_WRITE, default OFF) + best-effort; self-guarded so it can't
  // perturb the Redis path above. No-op for non-governed events. #7 migration must
  // be applied before the flag is enabled.
  await shadowProposalFromEvent(full);

  return full;
}

/**
 * Redis-AUTHORITATIVE list read — the Redis index/body path with NO governed-work
 * Postgres hydration. Use on EXECUTION / verification paths (the reconcile sweep,
 * the auto-post retry cap, the reply-confirmation re-read) where post-create
 * metadata mutations (autoPostAttempts, the owner's edited status) live only in
 * Redis and the add-time PG snapshot would nullify the check. Read surfaces
 * (dashboard feeds) use getEvents, which hydrates from PG when READ_PG is on.
 */
export async function getEventsRaw(
  tenantId: string,
  opts?: { status?: string; limit?: number }
): Promise<UnifiedEvent[]> {
  const redis = getRedis();
  if (!redis) return [];

  const limit = opts?.limit ?? 50;
  // Window note: we only scan the `limit * 2` most-recent zset entries (newest
  // first) before status-filtering down to `limit`. This is bounded for the
  // dashboard feed, but it means a status-filtered read can miss matching
  // events older than that window. Callers that must not miss an old match
  // (e.g. getOpenChangeRequest gating) pass a large `limit` to widen it.
  const raw = await redis.zrange(eventsKey(tenantId), 0, limit * 2, {
    rev: true,
  });

  // Members are event ids (current) or legacy JSON. Resolve every member to the
  // authoritative event:{id} record so a row that was mutated after the id-member
  // migration reflects its CURRENT status (a legacy JSON member is frozen at add
  // time and would otherwise show a resolved item as still pending). Fall back to
  // the embedded legacy body only if the record has aged out. One mget batches it.
  const refs = raw.map(memberToRef);
  const ids = refs.map((r) => r.id).filter((id): id is string => Boolean(id));
  const records = ids.length
    ? await redis.mget<UnifiedEvent[]>(...ids.map(eventKey))
    : [];
  const byId = new Map<string, UnifiedEvent | null>();
  ids.forEach((id, i) => byId.set(id, records[i] ?? null));

  const events: UnifiedEvent[] = [];
  for (const ref of refs) {
    const event = (ref.id ? byId.get(ref.id) : null) ?? ref.embedded;
    if (!event) continue;
    if (!opts?.status || event.status === opts.status) {
      events.push(event);
      if (events.length >= limit) break;
    }
  }

  return events;
}

/**
 * Get events for a tenant, optionally filtered by status. Read-surface variant:
 * under GOVERNED_WORK_READ_PG, governed events are re-served from the Postgres
 * mirror (see hydrateGovernedFromPg). Execution paths must use getEventsRaw.
 */
export async function getEvents(
  tenantId: string,
  opts?: { status?: string; limit?: number }
): Promise<UnifiedEvent[]> {
  const events = await getEventsRaw(tenantId, opts);
  return hydrateGovernedFromPg(tenantId, events);
}

/**
 * Governed-work READ flip (#8), flag-gated by GOVERNED_WORK_READ_PG (default OFF).
 * Redis stays the index/ordering/membership authority — the set of events, their
 * order, and the status filter are ALL computed from Redis above and unchanged.
 * When the flag is on, each governed-scope event in that Redis-determined set is
 * re-served from the proposals/decisions/execution_attempts/outcomes tables (the
 * governance queue reading from Postgres), with a fail-soft fallback to the Redis
 * event when Postgres has no twin. Non-governed observation events (bookings,
 * reviews, payments…) are never in proposals, so they always come from Redis.
 * Flag OFF ⇒ this returns `events` untouched ⇒ byte-identical to the old path.
 */
async function hydrateGovernedFromPg(
  tenantId: string,
  events: UnifiedEvent[],
): Promise<UnifiedEvent[]> {
  if (!governedWorkReadPgEnabled()) return events;
  const governedIds = events.filter(isGovernedScopeEvent).map((e) => e.id);
  if (governedIds.length === 0) return events;
  // Hydrate the EXACT governed ids in this Redis page — a newest-first window
  // could miss an old-but-selected event and serve a mixed Redis/PG view (#31).
  const pgEvents = await listGovernedEventsForTenant(tenantId, { ids: governedIds });
  const pgById = new Map(pgEvents.map((e) => [e.id, e]));
  return events.map((e) => (isGovernedScopeEvent(e) ? pgById.get(e.id) ?? e : e));
}

export async function getEvent(id: string): Promise<UnifiedEvent | null> {
  const redis = getRedis();
  if (!redis) return null;
  const event = (await redis.get<UnifiedEvent>(eventKey(id))) || null;
  if (!event) return null;
  // Governed-work READ flip (see hydrateGovernedFromPg). Flag OFF ⇒ the Redis
  // event is returned unchanged. Fail-soft: a missing/blipped Postgres twin
  // falls back to the Redis event.
  if (governedWorkReadPgEnabled() && isGovernedScopeEvent(event)) {
    const pg = await getGovernedEventById(id);
    if (pg) return pg;
  }
  return event;
}

/**
 * Redis-AUTHORITATIVE single-event read — never hydrates from the governed-work
 * Postgres mirror. The PG reconstruction carries the ADD-TIME proposal payload,
 * so a post-create metadata mutation (an owner editing a review-reply draft
 * before approving, a refreshed suggestion prompt) is invisible to it. Any
 * path that EXECUTES an event's payload (resolveEventAction → the external
 * write) must read the live Redis metadata, or it would publish the stale
 * original. Read surfaces (dashboard feeds) still use getEvent/getEvents.
 */
export async function getEventRaw(id: string): Promise<UnifiedEvent | null> {
  const redis = getRedis();
  if (!redis) return null;
  return (await redis.get<UnifiedEvent>(eventKey(id))) || null;
}

/**
 * Event kinds (metadata.kind) that are `change_request` events but are NOT
 * custom-build requests, so they must not trip the one-active-request gate.
 * Offboarding handoffs reuse the `change_request` type for the review queue
 * but are an entirely different workflow.
 */
const NON_CUSTOM_CHANGE_REQUEST_KINDS = new Set(["offboarding_handoff_request"]);

/**
 * True for a pending `change_request` event that represents an actual custom
 * code/design build (the kind the care-plan one-at-a-time rule governs).
 * Legacy events created before `metadata.kind` was set are treated as custom
 * requests for back-compat; only explicitly non-custom kinds (e.g. offboarding
 * handoffs) are excluded.
 */
function isCustomBuildChangeRequest(event: UnifiedEvent): boolean {
  if (event.type !== "change_request") return false;
  const kind = event.metadata?.kind;
  if (typeof kind === "string" && NON_CUSTOM_CHANGE_REQUEST_KINDS.has(kind)) {
    return false;
  }
  return true;
}

/**
 * Care-plan rule: one active custom change request at a time per tenant.
 * Returns the tenant's currently-open (pending) custom change request, if any.
 * Used to gate new change-request creation so the owner never has two custom
 * jobs racing — the AI tells them what's already in flight instead.
 *
 * NOTE: change_request events are resolved as soon as the build wraps, so in
 * practice they live near the top of the recency window. A limit of 50 is
 * sufficient — fetching 1000 events on every care-plan gate check is wasteful.
 * The governed-work Postgres mirror (READ_PG) means this is often a DB query,
 * not a Redis scan, so a tight limit is doubly important.
 */
export async function getOpenChangeRequest(
  tenantId: string
): Promise<UnifiedEvent | null> {
  const pending = await getEvents(tenantId, { status: "pending", limit: 50 });
  return pending.find(isCustomBuildChangeRequest) ?? null;
}

export async function updateEvent(
  id: string,
  updater: (event: UnifiedEvent) => UnifiedEvent
): Promise<{ event: UnifiedEvent | null; changed: boolean }> {
  const redis = getRedis();
  if (!redis) return { event: null, changed: false };

  // The zset member is the stable id, so a mutate only rewrites event:{id} — no
  // zrem/zadd, no zset divergence. The remaining race is the get->updater->set
  // read-modify-write itself (two concurrent updaters could lose one update), so
  // a short SET NX lock still serializes them; the loser re-reads and returns the
  // current event without mutating. TTL bounds a crashed holder.
  const lockKey = `event-lock:${id}`;
  const lock = await redis.set(lockKey, "1", { nx: true, ex: 10 });
  if (!lock) {
    const current = await redis.get<UnifiedEvent>(eventKey(id));
    return { event: current ?? null, changed: false };
  }

  try {
    const existing = await redis.get<UnifiedEvent>(eventKey(id));
    if (!existing) return { event: null, changed: false };

    const updated = updater(existing);
    await redis.set(eventKey(id), updated, { ex: remainingEventTtlSeconds(updated) });
    return { event: updated, changed: true };
  } finally {
    await redis.del(lockKey);
  }
}

/**
 * Resolve an event (approve or dismiss).
 */
export async function resolveEvent(
  id: string,
  status: "approved" | "dismissed",
  opts?: { actor?: string }
): Promise<{ event: UnifiedEvent | null; changed: boolean }> {
  const redis = getRedis();
  if (!redis) return { event: null, changed: false };

  // Atomic claim: the status==='pending' guard below is a read-check-write, so
  // two concurrent resolves (e.g. an owner clicking approve while a cron
  // dismisses) could both read 'pending' and both apply — doubling side effects
  // and the resolutionHistory entry. Take a short per-event lock first; whoever
  // loses the SET NX backs out cleanly.
  const lockKey = `event-lock:${id}`;
  const lock: unknown = await redis.set(lockKey, opts?.actor || "system", {
    nx: true,
    ex: 30,
  });
  // SET NX returns "OK" on the real client; the test mock may return true.
  // Failure to claim is null/undefined/false (matches the pay-links idiom).
  if (lock === null || lock === undefined || lock === false) {
    const current = await redis.get<UnifiedEvent>(eventKey(id));
    return { event: current, changed: false };
  }

  try {
    return await resolveEventLocked(redis, id, status, opts);
  } finally {
    await redis.del(lockKey);
  }
}

async function resolveEventLocked(
  redis: NonNullable<ReturnType<typeof getRedis>>,
  id: string,
  status: "approved" | "dismissed",
  opts?: { actor?: string }
): Promise<{ event: UnifiedEvent | null; changed: boolean }> {
  const existing = await redis.get<UnifiedEvent>(eventKey(id));
  if (!existing) return { event: null, changed: false };

  if (existing.status !== "pending") {
    return { event: existing, changed: false };
  }

  const resolutionHistory = Array.isArray(existing.metadata?.resolutionHistory)
    ? existing.metadata.resolutionHistory
    : [];

  const updated: UnifiedEvent = {
    ...existing,
    status,
    resolvedAt: new Date().toISOString(),
    metadata: {
      ...existing.metadata,
      ...(existing.metadata?.execution
        ? {
            execution: {
              ...existing.metadata.execution,
              state: "completed" as const,
              finishedAt: new Date().toISOString(),
            },
          }
        : {}),
      resolutionHistory: [
        ...resolutionHistory,
        {
          status,
          actor: opts?.actor || "system",
          resolvedAt: new Date().toISOString(),
        },
      ],
    },
  };

  // The zset member is the stable id; only the event:{id} record changes.
  await redis.set(eventKey(id), updated, { ex: remainingEventTtlSeconds(updated) });

  // Postgres shadow-write: mirror the status transition AND the updated metadata
  // (resolutionHistory) so the shadow row stays in parity, not status-frozen.
  // No-op if the row was created before dual-write was enabled. Never throws.
  if (dualWritePgEnabled()) {
    await setEventStatus(id, status, updated.metadata ?? null);
  }

  // Governed-work decision shadow: this is the single durable approve/dismiss
  // chokepoint (fires once, only on the pending→resolved transition), so it maps
  // 1:1 to a `decisions` row. SEPARATE flag + best-effort (see shadow.ts).
  await shadowDecisionFromResolve(id, status, opts?.actor || "system");

  return { event: updated, changed: true };
}

/**
 * Get count of pending events for a tenant.
 *
 * Uses ZCARD on the tenant's event sorted set as a fast upper-bound estimate,
 * avoiding a 1000-event scan + mget. ZCARD includes all statuses (pending,
 * approved, dismissed) and any unresolved legacy members, so the result may
 * over-count — but for the ops-report "queue depth" display this is an
 * acceptable approximation. The governed-work Postgres mirror is authoritative
 * for exact counts when GOVERNED_WORK_READ_PG is on; ZCARD keeps the Redis
 * path cheap. NOTE: Redis stays authoritative for membership/ordering; this
 * count is display-only and must never be used to gate business logic.
 */
export async function getQueueCount(tenantId: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  try {
    const count = await redis.zcard(eventsKey(tenantId));
    return typeof count === "number" ? count : 0;
  } catch {
    // Fall back to the exact count on error.
    const events = await getEvents(tenantId, { status: "pending", limit: 1000 });
    return events.length;
  }
}

/**
 * Prune old events from a tenant's sorted set.
 * Call periodically (e.g., from a cron) to enforce retention.
 */
export async function pruneOldEvents(tenantId: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;

  const cutoff = Date.now() - EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  try {
    const removed = await redis.zremrangebyscore(eventsKey(tenantId), 0, cutoff);
    return typeof removed === "number" ? removed : 0;
  } catch {
    return 0;
  }
}

/**
 * Emit a UnifiedEvent from an activity entry (AI content changes).
 * Called by logActivity when AI makes changes.
 */
export async function emitEventFromActivity(
  entry: {
    text: string;
    type: string;
    section?: string;
    actor?: "user" | "ai" | "admin";
    changes?: { field: string; before: string; after: string }[];
    eventStatus?: UnifiedEvent["status"];
    governanceReason?: string;
  },
  tenant: string = DEFAULT_TENANT,
  opts: AddEventOptions = {}
): Promise<UnifiedEvent | null> {
  // Only emit events for AI actions
  if (entry.actor !== "ai" && entry.type !== "ai") return null;

  const event = await addEvent(
    {
      tenantId: tenant,
      source: "ai",
      type: "content_update",
      title: entry.text,
      body: entry.changes?.map((c) => `${c.field}: ${c.after}`).join("\n") ?? "",
      status: entry.eventStatus ?? "auto_approved",
      metadata: {
        section: entry.section,
        changes: entry.changes,
        governanceReason: entry.governanceReason,
      },
    },
    opts
  );

  return event;
}
