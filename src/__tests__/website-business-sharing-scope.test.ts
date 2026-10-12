import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getWork: vi.fn(), listWorkspaces: vi.fn(), assertWorkspaceMember: vi.fn(), assertWorkspaceWebsiteAccess: vi.fn(), listAgencyClientAdditions: vi.fn() }));
vi.mock("@/platform/workspaces/repository", () => ({ ...mocks, createHandoff: vi.fn() }));
vi.mock("@/products/agency-clients/server", () => ({ listAgencyClientAdditions: mocks.listAgencyClientAdditions }));
import { assertWebsiteReviewScope, authorizeWebsiteShare, readWebsiteSharingContext } from "@/products/websites/site-sharing";
const actor = { userId: "creator", verifiedEmail: "creator@example.test" };
const agency = { id: "agency", kind: "agency", access: "member", role: "owner" };
const customer = { id: "business", kind: "customer", access: "provider_seat" };
const claim = { claimId: "claim", recipientEmail: "owner@example.test", expiresAt: "2099-10-12T12:00:00Z" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getWork.mockResolvedValue({ id: "work", workspaceId: "business", productId: "websites", resourceKind: "website", createdBy: actor.userId });
  mocks.listWorkspaces.mockResolvedValue([agency, customer]);
  mocks.listAgencyClientAdditions.mockResolvedValue([{ customerWorkspaceId: "business", agencyWorkspaceId: "agency", ownerClaimed: false, seatActive: true, pendingClaim: claim }]);
});
describe("business-owned private website review", () => {
  it("reads the client's existing business owner claim without creating a transfer", async () => {
    expect(await readWebsiteSharingContext(actor, "work")).toMatchObject({ kind: "customer", workspaceId: "business", workId: "work", agencyWorkspaceId: "agency", pendingClaim: claim });
    expect(mocks.assertWorkspaceWebsiteAccess).toHaveBeenCalledWith(actor, "business");
  });
  it("binds signed private review to the recorded unexpired pending owner recipient", async () => {
    await expect(assertWebsiteReviewScope(actor, "work", "OWNER@example.test")).resolves.toMatchObject({ id: "work" });
    await expect(assertWebsiteReviewScope(actor, "work", "other@example.test")).rejects.toThrow("current owner claim");
    await expect(authorizeWebsiteShare({ userId: "recipient", verifiedEmail: "owner@example.test" }, { version: 1, workspaceId: "business", workId: "work", revision: 1, contentHash: "a".repeat(64), createdBy: actor.userId, creatorEmail: actor.verifiedEmail, recipientEmail: "owner@example.test", expiresAt: Date.now() + 100000 })).resolves.toMatchObject({ id: "work" });
  });
  it.each(["delegated_read", "member"])("does not use %s client reads as provider share authority", async access => {
    mocks.listWorkspaces.mockResolvedValue([agency, { ...customer, access }]);
    await expect(assertWebsiteReviewScope(actor, "work", claim.recipientEmail)).rejects.toThrow();
  });
  it("does not let staff, another creator, an ended seat or an already-claimed business issue new owner shares", async () => {
    mocks.listWorkspaces.mockResolvedValue([{ ...agency, role: "member" }, customer]);
    await expect(assertWebsiteReviewScope(actor, "work", claim.recipientEmail)).rejects.toThrow("current owner claim");
    mocks.listWorkspaces.mockResolvedValue([agency, customer]);
    mocks.getWork.mockResolvedValue({ id: "work", workspaceId: "business", productId: "websites", createdBy: "other" });
    await expect(assertWebsiteReviewScope(actor, "work", claim.recipientEmail)).rejects.toThrow("current owner claim");
    mocks.getWork.mockResolvedValue({ id: "work", workspaceId: "business", productId: "websites", createdBy: actor.userId });
    mocks.listAgencyClientAdditions.mockResolvedValue([{ customerWorkspaceId: "business", agencyWorkspaceId: "agency", ownerClaimed: false, seatActive: false, pendingClaim: claim }]);
    await expect(assertWebsiteReviewScope(actor, "work", claim.recipientEmail)).rejects.toThrow("one current agency");
    mocks.listAgencyClientAdditions.mockResolvedValue([{ customerWorkspaceId: "business", agencyWorkspaceId: "agency", ownerClaimed: true, seatActive: true, pendingClaim: null }]);
    await expect(assertWebsiteReviewScope(actor, "work", claim.recipientEmail)).rejects.toThrow("current owner claim");
  });
});
