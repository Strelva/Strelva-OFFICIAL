import { beforeEach, describe, expect, it, vi } from "vitest";
const ports = vi.hoisted(() => ({ rate: vi.fn(), session: vi.fn(), authorize: vi.fn(), parse: vi.fn(), rpc: vi.fn() }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: ports.session }));
vi.mock("@/platform/agent-channel/oauth", async original => ({
  ...await original<typeof import("@/platform/agent-channel/oauth")>(),
  authorizeAgent: ports.authorize, parseAuthorization: ports.parse, oauthRpc: ports.rpc,
}));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedAsync: ports.rate, rateLimitKey: () => "fixture" }));
import { POST as authorize } from "@/app/api/mcp/oauth/authorize/route";
import { POST as revoke } from "@/app/api/mcp/oauth/revoke/route";
const token = "a".repeat(43);
const workspaceId = "ac161100-0000-4000-8000-000000000010";
const params = { client_id: "https://assistant.example/client.json" };
function request(path: string, body: unknown, origin: string | null = "https://app.strelva.test", other: Record<string,string> = {}) {
  return new Request(`https://app.strelva.test/api/mcp/oauth/${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}), ...other }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.clearAllMocks(); ports.rate.mockResolvedValue(false);
  vi.stubEnv("STRELVA_MCP_OAUTH", "1"); vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  ports.session.mockResolvedValue({ id: "ac161100-0000-4000-8000-000000000001", email: "owner@example.test", email_confirmed_at: "2026-10-07T00:00:00Z" });
  ports.authorize.mockResolvedValue("https://assistant.example/callback?code=opaque");
  ports.rpc.mockResolvedValue(true);
});
describe("assistant consent and revocation routes", () => {
  it("rejects missing, foreign and cross-site consent origins before authorization", async () => {
    for (const origin of [null,"https://evil.example"]) expect((await authorize(request("authorize", {decision:"approve",workspaceId,params},origin))).status).toBe(403);
    expect((await authorize(request("authorize", {decision:"approve",workspaceId,params},undefined,{"sec-fetch-site":"cross-site"}))).status).toBe(403);
    expect(ports.authorize).not.toHaveBeenCalled(); expect(ports.session).not.toHaveBeenCalled();
  });
  it("requires a verified session and an explicit business approval", async () => {
    ports.session.mockResolvedValue(null);
    expect((await authorize(request("authorize", {decision:"approve",workspaceId,params}))).status).toBe(401);
    ports.session.mockResolvedValue({id:workspaceId,email:"owner@example.test"});
    expect((await authorize(request("authorize", {decision:"approve",workspaceId,params}))).status).toBe(401);
    expect(ports.authorize).not.toHaveBeenCalled();
  });
  it("issues only the explicit selection and returns a no-store redirect receipt", async () => {
    const response = await authorize(request("authorize", {decision:"approve",workspaceId,agencyId:null,params}));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(ports.authorize).toHaveBeenCalledWith({userId:"ac161100-0000-4000-8000-000000000001",verifiedEmail:"owner@example.test"},params,workspaceId,null);
  });
  it("does not authorize when denied and preserves safe registered state", async () => {
    ports.parse.mockResolvedValue({params:{redirect_uri:"https://assistant.example/callback",state:"opaque"}});
    const response = await authorize(request("authorize", {decision:"deny",params}));
    expect(new URL((await response.json()).redirectTo).searchParams.get("error")).toBe("access_denied");
    expect(ports.authorize).not.toHaveBeenCalled();
  });
  it("does not accept raw bearers for owner management", async () => {
    expect((await revoke(request("revoke",{token}))).status).toBe(400);
    expect(ports.rpc).not.toHaveBeenCalled();
  });
  it("supports client-bound public RFC7009 revocation with singleton fields", async () => {
    const form = (body:string) => new Request("https://app.strelva.test/api/mcp/oauth/revoke",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
    expect((await revoke(form(`client_id=client&token=${token}&token=${token}`))).status).toBe(400);
    expect(ports.rpc).not.toHaveBeenCalled();
    expect((await revoke(form(`client_id=client&token=${token}`))).status).toBe(200);
    expect(ports.rpc).toHaveBeenCalledWith("revoke_agent_oauth_client_token",expect.objectContaining({p_client_id:"client"}));
    expect(ports.session).not.toHaveBeenCalled();
  });
});
