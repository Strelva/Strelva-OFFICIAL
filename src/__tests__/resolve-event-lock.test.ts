import { afterEach, describe, expect, it, vi } from "vitest";

const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  zadd: vi.fn(),
  zrem: vi.fn(),
  del: vi.fn(),
};
let redisClient: typeof mockRedis | null = mockRedis;

vi.mock("../lib/redis", () => ({
  getRedis: () => redisClient,
}));

import { resolveEvent } from "../lib/events";

const pendingEvent = {
  id: "evt_1",
  tenantId: "tenant-a",
  source: "ai",
  type: "content_update",
  title: "Pending change",
  status: "pending",
  createdAt: new Date("2026-06-01T00:00:00Z").toISOString(),
  metadata: {},
};

describe("resolveEvent atomic lock", () => {
  afterEach(() => {
    vi.clearAllMocks();
    redisClient = mockRedis;
  });

  it("resolves when it wins the lock", async () => {
    mockRedis.set.mockResolvedValueOnce("OK"); // lock acquired
    mockRedis.get.mockResolvedValue({ ...pendingEvent });
    mockRedis.set.mockResolvedValue("OK"); // event write
    mockRedis.zrem.mockResolvedValue(1);
    mockRedis.zadd.mockResolvedValue(1);
    mockRedis.del.mockResolvedValue(1);

    const result = await resolveEvent("evt_1", "approved", { actor: "owner" });

    expect(result.changed).toBe(true);
    expect(result.event?.status).toBe("approved");
    expect(mockRedis.del).toHaveBeenCalledWith("event-lock:evt_1");
  });

  it("backs out without writing when another resolver holds the lock", async () => {
    mockRedis.set.mockResolvedValueOnce(null); // lock contended
    mockRedis.get.mockResolvedValue({ ...pendingEvent });

    const result = await resolveEvent("evt_1", "dismissed", { actor: "cron" });

    expect(result.changed).toBe(false);
    // No mutation of the sorted set / event record while contended.
    expect(mockRedis.zrem).not.toHaveBeenCalled();
    expect(mockRedis.zadd).not.toHaveBeenCalled();
    // And it must not delete a lock it never acquired.
    expect(mockRedis.del).not.toHaveBeenCalled();
  });
});
