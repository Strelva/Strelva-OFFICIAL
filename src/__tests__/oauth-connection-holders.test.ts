import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ enabled: vi.fn(), db: vi.fn(), actor: vi.fn(), member: vi.fn(), eligibility: vi.fn(), record: vi.fn(), from: vi.fn(), tenant: vi.fn(), link: vi.fn() }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.enabled }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: mocks.db }));
vi.mock("@/platform/infra/auth", () => ({ getActorContext: mocks.actor }));
vi.mock("@/platform/workspaces/repository", () => ({ assertWorkspaceMember: mocks.member }));
vi.mock("@/platform/connections/server", () => ({ connectionEligibilityFor: mocks.eligibility }));
vi.mock("@/platform/connections/holders", () => ({ recordConnectionHolder: mocks.record }));
import { beginOAuthHolder, completeOAuthHolder } from "@/app/api/oauth/calendly/connection-holder";
const workspaceId = "c2000000-0000-4000-8000-000000000001";
const stableId = "c2000000-0000-4000-8000-000000000002";
const userId = "c2000000-0000-4000-8000-000000000003";
beforeEach(() => {
  vi.resetAllMocks(); mocks.enabled.mockReturnValue(true); mocks.db.mockReturnValue({ from: mocks.from });
  mocks.from.mockImplementation(table => ({ select: () => ({ eq: () => ({ maybeSingle: table === "tenants" ? mocks.tenant : mocks.link }) }) }));
  mocks.tenant.mockResolvedValue({ data: { stable_id: stableId }, error: null }); mocks.link.mockResolvedValue({ data: { workspace_id: workspaceId }, error: null });
  mocks.actor.mockResolvedValue({ userId, email: " Owner@Example.test ", type: "user", isImpersonating: false });
  mocks.member.mockResolvedValue(undefined); mocks.eligibility.mockResolvedValue({ eligible: true, through: { kind: "platform" } });
});
describe("OAuth account holder recording", () => {
  it("leaves disabled workspace release completely on the existing tenant path", async () => {
    mocks.enabled.mockReturnValue(false);
    expect(await beginOAuthHolder("calendly", "tenant")).toBeNull();
    await completeOAuthHolder(null);
    expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.record).not.toHaveBeenCalled();
  });
  it("leaves an unlinked tenant unknown instead of guessing its workspace", async () => {
    mocks.link.mockResolvedValue({ data: null, error: null });
    expect(await beginOAuthHolder("instagram", "tenant")).toBeNull();
    expect(mocks.actor).not.toHaveBeenCalled(); expect(mocks.record).not.toHaveBeenCalled();
  });
  it.each(["calendly", "instagram"] as const)("pins a verified member and records %s after current linkage and eligibility checks", async provider => {
    const operation = await beginOAuthHolder(provider, "tenant");
    expect(mocks.member).toHaveBeenCalledWith({ userId, verifiedEmail: "owner@example.test" }, workspaceId);
    expect(mocks.record).not.toHaveBeenCalled();
    await completeOAuthHolder(operation);
    expect(mocks.record).toHaveBeenCalledExactlyOnceWith({ ref: `${provider}:${stableId}`, provider, workspaceId, accountHolder: { kind: "business", workspaceId }, accessThrough: { kind: "platform" }, actor: { userId, verifiedEmail: "owner@example.test" }, commandId: operation!.commandId });
    expect(mocks.eligibility).toHaveBeenCalledTimes(2);
  });
  it.each(["system", "super_admin", "anonymous"])("refuses %s as evidence of business ownership", async type => {
    mocks.actor.mockResolvedValue({ userId, email: "owner@example.test", type });
    await expect(beginOAuthHolder("calendly", "tenant")).rejects.toThrow(); expect(mocks.record).not.toHaveBeenCalled();
  });
  it("refuses a missing direct workspace membership", async () => {
    mocks.member.mockRejectedValue(new Error("No membership"));
    await expect(beginOAuthHolder("calendly", "tenant")).rejects.toThrow(); expect(mocks.eligibility).not.toHaveBeenCalled();
  });
  it("fails closed when access becomes unavailable during exchange", async () => {
    const operation = await beginOAuthHolder("calendly", "tenant");
    mocks.eligibility.mockResolvedValue({ eligible: false, reason: "coming_soon", message: "Coming soon" });
    await expect(completeOAuthHolder(operation)).rejects.toThrow("Coming soon"); expect(mocks.record).not.toHaveBeenCalled();
  });
  it("refuses changed stable tenant-to-workspace linkage after exchange", async () => {
    const operation = await beginOAuthHolder("instagram", "tenant");
    mocks.link.mockResolvedValue({ data: { workspace_id: "c2000000-0000-4000-8000-000000000004" }, error: null });
    await expect(completeOAuthHolder(operation)).rejects.toThrow("changed"); expect(mocks.record).not.toHaveBeenCalled();
  });
  it("does not treat a failed linkage read as an unlinked legacy account", async () => {
    mocks.link.mockResolvedValue({ data: null, error: { code: "unavailable" } });
    await expect(beginOAuthHolder("calendly", "tenant")).rejects.toThrow();
  });
  it("propagates holder storage failure so the callback cannot claim success", async () => {
    const operation = await beginOAuthHolder("instagram", "tenant"); mocks.record.mockRejectedValue(new Error("Unavailable"));
    await expect(completeOAuthHolder(operation)).rejects.toThrow("Unavailable");
  });
});
