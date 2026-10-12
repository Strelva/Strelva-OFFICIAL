import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ may: vi.fn(), workspace: vi.fn(), tenant: vi.fn(), portfolio: vi.fn(), linked: vi.fn(), resolve: vi.fn() }));
vi.mock("@/products/inquiries", () => ({ inquiryReleaseMayBeOn: mocks.may, inquiryReleaseEnabledForWorkspace: mocks.workspace,
  inquiryReleasedForCurrentUser: mocks.tenant, discoverInquiryPortfolio: mocks.portfolio }));
vi.mock("@/products/inquiries/server", () => ({ resolveInquiryWorkspace: mocks.resolve }));
vi.mock("@/platform/owner-entry/linked-sites", () => ({ readLinkedSites: mocks.linked }));
import { readAgencyLibrary } from "@/experience/workspace/agency-server";
const agency = "d7100000-0000-4000-8000-000000000002";
const actor = { userId: "d7100000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const db = { rpc: vi.fn(async (name: string) => ({ error: null, data: name === "read_version_actor"
  ? { userId: actor.userId, memberships: [{ businessId: agency, role: "owner" }] } : { workspaceId: agency, sources: [] } })) };
beforeEach(() => { vi.clearAllMocks(); mocks.may.mockReturnValue(true); mocks.workspace.mockResolvedValue(true);
  mocks.linked.mockResolvedValue({ sites: [{ tenantId: "source", tenantStableId: agency }], denied: [] });
  mocks.resolve.mockResolvedValue({ businessId: "source-business" });
  mocks.portfolio.mockResolvedValue({ versions: [{ id: "accepted", sourceBusinessId: "source-business" }, { id: "foreign", sourceBusinessId: "other-agency" }], unavailableTenantIds: [] }); });
describe("existing inquiry Versions in the canonical agency Library", () => {
  it("reauthorizes agency source links and uses the existing scoped portfolio, without migrating lineage", async () => {
    expect((await readAgencyLibrary(actor, agency, db)).inquiryVersions).toEqual([{ id: "accepted", sourceBusinessId: "source-business" }]);
    expect(mocks.linked).toHaveBeenCalledWith(actor, agency);
    expect(mocks.portfolio).toHaveBeenCalledWith(undefined, mocks.tenant);
    expect(db.rpc.mock.calls.map(([name]) => name)).toEqual(["read_workspace_version_sources", "read_version_actor"]);
  });
  it("does no inquiry reads when the global or per-agency switch is off", async () => {
    mocks.may.mockReturnValue(false); expect((await readAgencyLibrary(actor, agency, db)).inquiryVersions).toBeUndefined();
    mocks.may.mockReturnValue(true); mocks.workspace.mockResolvedValue(false);
    expect((await readAgencyLibrary(actor, agency, db)).inquiryVersions).toBeUndefined();
    expect(mocks.linked).not.toHaveBeenCalled(); expect(mocks.portfolio).not.toHaveBeenCalled();
  });
  it("reports revoked or unavailable reads honestly without revealing another agency's Versions", async () => {
    mocks.linked.mockRejectedValue(new Error("revoked"));
    expect(await readAgencyLibrary(actor, agency, db)).toMatchObject({ sources: [], inquiryVersionsUnavailable: true });
    expect(mocks.portfolio).not.toHaveBeenCalled();
  });
});
