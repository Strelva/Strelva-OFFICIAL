import { describe, expect, it, vi } from "vitest";
import { mutateRewardRecord } from "@/platform/client-records/rewards";
const input = { operation: "adjust" as const, commandId: "proof", delta: -20, tierThreshold: 500, transaction: { id: "txn_proof", type: "admin-debit", amount: 20, reason: "Owner correction", timestamp: "2026-10-09T00:00:00Z" }, actor: { userId: "00000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" } };
describe("durable rewards RPC response boundaries", () => {
  it("sends exact native input to one authoritative RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { status: "adjusted", member: { email: "fictional@example.test", starsAvailable: "80", starsLifetime: "100", tier: "snapper" }, transaction: input.transaction }, error: null });
    expect(await mutateRewardRecord("fixture", "fictional@example.test", input, { rpc })).toMatchObject({ status: "adjusted", transaction: input.transaction });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mutate_tenant_reward_record", { p_tenant_id: "fixture", p_email: "fictional@example.test", p_input: input });
  });
  it.each([null, {}, { status: "updated" }, { status: "adjusted", member: [] }, { status: "insufficient", available: -1, requested: 20 }, { status: "adjusted", member: {}, transaction: { ...input.transaction, reason: "Someone else's reason" } }])("rejects malformed or unbound acceptance %j", async (data) => {
    await expect(mutateRewardRecord("fixture", "fictional@example.test", input, { rpc: vi.fn().mockResolvedValue({ data, error: null }) })).rejects.toThrow("unconfirmed");
  });
  it("does not expose SQL member identifiers after an unknown result", async () => {
    await expect(mutateRewardRecord("fixture", "fictional@example.test", input, { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "private SQL fixture detail" } }) })).rejects.toThrow(/^rewards_mutation_unconfirmed$/);
  });
  it.each(["rewards_access_denied", "rewards_command_conflict"])("preserves safe explicit boundary %s", async (message) => {
    await expect(mutateRewardRecord("fixture", "fictional@example.test", input, { rpc: vi.fn().mockResolvedValue({ data: null, error: { message } }) })).rejects.toThrow(message);
  });
});
