import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), tenants: vi.fn(), content: vi.fn() }));
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: mocks.admin }));
vi.mock("@/lib/tenants", () => ({ getAllTenants: mocks.tenants, isActiveTenant: () => true }));
vi.mock("@/lib/storage", () => ({ listDrafts: mocks.content, getDraftContent: mocks.content }));
vi.mock("@/platform/operator-read-audit/admission", () => ({ authorizeAdminOperatorRead: vi.fn() }));
vi.mock("@/lib/maintenance-digest", () => ({ listPendingDigests: mocks.content, decideMaintenanceDigest: mocks.content }));
vi.mock("@/lib/visibility/snapshots", () => ({ getLatestSnapshots: mocks.content, diffSnapshots: mocks.content }));
vi.mock("@/lib/visibility/diagnose", () => ({ diagnoseVisibility: mocks.content, summarizeVisibility: mocks.content }));
import { POST as visibilityPost } from "@/app/api/admin/tenants/[id]/visibility/route";
import { POST as maintenancePost } from "@/app/api/admin/maintenance-digest/route";
import { POST } from "@/app/api/admin/drafts/route";
beforeEach(() => vi.resetAllMocks());
it("rejects unauthenticated content decisions", async () => { mocks.admin.mockResolvedValue(false); expect((await POST()).status).toBe(403); expect(mocks.content).not.toHaveBeenCalled(); });
it("retires super-admin content mutations before any client read or effect", async () => {
  mocks.admin.mockResolvedValue(true); const result = await POST();
  expect(result.status).toBe(410); expect(await result.json()).toMatchObject({ code: "client_content_decision_required" });
  expect(mocks.tenants).not.toHaveBeenCalled(); expect(mocks.content).not.toHaveBeenCalled();
});

it("retires operator maintenance suggestion authoring", async () => {
  mocks.admin.mockResolvedValue(true); expect((await maintenancePost()).status).toBe(410);
  expect(mocks.content).not.toHaveBeenCalled();
});

it("retires operator-authored visibility content", async () => {
  mocks.admin.mockResolvedValue(true); expect((await visibilityPost()).status).toBe(410);
  expect(mocks.content).not.toHaveBeenCalled();
});
