import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ link: vi.fn(), flag: vi.fn(), tester: vi.fn() }));
vi.mock("@/platform/business-record/service", () => ({ readTenantWorkspaceLink: m.link }));
vi.mock("@/platform/release-flags/store", async importOriginal => ({
  ...await importOriginal<typeof import("@/platform/release-flags/store")>(),
  setWorkspaceReleaseFlag: m.flag, setWorkspaceReleaseTester: m.tester,
}));
import { applyTenantReleaseCommand } from "@/platform/owner-entry/operator";
const actor = { userId: "25600000-0000-4000-8000-000000000003", verifiedEmail: "operator@example.test" };
const workspaceId = "25600000-0000-4000-8000-000000000010";
const facts = { tenantConfig: { template: "professional" as const, features: [] }, connections: [], hasCommerce: false };
const accepted = { workspaceId, flags: { systems: { state: "off", revision: 3, changedAt: "2026-10-12T12:00:00Z" } }, testers: [], testerEmails: [] };
beforeEach(() => {
  vi.resetAllMocks();
  m.link.mockResolvedValue({ link: { workspaceId } });
  m.flag.mockResolvedValue(accepted); m.tester.mockResolvedValue(accepted);
});
describe("release command acceptance", () => {
  it("returns the mutation's own flag state instead of adding a readback", async () => {
    const result = await applyTenantReleaseCommand(actor, "fixture", facts, { kind: "flag", flag: "systems", state: "off", expectedRevision: 2, reason: "Pause for review" });
    expect(result).toBe(accepted);
    expect(m.flag).toHaveBeenCalledWith({ actor, workspaceId, flag: "systems", state: "off", expectedRevision: 2, reason: "Pause for review", auditContext: { source: "web" } });
  });
  it("returns the tester mutation's own accepted state", async () => {
    expect(await applyTenantReleaseCommand(actor, "fixture", facts, { kind: "tester", email: "tester@example.test", present: true, reason: "Bounded review" })).toBe(accepted);
    expect(m.tester).toHaveBeenCalledTimes(1);
  });
  it("never returns acceptance on a rejected mutation", async () => {
    m.flag.mockRejectedValue(new Error("Revision changed"));
    await expect(applyTenantReleaseCommand(actor, "fixture", facts, { kind: "flag", flag: "systems", state: "off", expectedRevision: 2, reason: "Pause for review" })).rejects.toThrow("Revision changed");
  });
});
