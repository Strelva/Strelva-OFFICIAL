import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: async () => "fictional-tenant" }));
vi.mock("@/platform/infra/auth", () => ({ requireTenantPermission: async () => null, getActorContext: async () => ({ userId: "00000000-0000-4000-8000-000000000001", email: "owner@example.test" }) }));
vi.mock("@/lib/subscription", () => ({ requireActiveSubscription: async () => null }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => null }));
vi.mock("@/platform/client-records/mirror", async (original) => ({ ...await original<typeof import("@/platform/client-records/mirror")>(), clientRecordDb: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/client-records", () => ({ durableRecordAuthority: async () => true }));
// Use the real route, repository, registered port loader and RPC adapter.
import { POST } from "@/app/api/rewards/members/[email]/adjust/route";
import { mutateRewardRecord } from "@/platform/client-records/rewards";
const base = { delta: 20, note: "Owner correction" };
function invoke(body: unknown) { return POST(new Request("http://localhost/api/rewards/adjust", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ email: "fictional%40example.test" }) }); }
beforeEach(() => { vi.resetAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });
describe("rejected transport after authoritative acceptance", () => {
  it.each(["throw", "reject"])("normalizes %s without exposing transport data or losing recovery identity", async (mode) => {
    const rpc = vi.fn(() => { if (mode === "throw") throw new Error("private transport detail"); return Promise.reject(new Error("private transport detail")); });
    await expect(mutateRewardRecord("fixture", "fictional@example.test", { operation: "adjust", commandId: "retained", delta: 20, tierThreshold: 500 }, { rpc })).rejects.toThrow(/^rewards_mutation_unconfirmed$/);
    expect(rpc).toHaveBeenCalledOnce();
  });
  it.each([undefined, "retained-client-command"])("retains actual route command after commit/rejection and recovers without another balance effect (%s)", async (provided) => {
    let effects = 0;
    const receipts = new Map<string, unknown>();
    mocks.rpc.mockImplementation(async (_name, args) => {
      const input = args.p_input;
      const prior = receipts.get(input.commandId);
      if (prior) return { data: prior, error: null };
      effects++;
      const accepted = { status: "adjusted", member: { email: args.p_email, starsAvailable: "120", starsLifetime: "120", tier: "snapper", tierOverride: "", badges: "[]" }, transaction: input.transaction };
      receipts.set(input.commandId, accepted);
      throw new Error("response lost after commit");
    });
    const first = await invoke({ ...base, ...(provided ? { commandId: provided } : {}) });
    expect(first.status).toBe(500);
    const recovery = await first.json();
    expect(recovery).toMatchObject({ recoveryRequired: true, commandId: provided ?? expect.stringMatching(/^[0-9a-f-]{36}$/) });
    const retry = await invoke({ ...base, commandId: recovery.commandId });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ member: { starsAvailable: 120 }, transaction: { id: `txn_${recovery.commandId}` }, commandId: recovery.commandId });
    expect(effects).toBe(1); expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
});
