import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PayLinkConfig } from "@/lib/pay-links";

const mockGetRedis = vi.hoisted(() => vi.fn());

vi.mock("@/lib/redis", () => ({ getRedis: mockGetRedis }));

import {
  savePayLink,
  listPayLinks,
  PayLinkConflictError,
  PayLinkStorageError,
  PAY_LINK_PREFIX,
  PAY_LINK_INDEX_KEY,
} from "@/lib/pay-links";

function fakeRedis() {
  return {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue("OK"),
    sadd: vi.fn().mockResolvedValue(1),
    smembers: vi.fn().mockResolvedValue([]),
    mget: vi.fn().mockResolvedValue([]),
    srem: vi.fn().mockResolvedValue(1),
  };
}

const config: PayLinkConfig = {
  slug: "acme-coffee",
  clientName: "Acme Coffee",
  door: "build",
  tenantId: "acme",
  amountCents: 200_000,
  createdAt: "2026-06-09T00:00:00.000Z",
  createdBy: "jacob@strelva.com",
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("savePayLink", () => {
  it("throws PayLinkStorageError when Redis is unconfigured", async () => {
    mockGetRedis.mockReturnValue(null);
    await expect(savePayLink(config)).rejects.toBeInstanceOf(PayLinkStorageError);
  });

  it("refuses to overwrite an existing slug by default", async () => {
    const redis = fakeRedis();
    redis.get.mockResolvedValue(config); // slug already present
    mockGetRedis.mockReturnValue(redis);
    await expect(savePayLink(config)).rejects.toBeInstanceOf(PayLinkConflictError);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("writes the record and indexes the slug for a new link", async () => {
    const redis = fakeRedis();
    redis.get.mockResolvedValue(null); // not present
    mockGetRedis.mockReturnValue(redis);
    await savePayLink(config);
    expect(redis.set).toHaveBeenCalledWith(
      `${PAY_LINK_PREFIX}acme-coffee`,
      config,
      expect.objectContaining({ ex: expect.any(Number) }),
    );
    expect(redis.sadd).toHaveBeenCalledWith(PAY_LINK_INDEX_KEY, "acme-coffee");
  });

  it("overwrites without the existence check when overwrite:true", async () => {
    const redis = fakeRedis();
    mockGetRedis.mockReturnValue(redis);
    await savePayLink(config, { overwrite: true });
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).toHaveBeenCalled();
    expect(redis.sadd).toHaveBeenCalledWith(PAY_LINK_INDEX_KEY, "acme-coffee");
  });

  it("throws when Redis does not confirm the write", async () => {
    const redis = fakeRedis();
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue(null);
    mockGetRedis.mockReturnValue(redis);
    await expect(savePayLink(config)).rejects.toBeInstanceOf(PayLinkStorageError);
    expect(redis.sadd).not.toHaveBeenCalled();
  });
});

describe("listPayLinks", () => {
  it("returns [] when Redis is unconfigured", async () => {
    mockGetRedis.mockReturnValue(null);
    expect(await listPayLinks()).toEqual([]);
  });

  it("returns [] when the index is empty", async () => {
    const redis = fakeRedis();
    redis.smembers.mockResolvedValue([]);
    mockGetRedis.mockReturnValue(redis);
    expect(await listPayLinks()).toEqual([]);
    expect(redis.mget).not.toHaveBeenCalled();
  });

  it("loads each record, sorts newest-first, and prunes stale slugs", async () => {
    const older: PayLinkConfig = { ...config, slug: "older", createdAt: "2026-06-01T00:00:00.000Z" };
    const newer: PayLinkConfig = { ...config, slug: "newer", createdAt: "2026-06-09T00:00:00.000Z" };
    const redis = fakeRedis();
    redis.smembers.mockResolvedValue(["older", "newer", "ghost"]);
    // mget returns in the same order as the slugs; "ghost" has expired (null).
    redis.mget.mockResolvedValue([older, newer, null]);
    mockGetRedis.mockReturnValue(redis);

    const result = await listPayLinks();
    expect(result.map((c) => c.slug)).toEqual(["newer", "older"]);
    expect(redis.srem).toHaveBeenCalledWith(PAY_LINK_INDEX_KEY, "ghost");
  });

  it("does not call srem when no slugs are stale", async () => {
    const redis = fakeRedis();
    redis.smembers.mockResolvedValue(["acme-coffee"]);
    redis.mget.mockResolvedValue([config]);
    mockGetRedis.mockReturnValue(redis);
    await listPayLinks();
    expect(redis.srem).not.toHaveBeenCalled();
  });
});
