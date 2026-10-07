import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({ released: vi.fn(async () => false), list: vi.fn(), rpc: vi.fn() }));
vi.mock("@/platform/systems-release", () => ({ systemsReleasedFor: dependencies.released }));
vi.mock("@/platform/systems/from-existing", () => ({ listBusinessSystems: dependencies.list }));
vi.mock("@/platform/systems/supabase-store", () => ({ createSupabaseSystemStore: () => ({}) }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: dependencies.rpc }) }));
import { observeWebsiteSystemRelease, observeWebsiteWorkRelease, reconcileWebsiteSystemReleases } from "@/products/websites/system-releases";

const actor = { userId: "7c000000-0000-4000-8000-000000000001", verifiedEmail: "OWNER@example.test" };
const businessId = "7c000000-0000-4000-8000-000000000010";
const systemId = "7c000000-0000-4000-8000-000000000020";
const workId = "7c000000-0000-4000-8000-000000000030";
const target = { systemId, origin: { kind: "tenant" as const, ref: "7c000000-0000-4000-8000-000000000040" }, tenantId: "gldf" };

beforeEach(() => {
  vi.clearAllMocks();
  dependencies.released.mockResolvedValue(false);
  dependencies.rpc.mockResolvedValue({ data: 2, error: null });
  dependencies.list.mockResolvedValue({ systems: [{ system: { id: systemId, kind: "website", origin: target.origin }, references: { savedWorkId: workId, tenantId: "gldf" } }] });
});

describe("website release reconciliation", () => {
  it("does no work while the business's Systems flag is off", async () => {
    await expect(reconcileWebsiteSystemReleases(actor, businessId, target)).resolves.toBe(0);
    await observeWebsiteWorkRelease(actor, businessId, workId);
    await observeWebsiteSystemRelease(actor, businessId, systemId);
    expect(dependencies.rpc).not.toHaveBeenCalled();
    expect(dependencies.list).not.toHaveBeenCalled();
  });

  it("passes membership identity and stable origin, with manifest content coverage", async () => {
    dependencies.released.mockResolvedValue(true);
    await expect(reconcileWebsiteSystemReleases(actor, businessId, target)).resolves.toBe(2);
    expect(dependencies.rpc).toHaveBeenCalledWith("reconcile_website_system_releases", {
      p_workspace_id: businessId, p_user_id: actor.userId, p_verified_email: "owner@example.test",
      p_system_id: systemId, p_origin_kind: "tenant", p_origin_ref: target.origin.ref, p_content_reading: true,
    });
  });

  it("fails closed on access denial and malformed storage results", async () => {
    dependencies.released.mockResolvedValue(true);
    dependencies.rpc.mockResolvedValueOnce({ error: { message: "business_record_access_denied" }, data: null });
    await expect(reconcileWebsiteSystemReleases(actor, businessId, target)).rejects.toThrow("Workspace access denied");
    dependencies.rpc.mockResolvedValueOnce({ error: null, data: "2" });
    await expect(reconcileWebsiteSystemReleases(actor, businessId, target)).rejects.toThrow("could not be confirmed");
  });

  it("records immediately after accepted work or repo releases without replaying provider writes", async () => {
    dependencies.released.mockResolvedValue(true);
    await observeWebsiteWorkRelease(actor, businessId, workId);
    await observeWebsiteSystemRelease(actor, businessId, systemId);
    expect(dependencies.rpc).toHaveBeenCalledTimes(2);
    expect(dependencies.rpc.mock.calls.every(call => call[0] === "reconcile_website_system_releases")).toBe(true);
  });

  it("keeps a completed release completed when revision storage fails", async () => {
    dependencies.released.mockResolvedValue(true);
    dependencies.rpc.mockRejectedValue(new Error("storage unavailable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(observeWebsiteWorkRelease(actor, businessId, workId)).resolves.toBeUndefined();
    await expect(observeWebsiteSystemRelease(actor, businessId, systemId)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
