/**
 * UnifiedEvent data layer - Redis-backed event queue for dashboard.
 * Uses sorted sets with timestamp scores for efficient time-range queries.
 */

import type { UnifiedEvent } from "./types";
import { getRedis } from "./redis";
import { DEFAULT_TENANT } from "./storage";

/**
 * Redis key for tenant event sorted set.
 * Score = timestamp (ms), Member = JSON-encoded event
 */
function eventsKey(tenantId: string): string {
  return `events:${tenantId}`;
}

/**
 * Redis key for individual event lookup.
 */
function eventKey(eventId: string): string {
  return `event:${eventId}`;
}

/**
 * Add a new event to the queue.
 */
export async function addEvent(
  event: Omit<UnifiedEvent, "id" | "createdAt">
): Promise<UnifiedEvent> {
  const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = new Date().toISOString();
  const full: UnifiedEvent = { ...event, id, createdAt };

  const redis = getRedis();
  if (redis) {
    const score = Date.now();
    // Store in sorted set for listing
    await redis.zadd(eventsKey(event.tenantId), {
      score,
      member: JSON.stringify(full),
    });
    // Store individual event for direct lookup
    await redis.set(eventKey(id), full);
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
  // Get recent events (highest scores = most recent)
  const raw = await redis.zrange(eventsKey(tenantId), 0, limit * 2, {
    rev: true,
  });

  const events: UnifiedEvent[] = [];
  for (const item of raw) {
    try {
      const parsed = typeof item === "string" ? JSON.parse(item) : item;
      if (!opts?.status || parsed.status === opts.status) {
        events.push(parsed);
        if (events.length >= limit) break;
      }
    } catch {
      // Skip malformed entries
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
 * Resolve an event (approve or dismiss).
 */
export async function resolveEvent(
  id: string,
  status: "approved" | "dismissed",
  opts?: { actor?: string }
): Promise<{ event: UnifiedEvent | null; changed: boolean }> {
  const redis = getRedis();
  if (!redis) return { event: null, changed: false };

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

  // Update individual event
  await redis.set(eventKey(id), updated);

  // Update in sorted set - remove old, add new
  const key = eventsKey(existing.tenantId);
  await redis.zrem(key, JSON.stringify(existing));
  await redis.zadd(key, {
    score: new Date(existing.createdAt).getTime(),
    member: JSON.stringify(updated),
  });

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
 * Emit a UnifiedEvent from an activity entry (AI content changes).
 * Called by logActivity when AI makes changes.
 */
export async function emitEventFromActivity(
  entry: {
    text: string;
    type: string;
    section?: string;
    actor?: "user" | "ai";
    changes?: { field: string; before: string; after: string }[];
    eventStatus?: UnifiedEvent["status"];
    governanceReason?: string;
  },
  tenant: string = DEFAULT_TENANT
): Promise<UnifiedEvent | null> {
  // Only emit events for AI actions
  if (entry.actor !== "ai" && entry.type !== "ai") return null;

  const event = await addEvent({
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
  });

  return event;
}
