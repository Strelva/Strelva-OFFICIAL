import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRedis = vi.hoisted(() => vi.fn());
const mockCreateInvitePg = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));

vi.mock("@/lib/redis", () => ({
  getRedis: mockGetRedis,
}));
vi.mock("@/lib/db/repositories", () => ({
  createInvite: mockCreateInvitePg,
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

  it("also writes the invite to Postgres (load-bearing for the Supabase auth path)", async () => {
    const redis = { set: vi.fn(() => Promise.resolve("OK")) };
    mockGetRedis.mockReturnValue(redis);

    await createInvite("Owner@Example.com", "gldf", "admin@example.com");

    // lowercased email, tenant_id, role; no invited_by (it's a users(id) FK).
    expect(mockCreateInvitePg).toHaveBeenCalledWith({
      email: "owner@example.com",
      tenant_id: "gldf",
      role: "owner",
    });
  });

  it("does not reach the Postgres write when Redis fails first", async () => {
    mockGetRedis.mockReturnValue(null);
    await expect(createInvite("owner@example.com", "gldf")).rejects.toThrow(InviteStorageError);
    expect(mockCreateInvitePg).not.toHaveBeenCalled();
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
