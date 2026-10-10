import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authority: vi.fn(), mutate: vi.fn(), redis: vi.fn(), mirror: vi.fn() }));
vi.mock("@/lib/client-records", () => ({ durableRecordAuthority: mocks.authority, mirrorRecord: mocks.mirror, readRecord: vi.fn(), readRecords: vi.fn() }));
vi.mock("@/lib/workspace-ports", () => ({ workspacePorts: () => ({ clientRecords: async () => ({ mutateRewardRecord: mocks.mutate }) }) }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: mocks.redis }));
import { adjustStars, adjustStarsWithTransaction, saveMember, logTransaction, InsufficientStarsError } from "@/lib/rewards/memberRepositoryKv";
const member = { email: "fictional@example.test", starsAvailable: 100, starsLifetime: 100, tier: "snapper" as const, tierOverride: null, displayName: "Fictional", birthday: null, favoriteFruit: null, badges: [], subscriptionBonusClaimed: false, createdAt: "2026-01-01T00:00:00Z" };
const stored = { ...member, starsAvailable: "120", starsLifetime: "120", tierOverride: "", badges: "[]" };
const actor = { userId: "00000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
beforeEach(() => { vi.resetAllMocks(); mocks.authority.mockResolvedValue(true); mocks.redis.mockReturnValue(null); });
afterEach(() => { vi.restoreAllMocks(); });
describe("qualified durable rewards authority", () => {
  it("saves and normalizes without Redis or a second mirror", async () => {
    mocks.mutate.mockResolvedValue({ status: "saved", member: stored });
    await saveMember("fixture", { ...member, email: " Fictional@Example.Test " });
    expect(mocks.mutate).toHaveBeenCalledWith("fixture", member.email, expect.objectContaining({ operation: "save", member: expect.objectContaining({ email: member.email, starsAvailable: "100" }) }));
    expect(mocks.mirror).not.toHaveBeenCalled();
  });
  it("uses database delta authority without loading a Redis snapshot", async () => {
    mocks.mutate.mockResolvedValue({ status: "adjusted", member: stored });
    expect(await adjustStars("fixture", member.email, 20)).toMatchObject({ starsAvailable: 120, starsLifetime: 120 });
    expect(mocks.mutate).toHaveBeenCalledWith("fixture", member.email, expect.objectContaining({ operation: "adjust", delta: 20, tierThreshold: 500 }));
  });
  it("maps insufficient and absent authoritative members without cache recovery", async () => {
    mocks.mutate.mockResolvedValueOnce({ status: "insufficient", available: 10, requested: 20 }).mockResolvedValueOnce({ status: "missing" });
    await expect(adjustStars("fixture", member.email, -20)).rejects.toMatchObject(new InsufficientStarsError(10, 20));
    expect(await adjustStars("fixture", member.email, -20)).toBeNull();
    expect(mocks.redis).not.toHaveBeenCalled();
  });
  it("fails a selected unavailable authority before any mutation", async () => {
    mocks.authority.mockRejectedValue(new Error("client_records_cutover_not_qualified"));
    await expect(adjustStars("fixture", member.email, 20)).rejects.toThrow("cutover_not_qualified");
    expect(mocks.mutate).not.toHaveBeenCalled(); expect(mocks.redis).not.toHaveBeenCalled();
  });
  it("does not fall back or replay an ambiguous accepted RPC", async () => {
    mocks.mutate.mockRejectedValue(new Error("rewards_mutation_unconfirmed"));
    await expect(adjustStars("fixture", member.email, 20)).rejects.toThrow("unconfirmed");
    expect(mocks.mutate).toHaveBeenCalledOnce(); expect(mocks.redis).not.toHaveBeenCalled();
  });
  it("logs its exact caller-owned reason durably without Redis", async () => {
    mocks.mutate.mockImplementation(async (_tenant, _email, input) => ({ status: "logged", transaction: input.transaction }));
    const txn = await logTransaction("fixture", member.email, "earn", 20, "Native earned reward");
    expect(txn).toMatchObject({ type: "earn", amount: 20, reason: "Native earned reward" });
    expect(mocks.mutate).toHaveBeenCalledWith("fixture", member.email, expect.objectContaining({ operation: "log", transaction: txn }));
  });
  it("commits admin delta, current actor, reason and stable command in one call", async () => {
    mocks.mutate.mockImplementation(async (_tenant, _email, input) => ({ status: "adjusted", member: stored, transaction: input.transaction }));
    const result = await adjustStarsWithTransaction("fixture", member.email, 20, "Owner correction", actor, "owner-correction-1");
    expect(result?.transaction).toMatchObject({ id: "txn_owner-correction-1", type: "admin-credit", amount: 20, reason: "Owner correction" });
    expect(mocks.mutate).toHaveBeenCalledOnce();
    expect(mocks.mutate).toHaveBeenCalledWith("fixture", member.email, expect.objectContaining({ operation: "adjust", commandId: "owner-correction-1", actor, delta: 20 }));
  });
  it("preserves an accepted atomic result when both cache operations fail", async () => {
    const cache = { hset: vi.fn().mockRejectedValue(new Error("outage")), sadd: vi.fn(), eval: vi.fn().mockRejectedValue(new Error("outage")) };
    mocks.redis.mockReturnValue(cache); vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.mutate.mockImplementation(async (_tenant, _email, input) => ({ status: "adjusted", member: stored, transaction: input.transaction }));
    expect(await adjustStarsWithTransaction("fixture", member.email, 20, "Owner correction", actor)).toMatchObject({ member: { starsAvailable: 120 } });
    expect(mocks.mutate).toHaveBeenCalledOnce(); expect(mocks.mirror).not.toHaveBeenCalled();
  });
  it("requires verified actor for the native administration producer", async () => {
    await expect(adjustStarsWithTransaction("fixture", member.email, 20, "Correction")).rejects.toThrow("actor_required");
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("never represents a legacy accepted balance plus failed audit as safely replayable", async () => {
    mocks.authority.mockImplementation(async (store) => store === "reward_transactions");
    const cache = { hgetall: vi.fn().mockResolvedValue({ ...stored, starsAvailable: "100", starsLifetime: "100" }), hincrby: vi.fn().mockResolvedValue(120), hset: vi.fn() };
    mocks.redis.mockReturnValue(cache);
    // The legacy balance path reads its unselected store; audit goes to PG.
    const reads = await import("@/lib/client-records");
    vi.mocked(reads.readRecord).mockImplementation(async (_store, _tenant, _id, read) => read());
    mocks.mutate.mockRejectedValue(new Error("rewards_mutation_unconfirmed"));
    await expect(adjustStarsWithTransaction("fixture", member.email, 20, "Owner correction", actor, "legacy-command")).rejects.toThrow("rewards_legacy_adjustment_unconfirmed");
    expect(cache.hincrby).toHaveBeenCalledTimes(2); expect(mocks.mutate).toHaveBeenCalledOnce();
  });
  it("rejects unsafe deltas before balance authority", async () => {
    await expect(adjustStars("fixture", member.email, Number.MAX_SAFE_INTEGER + 1)).rejects.toThrow("safe integer");
    expect(mocks.mutate).not.toHaveBeenCalled(); expect(mocks.authority).not.toHaveBeenCalled();
  });
});
