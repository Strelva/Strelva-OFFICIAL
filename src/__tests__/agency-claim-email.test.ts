import { afterEach, describe, expect, it, vi } from "vitest";
import { agencyClaimEmailReleased, claimEmailOptions, emailOwnerClaim } from "@/products/agency-clients/claim-email";
import type { OwnerClaim } from "@/products/agency-clients/contracts";
const actor = { userId: "00000000-0000-4000-8000-000000000001", verifiedEmail: "member@agency.example" };
const agency = "00000000-0000-4000-8000-000000000002";
const claim: OwnerClaim = { claimId: "00000000-0000-4000-8000-000000000003", customerWorkspaceId: "00000000-0000-4000-8000-000000000004",
  workspaceName: "Bakery", recipientEmail: "owner@bakery.example", claimPath: `/workspace/claim/${"t".repeat(43)}`,
  delivery: { status: "not_sent", reason: "gated", decision: "R08", agencyEmailVerified: true },
  expiresAt: "2099-01-01T00:00:00Z", createdAt: "2026-10-14T12:00:00Z", replacedPending: false };
function ports() { return { rpc: vi.fn().mockResolvedValue({ data: true, error: null }), released: () => true, agencyName: "North Studio" as string | null,
  send: vi.fn().mockResolvedValue({ status: "accepted", providerMessageId: "receipt", acceptedAt: "2026-10-14T12:00:00Z" }) }; }
afterEach(() => vi.unstubAllEnvs());
describe("explicit agency owner-link email", () => {
  it("defaults off and obeys workspace kill switch", () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_AGENCY_OWNER_CLAIM_EMAIL_RELEASE", ""); expect(agencyClaimEmailReleased()).toBe(false);
    vi.stubEnv("STRELVA_AGENCY_OWNER_CLAIM_EMAIL_RELEASE", "1"); expect(agencyClaimEmailReleased()).toBe(true);
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0"); expect(agencyClaimEmailReleased()).toBe(false);
  });
  it("does nothing while off", async () => {
    const d = ports(); d.released = () => false;
    expect(await emailOwnerClaim(actor, agency, claim, d)).toEqual(claim.delivery);
    expect(d.rpc).not.toHaveBeenCalled(); expect(d.send).not.toHaveBeenCalled();
  });
  it.each([{ data: false, error: null }, { data: null, error: { message: "private database failure" } }])("fails closed on scope, legacy exclusion, current permission or storage refusal", async result => {
    const d = ports(); d.rpc.mockResolvedValue(result);
    expect(await emailOwnerClaim(actor, agency, claim, d)).toMatchObject({ status: "not_sent" });
    expect(d.send).not.toHaveBeenCalled();
  });
  it("sends only a reserved exact claim through scoped client mail and records acceptance", async () => {
    const d = ports(); await expect(emailOwnerClaim(actor, agency, claim, d)).resolves.toMatchObject({ status: "accepted" });
    expect(d.rpc.mock.calls[0]).toEqual(["prepare_agency_owner_claim_email", expect.objectContaining({ p_user_id: actor.userId, p_claim_id: claim.claimId, p_agency_workspace_id: agency, p_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/) })]);
    expect(d.send).toHaveBeenCalledWith(expect.objectContaining({ audience: "client", authorship: "platform", workspaceId: claim.customerWorkspaceId, to: claim.recipientEmail, idempotencyKey: `agency-owner-claim:${claim.claimId}`, options: expect.objectContaining({ button: expect.objectContaining({ url: `https://app.strelva.com${claim.claimPath}` }) }) }));
    expect(d.rpc.mock.calls[1]).toEqual(["record_agency_owner_claim_email", expect.objectContaining({ p_delivery: expect.objectContaining({ status: "accepted", providerMessageId: "receipt" }) })]);
    expect(JSON.stringify(d.rpc.mock.calls)).not.toContain("t".repeat(43));
  });
  it("preserves shared email suppression, including a tenant-off or unknown policy", async () => {
    const d = ports(); d.send.mockResolvedValue({ status: "suppressed", reason: "email_policy_changed" });
    expect(await emailOwnerClaim(actor, agency, claim, d)).toMatchObject({ status: "not_sent", reason: "email_suppressed" });
  });
  it("records uncertain sends without retrying", async () => {
    const d = ports(); d.send.mockRejectedValue(new Error("timeout with private recipient"));
    expect(await emailOwnerClaim(actor, agency, claim, d)).toMatchObject({ status: "unknown", reason: "delivery_unconfirmed" });
    expect(d.send).toHaveBeenCalledTimes(1);
  });
  it("keeps provider acceptance after receipt-write loss", async () => {
    const d = ports(); d.rpc.mockResolvedValueOnce({ data: true, error: null }).mockRejectedValueOnce(new Error("lost receipt write"));
    expect(await emailOwnerClaim(actor, agency, claim, d)).toMatchObject({ status: "accepted" }); expect(d.send).toHaveBeenCalledTimes(1);
  });
  it("holds the send when the agency's name can't be read, so no email says \"Your agency\"", async () => {
    const d = { ...ports(), agencyName: null };
    expect(await emailOwnerClaim(actor, agency, claim, d)).toMatchObject({ status: "not_sent", reason: "agency_identity_unavailable" });
    expect(d.rpc).not.toHaveBeenCalled(); expect(d.send).not.toHaveBeenCalled();
  });
  it("names the agency that set the business up, and says the link alone grants nothing", async () => {
    const named = claimEmailOptions(claim, "https://app.strelva.com/workspace/claim/x", "North Studio");
    expect(named.heading).toBe("Bakery is ready for its owner.");
    expect(named.paragraphs[0]).toContain("North Studio set up Bakery on Strelva for you.");
    expect(named.button.label).toBe("Claim Bakery");
    expect(named.footerNote).toContain("The link alone grants nothing");
    expect(() => claimEmailOptions(claim, "https://app.strelva.com/workspace/claim/x", " ")).toThrow();
    expect(named.paper.blocks.at(-1)).toEqual({ kind: "actions", actions: [{ label: "Claim Bakery", url: "https://app.strelva.com/workspace/claim/x", style: "ink" }] });
    expect(JSON.stringify(named)).not.toMatch(/\u2014|—|Your agency|confirm your details/);
    const d = { ...ports(), agencyName: "North Studio" };
    await emailOwnerClaim(actor, agency, claim, d);
    expect(d.send).toHaveBeenCalledWith(expect.objectContaining({ subject: "Claim Bakery on Strelva", options: expect.objectContaining({ heading: "Bakery is ready for its owner." }) }));
  });
});
