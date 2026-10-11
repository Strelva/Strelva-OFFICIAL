import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/workspace/provider-change/route";
const mocks = vi.hoisted(() => ({ enabled: true, actor: vi.fn(), rpc: vi.fn(), limit: vi.fn() }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => mocks.enabled }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.limit }));
vi.mock("@/platform/connect", () => ({ moneyRpc: mocks.rpc }));
vi.mock("@/platform/workspaces/http", async original => ({ ...await original<typeof import("@/platform/workspaces/http")>(), workspaceHttpActor: mocks.actor }));
const id = "b9100000-0000-4000-8000-000000000001";
const actor = { userId: id, verifiedEmail: "owner@example.test" };
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/workspace/provider-change", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}
beforeEach(() => { vi.clearAllMocks(); mocks.enabled = true; vi.stubEnv("STRELVA_PROVIDER_CHANGE", "1"); mocks.actor.mockResolvedValue(actor); mocks.limit.mockResolvedValue(false); mocks.rpc.mockResolvedValue({ id, status: "cancelled" }); });
afterEach(() => vi.unstubAllEnvs());
describe("provider change cancellation HTTP boundary", () => {
  it("passes cancellation to the service-only RPC with the verified server actor", async () => {
    expect((await POST(request({ action: "cancel", requestId: id }))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("cancel_provider_change", { p_request_id: id, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail });
  });
  it("keeps recovery disabled behind both unchanged release gates", async () => {
    mocks.enabled = false; expect((await POST(request({ action: "cancel", requestId: id }))).status).toBe(503);
    mocks.enabled = true; vi.stubEnv("STRELVA_PROVIDER_CHANGE", "0"); expect((await POST(request({ action: "cancel", requestId: id }))).status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requires a signed-in actor and same-origin write", async () => {
    expect((await POST(request({ action: "cancel", requestId: id }, { origin: "https://outside.example" }))).status).toBe(403);
    mocks.actor.mockResolvedValue(null); expect((await POST(request({ action: "cancel", requestId: id }))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects actor/policy/provider fields instead of accepting browser authority", async () => {
    for (const extra of [{ userId: id }, { verifiedEmail: "other@example.test" }, { workspaceId: id }, { responseWindow: 0 }, { agencyWorkspaceId: id }]) {
      expect((await POST(request({ action: "cancel", requestId: id, ...extra }))).status).toBe(400);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("throttles and preserves native authority failures", async () => {
    mocks.limit.mockResolvedValue(true); expect((await POST(request({ action: "cancel", requestId: id }))).status).toBe(429); expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.limit.mockResolvedValue(false); mocks.rpc.mockRejectedValue(new Error("private SQL detail"));
    const response = await POST(request({ action: "cancel", requestId: id })); expect(response.status).toBe(503); expect(await response.text()).not.toContain("private SQL detail");
  });
});
