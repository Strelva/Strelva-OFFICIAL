import { describe, expect, it, vi } from "vitest";
import { providerEligibility } from "@/platform/connections/eligibility";
import type { ProviderAccess } from "@/platform/connections/contracts";

const strelvaAgency = "d1891200-4852-48c1-ae09-7efe308d5759";
const otherAgency = "22222222-2222-4222-8222-222222222222";
const client = "33333333-3333-4333-8333-333333333333";

const agencyHeldGoogle: ProviderAccess = { provider: "google_business_profile", through: { kind: "agency", workspaceId: strelvaAgency }, approval: "approved" };

describe("providerEligibility", () => {
  it("serves every business through platform access", async () => {
    const result = await providerEligibility({ access: { ...agencyHeldGoogle, through: { kind: "platform" } }, businessWorkspaceId: client, actingAgencyWorkspaceId: null, agencyHoldsArea: vi.fn() });
    expect(result).toEqual({ eligible: true, through: { kind: "platform" } });
  });

  it("lets the holding agency use its own project for a client that granted the area", async () => {
    const holds = vi.fn().mockResolvedValue(true);
    const result = await providerEligibility({ access: agencyHeldGoogle, businessWorkspaceId: client, actingAgencyWorkspaceId: strelvaAgency, agencyHoldsArea: holds });
    expect(result.eligible).toBe(true);
    expect(holds).toHaveBeenCalledWith(strelvaAgency, client, "google");
  });

  it("refuses another agency's clients on an agency-held project", async () => {
    const holds = vi.fn().mockResolvedValue(true);
    const result = await providerEligibility({ access: agencyHeldGoogle, businessWorkspaceId: client, actingAgencyWorkspaceId: otherAgency, agencyHoldsArea: holds });
    expect(result).toMatchObject({ eligible: false, reason: "coming_soon" });
    expect(holds).not.toHaveBeenCalled();
  });

  it("refuses a direct business acting for itself on an agency-held project", async () => {
    const result = await providerEligibility({ access: agencyHeldGoogle, businessWorkspaceId: client, actingAgencyWorkspaceId: null, agencyHoldsArea: vi.fn() });
    expect(result).toMatchObject({ eligible: false, reason: "coming_soon" });
  });

  it("refuses the holding agency without the area grant", async () => {
    const result = await providerEligibility({ access: agencyHeldGoogle, businessWorkspaceId: client, actingAgencyWorkspaceId: strelvaAgency, agencyHoldsArea: vi.fn().mockResolvedValue(false) });
    expect(result).toMatchObject({ eligible: false, reason: "area_not_granted" });
  });

  it("fails closed when the grant read throws", async () => {
    const result = await providerEligibility({ access: agencyHeldGoogle, businessWorkspaceId: client, actingAgencyWorkspaceId: strelvaAgency, agencyHoldsArea: vi.fn().mockRejectedValue(new Error("db")) });
    expect(result).toMatchObject({ eligible: false, reason: "area_not_granted" });
  });

  it("lets the holding agency use it for its own workspace", async () => {
    const result = await providerEligibility({ access: agencyHeldGoogle, businessWorkspaceId: strelvaAgency, actingAgencyWorkspaceId: null, agencyHoldsArea: vi.fn() });
    expect(result.eligible).toBe(true);
  });

  it("treats pending, missing and unknown access as unavailable", async () => {
    const base = { businessWorkspaceId: client, actingAgencyWorkspaceId: strelvaAgency, agencyHoldsArea: vi.fn().mockResolvedValue(true) };
    expect(await providerEligibility({ ...base, access: { ...agencyHeldGoogle, approval: "pending" } })).toMatchObject({ reason: "approval_pending" });
    expect(await providerEligibility({ ...base, access: { ...agencyHeldGoogle, approval: "none" } })).toMatchObject({ reason: "not_configured" });
    expect(await providerEligibility({ ...base, access: { ...agencyHeldGoogle, through: { kind: "unknown" } } })).toMatchObject({ reason: "not_configured" });
  });

  it("says not set up when Strelva lacks the provider's keys", async () => {
    const keys = { ready: false as const, missing: ["HIGHLEVEL_CLIENT_ID"] };
    const base = { businessWorkspaceId: client, actingAgencyWorkspaceId: null, agencyHoldsArea: vi.fn(), keys };
    expect(await providerEligibility({ ...base, access: { provider: "highlevel", through: { kind: "platform" }, approval: "not_required" } }))
      .toEqual({ eligible: false, reason: "not_set_up", message: "HighLevel isn't set up on Strelva yet." });
    expect(await providerEligibility({ ...base, access: agencyHeldGoogle })).toMatchObject({ reason: "not_set_up" });
    // Deliberately off still wins over missing keys.
    expect(await providerEligibility({ ...base, access: { ...agencyHeldGoogle, through: { kind: "unknown" } } })).toMatchObject({ reason: "not_configured" });
  });

  it("names who must approve while approval is pending", async () => {
    const result = await providerEligibility({ access: { ...agencyHeldGoogle, approval: "pending" }, businessWorkspaceId: client, actingAgencyWorkspaceId: null, agencyHoldsArea: vi.fn(), keys: { ready: true } });
    expect(result).toEqual({ eligible: false, reason: "approval_pending", message: "Google Business Profile is waiting on Google's approval." });
  });

  it("refuses agency access for a provider that only runs through the platform", async () => {
    const result = await providerEligibility({ access: { provider: "google_calendar", through: { kind: "agency", workspaceId: strelvaAgency }, approval: "approved" }, businessWorkspaceId: client, actingAgencyWorkspaceId: strelvaAgency, agencyHoldsArea: vi.fn().mockResolvedValue(true) });
    expect(result).toMatchObject({ eligible: false, reason: "not_configured" });
  });
});
