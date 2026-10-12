import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authenticated: vi.fn(), permission: vi.fn(), actor: vi.fn(), tenant: vi.fn(), select: vi.fn() }));
vi.mock("@/platform/infra/auth", () => ({ verifyAuth: mocks.authenticated, requireTenantPermission: mocks.permission, getActorContext: mocks.actor, requireTenantAccess: vi.fn() }));
vi.mock("@/platform/operator-read-audit/admission", () => ({ authorizeTenantOperatorRead: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: mocks.tenant }));
vi.mock("@/lib/google-resources", () => ({ selectGoogleResource: mocks.select, discoverGoogleResources: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => { throw new Error("Ambient database calls are forbidden."); } }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: () => { throw new Error("Ambient Auth calls are forbidden."); } }));
import { POST } from "@/app/api/connections/google/resources/route";
const actor = { userId: "bc000000-0000-4000-8000-000000000001", verifiedEmail: "editor@example.test" };
const post = (kind = "gbp") => POST(new Request("https://fictional.test/api/connections/google/resources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, resourceId: "exact-resource" }) }));
beforeEach(() => {
  vi.resetAllMocks(); vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.authenticated.mockResolvedValue(true); mocks.permission.mockResolvedValue(null); mocks.tenant.mockResolvedValue("fictional-tenant");
  mocks.actor.mockResolvedValue({ userId: actor.userId, email: " Editor@Example.test ", type: "user" }); mocks.select.mockResolvedValue({ selected: "exact-resource" });
});
afterEach(() => { vi.restoreAllMocks(); });
describe("GBP resource HTTP settings actor", () => {
  it("forwards the normalized current actor after settings permission into GBP selection", async () => {
    expect((await post()).status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith("fictional-tenant", "settings:write");
    expect(mocks.actor).toHaveBeenCalledWith("fictional-tenant"); expect(mocks.select).toHaveBeenCalledExactlyOnceWith("fictional-tenant", "gbp", "exact-resource", actor);
  });
  it("rejects an unverified actor before any GBP discovery", async () => {
    mocks.actor.mockResolvedValue({ userId: actor.userId, email: null, type: "user" }); expect((await post()).status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("preserves early settings denial before actor capture and selection", async () => {
    mocks.permission.mockResolvedValue(Response.json({ error: "denied" }, { status: 403 })); expect((await post()).status).toBe(403);
    expect(mocks.actor).not.toHaveBeenCalled(); expect(mocks.select).not.toHaveBeenCalled();
  });
  it.each([["google_operation_superseded", 409], ["persistence_unavailable", 503], ["google_settings_permission_denied", 403]] as const)("reports %s as sanitized %s", async (code, status) => {
    mocks.select.mockRejectedValue(new Error(code)); const response = await post(); expect(response.status).toBe(status);
    expect(JSON.stringify(await response.json())).not.toContain(code); expect(console.error).not.toHaveBeenCalled();
  });
  it("does not expose raw save failures in response or logs", async () => {
    mocks.select.mockRejectedValue(new Error("fictional-provider-token-secret-canary")); const response = await post(); expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret-canary"); expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret-canary");
  });
  it.each(["ga4", "gsc"])("retains existing %s settings flow without requiring a GBP actor", async kind => {
    expect((await post(kind)).status).toBe(200); expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith("fictional-tenant", kind, "exact-resource", undefined);
  });
});
