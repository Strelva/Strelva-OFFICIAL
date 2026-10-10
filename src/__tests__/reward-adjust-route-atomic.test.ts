import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), subscription: vi.fn(), mutate: vi.fn(), actor: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: async () => "fictional-tenant" }));
vi.mock("@/platform/infra/auth", () => ({ requireTenantPermission: mocks.permission, getActorContext: mocks.actor }));
vi.mock("@/lib/subscription", () => ({ requireActiveSubscription: mocks.subscription }));
vi.mock("@/lib/rewards/memberRepositoryKv", () => ({ adjustStarsWithTransaction: mocks.mutate, InsufficientStarsError: class extends Error {} }));
import { POST } from "@/app/api/rewards/members/[email]/adjust/route";
const body = { delta: -20, note: " Owner correction ", commandId: "retained-command" };
const actor = { userId: "00000000-0000-4000-8000-000000000001", email: "owner@example.test" };
function invoke(value: unknown = body) { return POST(new Request("http://localhost/api/rewards/adjust", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) }), { params: Promise.resolve({ email: "fictional%40example.test" }) }); }
beforeEach(() => { vi.resetAllMocks(); mocks.permission.mockResolvedValue(null); mocks.subscription.mockResolvedValue(null); mocks.actor.mockResolvedValue(actor); mocks.mutate.mockResolvedValue({ member: { starsAvailable: 80 }, transaction: { id: "txn_retained-command" } }); });
afterEach(() => { vi.restoreAllMocks(); });
describe("native rewards adjustment producer", () => {
  it("binds server actor, trimmed caller reason and retained command to one mutation", async () => {
    const response = await invoke();
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ member: { starsAvailable: 80 }, transaction: { id: "txn_retained-command" }, commandId: "retained-command" });
    expect(mocks.permission).toHaveBeenCalledWith("fictional-tenant", "settings:write");
    expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith("fictional-tenant", "fictional@example.test", -20, "Owner correction", { userId: actor.userId, verifiedEmail: actor.email }, "retained-command");
  });
  it("preserves the old response/body contract when no commandId is supplied", async () => {
    expect((await invoke({ delta: -20, note: "Owner correction" })).status).toBe(200);
    expect(mocks.mutate.mock.calls[0]?.[5]).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("does not mutate after the existing permission or subscription gate denies", async () => {
    mocks.permission.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await invoke()).status).toBe(403); expect(mocks.mutate).not.toHaveBeenCalled();
    mocks.permission.mockResolvedValue(null); mocks.subscription.mockResolvedValue(new Response(null, { status: 402 }));
    expect((await invoke()).status).toBe(402); expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it.each([{ delta: Number.MAX_SAFE_INTEGER + 1, note: "Owner correction" }, { ...body, commandId: "bad command" }, { ...body, note: " " }])("rejects invalid input before mutation", async (value) => {
    expect((await invoke(value)).status).toBe(422); expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it.each([["rewards_access_denied", 403], ["rewards_command_conflict", 409], ["rewards_mutation_unconfirmed", 500]] as const)("surfaces %s without attempting another mutation", async (message, status) => {
    vi.spyOn(console, "error").mockImplementation(() => {}); mocks.mutate.mockRejectedValue(new Error(message));
    const response = await invoke();
    expect(response.status).toBe(status); expect(mocks.mutate).toHaveBeenCalledOnce();
    if (message === "rewards_mutation_unconfirmed") expect(await response.json()).toMatchObject({ commandId: "retained-command", recoveryRequired: true });
  });
});
