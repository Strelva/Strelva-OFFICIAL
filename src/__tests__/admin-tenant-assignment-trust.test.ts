import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), actor: vi.fn(), lookup: vi.fn(), assign: vi.fn(), audit: vi.fn(), staff: vi.fn(), db: vi.fn() }));
vi.mock("@/platform/infra/auth", () => ({
  CLIENT_ROLES: ["viewer", "editor", "admin", "owner"],
  isSuperAdmin: mocks.admin,
  getActorContext: mocks.actor,
  findUserIdByEmail: mocks.lookup,
  assignUserToTenant: mocks.assign,
  LastOwnerError: class LastOwnerError extends Error {},
}));
vi.mock("@/lib/storage", () => ({ logAuditEvent: mocks.audit }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: mocks.db }));
import { POST } from "@/app/api/admin/tenants/assign/route";

async function request(overrides: Record<string, unknown> = {}) {
  return POST(new Request("http://localhost/api/admin/tenants/assign", { method: "POST", body: JSON.stringify({ email: " Owner@Example.test ", tenant: "example", reason: "Verified business owner requested access", ...overrides }) }));
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue(true);
  mocks.actor.mockResolvedValue({ userId: "operator", email: "staff@example.test", type: "super_admin", isSuperAdmin: true, isImpersonating: false });
  mocks.lookup.mockResolvedValue("customer");
  mocks.assign.mockResolvedValue(true);
  mocks.staff.mockResolvedValue({ data: null, error: null });
  const query = { select: () => query, eq: () => query, is: () => query, maybeSingle: mocks.staff };
  mocks.db.mockReturnValue({ from: () => query });
});
describe("platform assignment boundary", () => {
  it("requires an explicit bounded reason before granting access", async () => {
    for (const reason of [undefined, " ", "x".repeat(1001)]) expect((await request({ reason })).status).toBe(400);
    expect(mocks.assign).not.toHaveBeenCalled();
  });
  it("rejects invalid roles instead of silently making an owner", async () => {
    expect((await request({ role: "super_admin" })).status).toBe(400);
    expect(mocks.assign).not.toHaveBeenCalled();
  });
  it("requires a platform operator", async () => {
    mocks.admin.mockResolvedValue(false);
    expect((await request()).status).toBe(403);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it.each(["owner", "admin", "editor", "viewer"])("refuses self-assignment as %s", async role => {
    mocks.lookup.mockResolvedValue("operator");
    expect((await request({ role })).status).toBe(403);
    expect(mocks.assign).not.toHaveBeenCalled();
  });
  it.each(["owner", "admin", "editor"])("refuses another staff member as %s", async role => {
    mocks.staff.mockResolvedValue({ data: { user_id: "customer" }, error: null });
    expect((await request({ role })).status).toBe(403);
    expect(mocks.assign).not.toHaveBeenCalled();
  });
  it("allows only read-only support membership for another staff member", async () => {
    mocks.staff.mockResolvedValue({ data: { user_id: "customer" }, error: null });
    expect((await request({ role: "viewer" })).status).toBe(200);
    expect(mocks.assign).toHaveBeenCalledWith("customer", "example", "viewer");
  });
  it("holds assignments when staff identity is unreadable", async () => {
    mocks.staff.mockResolvedValue({ data: null, error: new Error("secret database message") });
    const response = await request();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
    expect(mocks.assign).not.toHaveBeenCalled();
    mocks.db.mockReturnValue(null);
    expect((await request()).status).toBe(503);
  });
  it("holds assignments when the operator context is missing or inspecting", async () => {
    for (const actor of [{ userId: null, isSuperAdmin: false }, { userId: "operator", isSuperAdmin: true, isImpersonating: true }]) {
      mocks.actor.mockResolvedValue(actor);
      expect((await request()).status).toBe(403);
    }
    expect(mocks.assign).not.toHaveBeenCalled();
  });
  it("records the reason before granting ordinary customer ownership and after success", async () => {
    expect((await request()).status).toBe(200);
    expect(mocks.assign).toHaveBeenCalledWith("customer", "example", "owner");
    expect(mocks.audit).toHaveBeenNthCalledWith(1, expect.objectContaining({ action: "tenant.assign_user_requested", metadata: { email: "owner@example.test", role: "owner", reason: "Verified business owner requested access" } }));
    expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(mocks.assign.mock.invocationCallOrder[0]!);
    expect(mocks.audit).toHaveBeenNthCalledWith(2, expect.objectContaining({ action: "tenant.assign_user" }));
  });
  it("does not mutate when the audit write fails and hides storage details", async () => {
    mocks.audit.mockRejectedValue(new Error("private storage detail"));
    const response = await request();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private");
    expect(mocks.assign).not.toHaveBeenCalled();
  });
});
