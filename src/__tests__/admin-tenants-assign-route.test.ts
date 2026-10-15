import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/admin/tenants/assign/route";

const mocks = vi.hoisted(() => ({ assign: vi.fn(), find: vi.fn(), actor: vi.fn(), audit: vi.fn(), workspace: vi.fn(), staff: vi.fn() }));
vi.mock("@/platform/infra/auth", () => ({
  CLIENT_ROLES: ["viewer", "editor", "admin", "owner"],
  assignUserToTenant: mocks.assign,
  getActorContext: mocks.actor,
  isSuperAdmin: vi.fn(async () => true),
  findUserIdByEmail: mocks.find,
  LastOwnerError: class LastOwnerError extends Error {},
}));
vi.mock("@/lib/storage", () => ({ logAuditEvent: mocks.audit }));
vi.mock("@/platform/infra/platform-staff-read", () => ({ readPlatformStaffStrict: mocks.staff }));
vi.mock("@/platform/release-flags/store", () => ({ releaseWorkspaceForTenant: mocks.workspace }));

const post = (over: Record<string, unknown> = {}) => POST(new Request("http://localhost/api/admin/tenants/assign", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "person@example.com", tenant: "gldf", role: "editor", reason: "Owner asked", ...over }),
}));

describe("admin tenant assignment with STRELVA_ONE_INVITATION_PATH", () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.find.mockResolvedValue("user_2");
    mocks.actor.mockResolvedValue({ userId: "admin_1", email: "admin@example.com", isSuperAdmin: true, isImpersonating: false });
    mocks.assign.mockResolvedValue(true);
    mocks.audit.mockResolvedValue(undefined);
    mocks.staff.mockResolvedValue(false);
    mocks.workspace.mockResolvedValue(null);
  });
  afterEach(() => { process.env = { ...originalEnv }; });

  it("flag off assigns as before and never reads the business", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, userId: "user_2", tenant: "gldf", role: "editor" });
    expect(mocks.workspace).not.toHaveBeenCalled();
  });

  it("flag on: a converted business refuses direct assignment and grants nothing", async () => {
    process.env.STRELVA_ONE_INVITATION_PATH = "1";
    mocks.workspace.mockResolvedValue("11111111-1111-4111-8111-111111111111");
    const editor = await post();
    expect(editor.status).toBe(409);
    expect((await editor.json()).error).toContain("Strelva operators only invite the owner");
    const owner = await post({ role: "owner" });
    expect(owner.status).toBe(409);
    expect((await owner.json()).error).toBe("Invite the owner instead. Direct assignment is off for businesses.");
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it("flag on: an unconverted tenant keeps the current path and says so", async () => {
    process.env.STRELVA_ONE_INVITATION_PATH = "1";
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, legacy: true });
    expect(mocks.assign).toHaveBeenCalledWith("user_2", "gldf", "editor");
  });
});
