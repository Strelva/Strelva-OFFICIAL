import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedEvent } from "../lib/types";

// In-memory Redis stand-in that models SET NX semantics for the
// `event-lock:{id}` key plus get/set/zrem/zadd for the event record.
// The lock is the contention point updateEvent serializes on.
const store = new Map<string, unknown>();
const locks = new Set<string>();

const mockRedis = {
  set: vi.fn(async (key: string, value: unknown, opts?: { nx?: boolean }) => {
    if (opts?.nx) {
      if (locks.has(key)) return null; // already held -> NX fails
      locks.add(key);
      return "OK";
    }
    store.set(key, value);
    return "OK";
  }),
  get: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
  del: vi.fn(async (key: string) => {
    locks.delete(key);
    store.delete(key);
    return 1;
  }),
  zrem: vi.fn(async () => 1),
  zadd: vi.fn(async () => 1),
};

vi.mock("../lib/redis", () => ({
  getRedis: () => mockRedis,
}));

import { updateEvent } from "../lib/events";

function seedEvent(partial: Partial<UnifiedEvent> = {}): UnifiedEvent {
  const event: UnifiedEvent = {
    id: partial.id ?? "evt_lock",
    tenantId: partial.tenantId ?? "tenant-a",
    source: partial.source ?? "website",
    type: partial.type ?? "change_request",
    title: partial.title ?? "Some request",
    body: partial.body ?? "",
    status: partial.status ?? "pending",
    createdAt: partial.createdAt ?? "2026-06-01T00:00:00.000Z",
    metadata: partial.metadata,
  } as UnifiedEvent;
  store.set(`event:${event.id}`, event);
  return event;
}

describe("updateEvent lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    locks.clear();
  });

  it("applies the update under the lock and releases it", async () => {
    seedEvent({ id: "evt_1", title: "before" });

    const result = await updateEvent("evt_1", (e) => ({ ...e, title: "after" }));

    expect(result.changed).toBe(true);
    expect(result.event?.title).toBe("after");
    // Lock acquired then released.
    expect(mockRedis.set).toHaveBeenCalledWith(
      "event-lock:evt_1",
      "1",
      expect.objectContaining({ nx: true })
    );
    expect(mockRedis.del).toHaveBeenCalledWith("event-lock:evt_1");
    expect(locks.has("event-lock:evt_1")).toBe(false);
  });

  it("loser re-reads and returns current event without mutating", async () => {
    seedEvent({ id: "evt_1", title: "current" });
    // Simulate a concurrent holder already owning the lock.
    locks.add("event-lock:evt_1");

    const updater = vi.fn((e: UnifiedEvent) => ({ ...e, title: "should-not-apply" }));
    const result = await updateEvent("evt_1", updater);

    expect(result.changed).toBe(false);
    expect(result.event?.title).toBe("current");
    expect(updater).not.toHaveBeenCalled();
    expect(mockRedis.zrem).not.toHaveBeenCalled();
    expect(mockRedis.zadd).not.toHaveBeenCalled();
  });

  it("releases the lock even when the updater throws", async () => {
    seedEvent({ id: "evt_1" });

    await expect(
      updateEvent("evt_1", () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(mockRedis.del).toHaveBeenCalledWith("event-lock:evt_1");
    expect(locks.has("event-lock:evt_1")).toBe(false);
  });

  it("returns {event:null,changed:false} when redis is unavailable", async () => {
    // Force getRedis() to return null for this case only.
    const redisModule = await import("../lib/redis");
    const spy = vi.spyOn(redisModule, "getRedis").mockReturnValueOnce(null);

    const result = await updateEvent("evt_missing", (e) => e);
    expect(result).toEqual({ event: null, changed: false });

    spy.mockRestore();
  });

  it("returns null event when the event does not exist (lock still released)", async () => {
    const result = await updateEvent("evt_absent", (e) => e);
    expect(result).toEqual({ event: null, changed: false });
    expect(mockRedis.del).toHaveBeenCalledWith("event-lock:evt_absent");
  });
});
