import { afterEach, describe, expect, it, vi } from "vitest";
import type { UnifiedEvent } from "../lib/types";

// In-memory Redis honoring the pieces the event store uses: a zset of
// {score, member}, a string KV for event:{id}, and mget over it.
let kv: Map<string, UnifiedEvent>;
let zmembers: string[]; // newest-first

const mockRedis = {
  zadd: vi.fn(async (_key: string, entry: { score: number; member: string }) => {
    zmembers.unshift(entry.member);
    return 1;
  }),
  set: vi.fn(async (key: string, value: UnifiedEvent) => {
    kv.set(key, value);
    return "OK";
  }),
  zrange: vi.fn(async () => zmembers),
  mget: vi.fn(async (...keys: string[]) => keys.map((k) => kv.get(k) ?? null)),
  get: vi.fn(async (key: string) => kv.get(key) ?? null),
  zremrangebyscore: vi.fn(async (_key: string, _min: number, _max: number) => 0),
};

vi.mock("../lib/redis", () => ({ getRedis: () => mockRedis }));

import { addEvent, getEvents } from "../lib/events";

function evt(p: Partial<UnifiedEvent>): UnifiedEvent {
  return {
    id: p.id ?? "evt_x",
    tenantId: p.tenantId ?? "t1",
    source: p.source ?? "ai",
    type: p.type ?? "content_update",
    title: p.title ?? "x",
    status: p.status ?? "pending",
    createdAt: p.createdAt ?? "2026-06-01T00:00:00.000Z",
    metadata: p.metadata,
  } as UnifiedEvent;
}

describe("events id-based zset members", () => {
  afterEach(() => {
    vi.clearAllMocks();
    kv = new Map();
    zmembers = [];
  });

  it("stores the event id (not JSON) as the zset member", async () => {
    kv = new Map();
    zmembers = [];
    const created = await addEvent({ tenantId: "t1", source: "ai", type: "review", title: "hi", body: "", status: "pending" });
    expect(mockRedis.zadd).toHaveBeenCalledOnce();
    const entry = mockRedis.zadd.mock.calls[0]![1] as { member: string; score: number };
    expect(entry.member).toBe(created.id);
    expect(entry.member.startsWith("evt_")).toBe(true);

    // The index is pruned by score on every add so it can't outgrow the record
    // TTL (90 days). Cutoff = this add's score minus the 90-day window in ms.
    const TTL_MS = 90 * 24 * 60 * 60 * 1000;
    expect(mockRedis.zremrangebyscore).toHaveBeenCalledOnce();
    const [, min, max] = mockRedis.zremrangebyscore.mock.calls[0]!;
    expect(min).toBe(0);
    expect(max).toBe(entry.score - TTL_MS);
  });

  it("reads bare-id members by resolving event:{id}", async () => {
    kv = new Map([["event:evt_1", evt({ id: "evt_1", status: "pending", title: "a" })]]);
    zmembers = ["evt_1"];
    const events = await getEvents("t1", { status: "pending" });
    expect(events.map((e) => e.id)).toEqual(["evt_1"]);
    expect(events[0]!.title).toBe("a");
  });

  it("prefers the fresh event:{id} status over a stale legacy JSON member", async () => {
    // Legacy member is frozen as 'pending'; the authoritative record was resolved.
    const legacy = evt({ id: "evt_2", status: "pending" });
    kv = new Map([["event:evt_2", evt({ id: "evt_2", status: "approved" })]]);
    zmembers = [JSON.stringify(legacy)];
    const pending = await getEvents("t1", { status: "pending" });
    expect(pending).toHaveLength(0); // not stale-pending anymore
    const approved = await getEvents("t1", { status: "approved" });
    expect(approved.map((e) => e.id)).toEqual(["evt_2"]);
  });

  it("falls back to the embedded legacy body when the record has aged out", async () => {
    const legacy = evt({ id: "evt_3", status: "pending", title: "legacy-only" });
    kv = new Map(); // no event:{id} record
    zmembers = [JSON.stringify(legacy)];
    const events = await getEvents("t1", { status: "pending" });
    expect(events.map((e) => e.id)).toEqual(["evt_3"]);
    expect(events[0]!.title).toBe("legacy-only");
  });
});
