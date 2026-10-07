import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ redis: vi.fn(), range: vi.fn() }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: mocks.redis }));
import { getRecentFailures } from "@/lib/revalidate-client";
beforeEach(() => { vi.clearAllMocks(); mocks.redis.mockReturnValue(null); });
describe("operator revalidation failure source", () => {
  it("the legacy reader still degrades while a strict queue read names missing storage", async () => {
    expect(await getRecentFailures()).toEqual([]); await expect(getRecentFailures({ requireStore: true })).rejects.toThrow("unavailable");
  });
  it("preserves unavailable and malformed reads as failures for the released queue", async () => {
    mocks.redis.mockReturnValue({ zrange: mocks.range }); mocks.range.mockRejectedValue(new Error("Redis read failed"));
    expect(await getRecentFailures()).toEqual([]); await expect(getRecentFailures({ requireStore: true })).rejects.toThrow("Redis read failed");
    mocks.range.mockResolvedValue(["{broken"]); await expect(getRecentFailures({ requireStore: true })).rejects.toThrow();
    mocks.range.mockResolvedValue([{}]); await expect(getRecentFailures({ requireStore: true })).rejects.toThrow("record unavailable");
  });
});
