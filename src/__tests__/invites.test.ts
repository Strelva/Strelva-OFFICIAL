import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRedis = vi.hoisted(() => vi.fn());

vi.mock("@/lib/redis", () => ({
  getRedis: mockGetRedis,
}));

import { createInvite, InviteStorageError } from "@/lib/invites";

describe("invite storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores invites by lowercase email with a 30-day TTL", async () => {
    const redis = {
      set: vi.fn(() => Promise.resolve("OK")),
    };
    mockGetRedis.mockReturnValue(redis);

    await expect(createInvite("Owner@Example.com", "reb", "admin@example.com")).resolves.toBe(
      true
    );

    expect(redis.set).toHaveBeenCalledWith(
      "reb:invites:owner@example.com",
      expect.objectContaining({
        tenant: "reb",
        invitedBy: "admin@example.com",
      }),
      { ex: 60 * 60 * 24 * 30 }
    );
  });

  it("fails loudly when Redis is not configured", async () => {
    mockGetRedis.mockReturnValue(null);

    await expect(createInvite("owner@example.com", "reb")).rejects.toThrow(
      InviteStorageError
    );
  });

  it("fails loudly when Redis does not confirm storage", async () => {
    const redis = {
      set: vi.fn(() => Promise.resolve(null)),
    };
    mockGetRedis.mockReturnValue(redis);

    await expect(createInvite("owner@example.com", "reb")).rejects.toThrow(
      "Redis did not confirm invite storage"
    );
  });
});
