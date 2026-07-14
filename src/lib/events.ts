/**
 * UnifiedEvent data layer - Redis-backed event queue for dashboard.
 * Uses sorted sets with timestamp scores for efficient time-range queries.
 */

import type { UnifiedEvent } from "./types";
import { getRedis } from "./redis";
import { DEFAULT_TENANT } from "./storage/core";
import { insertEvent, setEventStatus } from "./db/repositories";
import { dualWritePgEnabled, eventToInsert } from "./db/dual-write";

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
  // means the provider write did not happen. A processing marker survives the
  // lock and forces operator reconciliation instead of risking a duplicate.
  if (existing.metadata?.execution?.state === "processing") {
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

  return full;
}

/**
 * Get events for a tenant, optionally filtered by status.
 */
export async function getEvents(
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

export async function getEvent(id: string): Promise<UnifiedEvent | null> {
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
 * NOTE: `getEvents` only scans the most-recent slice of the zset (see its
 * window note), so we ask for a large limit here. A pending custom request is
 * resolved as soon as the build wraps, so it lives near the top of the recency
 * window in practice; 1000 covers any realistic backlog of recent events.
 */
export async function getOpenChangeRequest(
  tenantId: string
): Promise<UnifiedEvent | null> {
  const pending = await getEvents(tenantId, { status: "pending", limit: 1000 });
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

  return { event: updated, changed: true };
}

/**
 * Get count of pending events for a tenant.
 */
export async function getQueueCount(tenantId: string): Promise<number> {
  const events = await getEvents(tenantId, { status: "pending", limit: 1000 });
  return events.length;
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
