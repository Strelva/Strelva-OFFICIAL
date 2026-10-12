import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: async () => state.allowed }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error("not_found"); } }));
vi.mock("@/lib/deprovision", () => ({ isValidDeprovisionTenantId: (id: string) => /^[a-z0-9-]+$/.test(id) }));
import TenantCleanupPage from "@/app/admin/tenant-cleanup/[id]/page";
beforeEach(() => { state.allowed = true; });
describe("deleted tenant recovery authority", () => {
  it("requires current super-admin before mounting the reader", async () => {
    state.allowed = false;
    await expect(TenantCleanupPage({ params: Promise.resolve({ id: "fictional-cleanup" }) })).rejects.toThrow("redirect:/sign-in");
  });
  it("rejects an invalid slug before offering recovery", async () => {
    await expect(TenantCleanupPage({ params: Promise.resolve({ id: "../other" }) })).rejects.toThrow("not_found");
  });
  it("mounts receipt recovery for the deleted identity without a tenant config requirement", async () => {
    const page = await TenantCleanupPage({ params: Promise.resolve({ id: "fictional-cleanup" }) });
    expect(page.props.tenantId).toBe("fictional-cleanup");
    expect(page.key).toBe("fictional-cleanup");
  });
});
