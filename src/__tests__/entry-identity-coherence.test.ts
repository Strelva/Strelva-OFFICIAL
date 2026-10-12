import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ invitation: vi.fn(), claim: vi.fn(), brand: vi.fn() }));
vi.mock("@/platform/workspaces/invitations", () => ({ inspectWorkspaceInvitation: mock.invitation }));
vi.mock("@/products/agency-clients/server", () => ({ readOwnerClaim: mock.claim }));
vi.mock("@/platform/agency-brand/server", () => ({ resolveOwnerBrand: mock.brand }));

import { invitationEntryIdentity } from "@/server/agency-brand-entry";
import { STRELVA_BRAND, type OwnerBrand } from "@/platform/infra/agency-brand";

const token = "a".repeat(43);
const workspaceId = "b2640000-0000-4000-8000-000000000010";
const agency: OwnerBrand = {
  agencyId: "b2640000-0000-4000-8000-000000000020", name: "North Studio",
  logoUrl: "https://app.strelva.com/api/agency-brand/logo/fixture/digest",
  accentColor: "#447a4f", replyTo: "team@north.example", credit: "runs_on_strelva",
};
const unavailable: OwnerBrand = { ...STRELVA_BRAND, name: "Agency identity unavailable", accentColor: "#565d64" };

beforeEach(() => {
  vi.resetAllMocks();
  mock.invitation.mockResolvedValue({ workspaceId, workspaceName: "The Mooney Firm" });
  mock.claim.mockResolvedValue({ workspaceName: "The Mooney Firm", agencyName: "North Studio" });
  mock.brand.mockResolvedValue(agency);
});
afterEach(() => vi.restoreAllMocks());

describe("verified identity through invitation and claim entry", () => {
  it("inspects the opaque invitation token before resolving its business's agency brand", async () => {
    const identity = await invitationEntryIdentity(`/workspace/invitations/accept/${token}`);
    expect(identity).toEqual({ businessName: "The Mooney Firm", brand: agency });
    expect(mock.invitation).toHaveBeenCalledExactlyOnceWith(token);
    expect(mock.brand).toHaveBeenCalledExactlyOnceWith(workspaceId);
    expect(mock.invitation.mock.invocationCallOrder[0]).toBeLessThan(mock.brand.mock.invocationCallOrder[0]!);
    expect(mock.claim).not.toHaveBeenCalled();
  });

  it("uses the inspected claim's agency and business name", async () => {
    expect(await invitationEntryIdentity(`/workspace/claim/${token}`))
      .toEqual({ businessName: "The Mooney Firm", brand: "North Studio" });
    expect(mock.claim).toHaveBeenCalledExactlyOnceWith(token);
    expect(mock.invitation).not.toHaveBeenCalled();
    expect(mock.brand).not.toHaveBeenCalled();
  });

  it("keeps a verified claim neutral when its agency name is unavailable", async () => {
    mock.claim.mockResolvedValue({ workspaceName: "The Mooney Firm", agencyName: null });
    expect(await invitationEntryIdentity(`/workspace/claim/${token}`))
      .toEqual({ businessName: "The Mooney Firm", brand: "Agency identity unavailable" });
  });

  it("retains the resolver's neutral brand with the verified invitation business name", async () => {
    mock.brand.mockResolvedValue(unavailable);
    expect(await invitationEntryIdentity(`/workspace/invitations/accept/${token}`))
      .toEqual({ businessName: "The Mooney Firm", brand: unavailable });
  });

  it.each([
    null, "", "/workspace", "/workspace?brand=North%20Studio",
    `/workspace/invitations/accept/${token}?brand=North%20Studio`,
    `/workspace/claim/${token}?agencyName=North%20Studio`,
    `https://app.strelva.com/workspace/invitations/accept/${token}`,
    `https://external.example/workspace/claim/${token}`,
    `//external.example/workspace/claim/${token}`,
    `/workspace/invitations/accept/${token}/extra`,
    `/workspace/invitations/accept/${token}#brand`,
    "/workspace/invitations/accept/short-token",
    `/workspace/claim/${"a".repeat(44)}`,
    `/workspace/claim/${"a".repeat(42)}%`,
  ])("rejects arbitrary or URL-supplied identity without inspection: %s", async target => {
    expect(await invitationEntryIdentity(target)).toBeNull();
    expect(mock.invitation).not.toHaveBeenCalled();
    expect(mock.claim).not.toHaveBeenCalled();
    expect(mock.brand).not.toHaveBeenCalled();
  });

  it("returns null when invitation inspection fails and never resolves a brand", async () => {
    mock.invitation.mockRejectedValue(new Error("Invitation expired"));
    expect(await invitationEntryIdentity(`/workspace/invitations/accept/${token}`)).toBeNull();
    expect(mock.brand).not.toHaveBeenCalled();
  });

  it("returns null when claim inspection fails", async () => {
    mock.claim.mockRejectedValue(new Error("Claim unavailable"));
    expect(await invitationEntryIdentity(`/workspace/claim/${token}`)).toBeNull();
    expect(mock.brand).not.toHaveBeenCalled();
  });

  it("returns null when invitation branding rejects", async () => {
    mock.brand.mockRejectedValue(new Error("Brand unavailable"));
    expect(await invitationEntryIdentity(`/workspace/invitations/accept/${token}`)).toBeNull();
  });
});
