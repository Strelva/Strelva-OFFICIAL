import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/workspace/agency-proposals/route";
const mocks = vi.hoisted(() => ({ enabled: true, actor: vi.fn(), rpc: vi.fn(), limit: vi.fn() }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => mocks.enabled }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.limit }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/platform/workspaces/http", async original => ({ ...await original<typeof import("@/platform/workspaces/http")>(), workspaceHttpActor: mocks.actor }));
const agencyId = "44444444-4444-4444-8444-444444444444";
const businessId = "55555555-5555-4555-8555-555555555555";
const proposalId = "a".repeat(64);
const actor = { userId: businessId, verifiedEmail: "owner@example.test" };
const body = { agencyId, businessId, proposalId, accept: true };
function request(input: unknown = body, origin = "http://localhost") {
  return new Request("http://localhost/api/workspace/agency-proposals", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(input) });
}
beforeEach(() => { vi.clearAllMocks(); mocks.enabled = true; mocks.actor.mockResolvedValue(actor); mocks.limit.mockResolvedValue(false); mocks.rpc.mockResolvedValue({ data: { status: "accepted" }, error: null }); });
describe("exact agency proposal HTTP and server contract", () => {
  it("binds the reviewed immutable proposal to the server-authenticated actor", async () => {
    const result = await POST(request());
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ status: "accepted" });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("respond_to_agency_proposal", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_agency_id: agencyId, p_business_id: businessId, p_accept: true, p_proposal_id: proposalId });
  });
  it("rejects missing identity, malformed identity and browser-selected owner authority", async () => {
    for (const input of [{ agencyId, businessId, accept: true }, { ...body, proposalId: "latest" }, { ...body, proposedBy: actor.userId }]) {
      expect((await POST(request(input))).status).toBe(400);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([
    ["agency_proposal_stale", "This request changed"],
    ["agency_proposal_identity_required", "This request changed"],
    ["agency_proposal_owner_required", "no longer has authority"],
    ["agency_proposal_not_found", "nothing waiting"],
  ])("refuses %s without claiming acceptance", async (message, copy) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message } });
    const response = await POST(request());
    expect(response.status).toBe(409);
    const result = await response.json(); expect(result.error).toContain(copy); expect(result).not.toHaveProperty("status");
  });
  it("requires current agency authority, same origin, a verified actor and the release gate", async () => {
    expect((await POST(request(body, "https://foreign.example"))).status).toBe(403);
    mocks.actor.mockResolvedValue(null); expect((await POST(request())).status).toBe(401);
    mocks.enabled = false; expect((await POST(request())).status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.enabled = true; mocks.actor.mockResolvedValue(actor);
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "agency_directory_denied" } });
    expect((await POST(request())).status).toBe(403);
  });
  it("fails closed when an old proposal projection has no exact identity", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "read_agency_directory" ? [] : [{ businessWorkspaceId: businessId, businessName: "Bakery", consent: "Old consent", proposedAt: "2026-10-12T00:00:00Z", scopes: [{ scope: "website", level: "prepare" }] }], error: null }));
    const response = await GET(new Request(`http://localhost/api/workspace/agency-proposals?agencyId=${agencyId}`));
    expect(response.status).toBe(503); expect(await response.json()).not.toHaveProperty("proposals");
  });
});
