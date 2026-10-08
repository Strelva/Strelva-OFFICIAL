import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), session: vi.fn(), membership: vi.fn(), rpc: vi.fn(), dev: vi.fn(), oldGuard: vi.fn(), config: vi.fn(), leads: vi.fn(), all: vi.fn(), memberIds: vi.fn(), admin: vi.fn(), internal: vi.fn(), inbox: vi.fn() }));
vi.mock("@/platform/infra/auth", async (original) => ({ ...await original<typeof import("@/platform/infra/auth")>(), getAuthenticatedOperatorContext: mocks.context, isSuperAdmin: mocks.admin, getAuthUserId: async () => "00000000-0000-4000-8000-000000000001", getCurrentUserTenants: mocks.memberIds, hasDashboardViewAccess: mocks.oldGuard, requireTenantAccess: vi.fn(async () => null), requireTenantPermission: vi.fn(async () => null) }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/platform/infra/db/repositories", () => ({ getMembershipRole: mocks.membership, isSuperAdminUser: mocks.admin }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/platform/infra/dev-access", () => ({ isDevAccessBypassEnabled: mocks.dev }));
vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: async () => "site-a", requireTenantFromHeaders: async () => "site-a" }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mocks.config, getAllTenants: mocks.all, isActiveTenant: () => true }));
vi.mock("@/lib/client-leads", () => ({ getClientLeadsForOperator: mocks.leads }));
vi.mock("@/lib/domains", () => ({ listTenantDomainClaims: vi.fn(async () => []), serializeDomainClaim: vi.fn() }));
vi.mock("@/platform/operator-queue/domain-view-loader", () => ({ loadDomainView: vi.fn(async () => ({})) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("redirect"); }) }));
vi.mock("@/products/operations/server", () => ({ listOperationalExceptions: mocks.internal, listAuthorizedOperationalInbox: mocks.inbox }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
import { authorizeAdminOperatorRead, authorizePlatformOperatorRead, authorizeTenantOperatorRead } from "@/platform/operator-read-audit/admission";
import { requireDashboardView } from "@/lib/dashboard-auth";
const actor = { userId: "00000000-0000-4000-8000-000000000001", verifiedEmail: "operator@example.com" };
beforeEach(() => {
  vi.clearAllMocks(); mocks.dev.mockReturnValue(false); mocks.membership.mockResolvedValue(null);
  mocks.session.mockResolvedValue({ id: actor.userId, email: actor.verifiedEmail, email_confirmed_at: "2026-10-08" });
  mocks.context.mockResolvedValue({ actor }); mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.admin.mockResolvedValue(true); mocks.all.mockResolvedValue([]); mocks.memberIds.mockResolvedValue(["site-a"]); mocks.inbox.mockResolvedValue([]); mocks.internal.mockResolvedValue([]);
  mocks.oldGuard.mockResolvedValue(true); mocks.config.mockResolvedValue({ active: true }); mocks.leads.mockResolvedValue({ leads: [] });
});
describe("operator read admission", () => {
  it("uses the trusted current actor and static power with no data/query payload", async () => {
    await authorizeAdminOperatorRead("admin.client-leads.read");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("authorize_platform_operator_read", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_reader_name: "admin.client-leads.read" });
  });
  it("refuses an absent current operator context", async () => {
    mocks.context.mockResolvedValue(null); await expect(authorizeAdminOperatorRead("admin.audit.read")).rejects.toThrow(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("refuses unavailable storage, malformed identity and unknown power before RPC", async () => {
    await expect(authorizePlatformOperatorRead(actor, "admin.audit.read", null)).rejects.toThrow("unavailable");
    await expect(authorizePlatformOperatorRead({ ...actor, userId: "header-label" }, "admin.audit.read")).rejects.toThrow();
    // @ts-expect-error runtime input still rejects unlisted powers
    await expect(authorizePlatformOperatorRead(actor, "arbitrary.reader")).rejects.toThrow(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["audit insert failed", "platform_operator_read_access_denied"])("stops a real private lead route on %s", async message => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message } });
    const { GET } = await import("@/app/api/admin/client-leads/route");
    await expect(GET(new Request("https://app.test/api/admin/client-leads"))).rejects.toThrow(); expect(mocks.leads).not.toHaveBeenCalled();
  });
  it("waits for durable admission before starting the private reader", async () => {
    let done!: () => void; mocks.rpc.mockReturnValue(new Promise(resolve => { done = () => resolve({ data: null, error: null }); }));
    const { GET } = await import("@/app/api/admin/client-leads/route"); const pending = GET(new Request("https://app.test/api/admin/client-leads"));
    await vi.waitFor(() => expect(mocks.rpc).toHaveBeenCalled()); expect(mocks.leads).not.toHaveBeenCalled(); done(); expect((await pending).status).toBe(200);
  });
});
describe("ordinary tenant authority and current support bypass", () => {
  it.each(["owner", "admin", "editor", "viewer"])("preserves ordinary %s membership without requiring a verified email", async role => {
    mocks.session.mockResolvedValue({ id: actor.userId, email_confirmed_at: null }); mocks.membership.mockResolvedValue(role);
    await authorizeTenantOperatorRead("site-a"); expect(mocks.membership).toHaveBeenCalledWith(actor.userId, "site-a"); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("preserves an owner's domain authority and audits a viewer's platform permission bypass", async () => {
    mocks.membership.mockResolvedValue("owner"); await authorizeTenantOperatorRead("site-a", ["domains:manage"]); expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.membership.mockResolvedValue("viewer"); await authorizeTenantOperatorRead("site-a", ["domains:manage"]); expect(mocks.rpc).toHaveBeenCalledWith("authorize_platform_operator_read", expect.objectContaining({ p_reader_name: "admin.clients.read" }));
  });
  it("refuses the permission-bypass read on audit failure before fetching tenant data", async () => {
    mocks.membership.mockResolvedValue("viewer"); mocks.rpc.mockResolvedValue({ data: null, error: { message: "audit failed" } });
    const { GET } = await import("@/app/api/tenant/domains/route"); expect((await GET()).status).toBeGreaterThanOrEqual(400); expect(mocks.config).not.toHaveBeenCalled();
  });
  it("refuses a revoked operator after the old dashboard guard passed, without interpreting absent operator context as membership", async () => {
    mocks.context.mockResolvedValue(null); mocks.rpc.mockResolvedValue({ data: null, error: { message: "platform_operator_read_access_denied" } });
    const read = vi.fn(); await expect((async () => { await requireDashboardView(); read(); })()).rejects.toThrow();
    expect(mocks.oldGuard).toHaveBeenCalled(); expect(mocks.rpc).toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
  });
  it("refuses absent or unverified nonmember session even after a permissive old guard", async () => {
    mocks.session.mockResolvedValue(null); await expect(requireDashboardView()).rejects.toThrow();
    mocks.session.mockResolvedValue({ id: actor.userId, email: actor.verifiedEmail, email_confirmed_at: null }); await expect(requireDashboardView()).rejects.toThrow(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("preserves explicit demo/dev branches without inventing a human", async () => {
    mocks.session.mockResolvedValue(null); await authorizeTenantOperatorRead("demo"); mocks.dev.mockReturnValue(true); await authorizeTenantOperatorRead("site-a"); expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.session).not.toHaveBeenCalled();
  });
  it("preserves an ordinary owner tenant-settings GET while failing support reads before data", async () => {
    const { GET } = await import("@/app/api/tenant-settings/route"); mocks.membership.mockResolvedValue("owner"); expect((await GET()).status).toBe(200); expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.config.mockClear(); mocks.membership.mockResolvedValue(null); mocks.rpc.mockResolvedValue({ data: null, error: { message: "audit failed" } }); expect((await GET()).status).toBe(500); expect(mocks.config).not.toHaveBeenCalled();
  });
});

describe("portfolio and inbox branch boundaries", () => {
  it("does not disclose all properties if the human operator admission fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "audit failed" } });
    const { GET } = await import("@/app/api/my-properties/route"); await expect(GET()).rejects.toThrow(); expect(mocks.all).not.toHaveBeenCalled();
  });
  it("preserves member properties and explicit local dev reads without human admission", async () => {
    const { GET } = await import("@/app/api/my-properties/route"); mocks.admin.mockResolvedValue(false); expect((await GET()).status).toBe(200); expect(mocks.config).toHaveBeenCalledWith("site-a"); expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.dev.mockReturnValue(true); expect((await GET()).status).toBe(200); expect(mocks.all).toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("preserves scoped inbox reads and refuses global internal reads before either reader", async () => {
    const { GET } = await import("@/app/api/operations/inbox/route"); expect((await GET(new Request("https://app.test/api/operations/inbox"))).status).toBe(200); expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.inbox.mockClear(); mocks.rpc.mockResolvedValue({ data: null, error: { message: "audit failed" } }); expect((await GET(new Request("https://app.test/api/operations/inbox?view=internal"))).status).toBe(503); expect(mocks.internal).not.toHaveBeenCalled(); expect(mocks.inbox).not.toHaveBeenCalled();
  });
});
