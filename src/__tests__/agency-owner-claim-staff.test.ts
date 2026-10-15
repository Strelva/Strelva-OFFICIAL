import { describe, expect, it, vi } from "vitest";
import { AgencyClientError, issueAgencyClientOwnerClaim, type AgencyClientDeps } from "@/products/agency-clients/service";

const AGENCY = "00000000-0000-4000-8000-000000000002";
const CLIENT = "00000000-0000-4000-8000-000000000004";
const actor = { userId: "00000000-0000-4000-8000-000000000001", verifiedEmail: "member@agency.example" };

function deps(error: { message: string }): AgencyClientDeps {
  return {
    rpc: vi.fn(async () => ({ data: null, error })),
    seed: vi.fn(), assess: vi.fn(), token: () => "t".repeat(43), now: () => new Date("2026-10-20T12:00:00Z"),
  } as unknown as AgencyClientDeps;
}

describe("owner claim to a staff address", () => {
  it("is refused with a plain 400 that names no address", async () => {
    const error = await issueAgencyClientOwnerClaim(actor, { action: "owner_link", agencyWorkspaceId: AGENCY, customerWorkspaceId: CLIENT, ownerEmail: "me@agency.example" },
      deps({ message: "agency_client_claim_recipient_staff" })).catch(caught => caught);
    expect(error).toBeInstanceOf(AgencyClientError);
    expect(error).toMatchObject({ status: 400, code: "agency_client_claim_recipient_staff", message: "Use the owner's own email address. This one belongs to platform or agency staff." });
  });

  it("is not mistaken for the generic invalid-address refusal", async () => {
    const error = await issueAgencyClientOwnerClaim(actor, { action: "owner_link", agencyWorkspaceId: AGENCY, customerWorkspaceId: CLIENT, ownerEmail: "not-an-email" },
      deps({ message: "agency_client_claim_invalid" })).catch(caught => caught);
    expect(error).toMatchObject({ status: 400, code: "agency_client_claim_invalid", message: "Check the owner's email address." });
  });
});
