import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), config: vi.fn(), connections: vi.fn(), disconnect: vi.fn(), audit: vi.fn() }));
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: mocks.admin }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mocks.config }));
vi.mock("@/lib/connections", () => ({ getConnections: mocks.connections }));
vi.mock("@/lib/provider-disconnect", () => ({ disconnectTenantProvider: mocks.disconnect }));
vi.mock("@/platform/operator-read-audit/admission", () => ({ authorizeAdminOperatorRead: mocks.audit }));
import { GET, DELETE } from "@/app/api/admin/tenants/[id]/connections/route";
import { POST as analytics } from "@/app/api/admin/tenants/[id]/analytics-config/route";
import { PUT as goal, DELETE as clearGoal } from "@/app/api/admin/tenants/[id]/goal/route";
import { POST as redeploy } from "@/app/api/admin/tenants/[id]/redeploy/route";
const context = { params: Promise.resolve({ id: "client" }) };
const request = new Request("http://localhost/api/admin/tenants/client/connections", { method: "DELETE", body: '{"provider":"google"}' });
beforeEach(() => {
  vi.resetAllMocks(); mocks.admin.mockResolvedValue(true); mocks.config.mockResolvedValue({ id: "client" });
  mocks.connections.mockResolvedValue([{ provider: "google", tenantId: "client", status: "connected", scopes: [], accessToken: "fixture-token-not-a-real-credential" }]);
});
describe("platform inspection of client settings", () => {
  it("reads safe connection metadata without exposing tokens", async () => {
    const res = await GET(new Request(request.url), context);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ connections: [{ provider: "google", tenantId: "client", status: "connected", scopes: [], lastSyncedAt: null, expiresAt: null }] });
    expect(mocks.audit).toHaveBeenCalledWith("admin.tenant-controls.read");
  });
  it("refuses settings, goal and publication commands before any client/provider read", async () => {
    for (const command of [DELETE, analytics, goal, clearGoal, redeploy]) expect((await command(request, context)).status).toBe(410);
    expect(mocks.config).not.toHaveBeenCalled(); expect(mocks.connections).not.toHaveBeenCalled(); expect(mocks.disconnect).not.toHaveBeenCalled();
    mocks.admin.mockResolvedValue(false);
    expect((await DELETE(request, context)).status).toBe(403);
  });
});
