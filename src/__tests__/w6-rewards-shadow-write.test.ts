import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ redis: { hgetall: vi.fn(), hincrby: vi.fn(), hset: vi.fn() }, mirror: vi.fn() }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => mocks.redis }));
vi.mock("@/lib/client-records", () => ({ mirrorRecord: mocks.mirror, readRecord: (_store: string, _tenant: string, _id: string, read: () => Promise<unknown>) => read() }));
import { adjustStars } from "@/lib/rewards/memberRepositoryKv";
const member = { email: "member@example.test", starsAvailable: "100", starsLifetime: "100", tier: "snapper", tierOverride: "", badges: "[]", createdAt: "2026-10-07T12:00:00Z" };
beforeEach(() => { vi.resetAllMocks(); mocks.redis.hgetall.mockResolvedValue(member); mocks.redis.hincrby.mockResolvedValue(150); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("rewards accepted mutation and shadow writes", () => {
  it.each([["0", "1"], ["1", "0"]])("does no added snapshot read with release=%s and dual-write=%s", async (release, dualWrite) => {
    vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", release); vi.stubEnv("DUAL_WRITE_PG", dualWrite);
    expect(await adjustStars("fixture", member.email, 50)).toMatchObject({ starsAvailable: 150, starsLifetime: 150 });
    expect(mocks.redis.hgetall).toHaveBeenCalledOnce(); expect(mocks.mirror).not.toHaveBeenCalled();
  });
  it("returns the accepted credit when the added snapshot read fails, without replaying increments", async () => {
    vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "1"); vi.stubEnv("DUAL_WRITE_PG", "1");
    mocks.redis.hgetall.mockResolvedValueOnce(member).mockRejectedValueOnce(new Error("snapshot unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await adjustStars("fixture", member.email, 50)).toMatchObject({ starsAvailable: 150, starsLifetime: 150 });
    expect(mocks.redis.hincrby).toHaveBeenCalledTimes(2); expect(mocks.mirror).not.toHaveBeenCalled(); expect(log).toHaveBeenCalledOnce();
  });
  it("mirrors the current hash instead of the pre-mutation member", async () => {
    vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "1"); vi.stubEnv("DUAL_WRITE_PG", "1");
    mocks.redis.hgetall.mockResolvedValueOnce(member).mockResolvedValueOnce({ ...member, starsAvailable: "175", starsLifetime: "175" });
    await adjustStars("fixture", member.email, 50);
    expect(mocks.mirror).toHaveBeenCalledWith("reward_members", "fixture", member.email, expect.objectContaining({ starsAvailable: "175", starsLifetime: "175" }));
  });
});
