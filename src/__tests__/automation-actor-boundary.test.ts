import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ provider: vi.fn(), agencies: vi.fn(), brand: vi.fn() }));
vi.mock("@/platform/service-requests/provider-options", () => ({ readBusinessProviderIdentity: mocks.provider, readServiceRequestProviders: mocks.agencies }));
vi.mock("@/platform/agency-brand/server", () => ({ resolveOwnerBrand: mocks.brand }));
import { captureAutomationActor } from "@/platform/presentation/actor-server";
import { actorLabel } from "@/platform/presentation/actor";
const actor = { userId: "83000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.invalid" };
const businessId = "83000000-0000-4000-8000-000000000002";
const agencyId = "83000000-0000-4000-8000-000000000003";
const otherId = "83000000-0000-4000-8000-000000000004";
beforeEach(() => { vi.resetAllMocks(); mocks.provider.mockResolvedValue(null); mocks.agencies.mockResolvedValue([]); });
describe("platform versus agency automatic action identity", () => {
  it("names Strelva only after successful reads prove the direct door", async () => {
    expect(actorLabel(await captureAutomationActor(actor, businessId))).toBe("Strelva");
    expect(mocks.provider).toHaveBeenCalledWith(actor, businessId);
    expect(mocks.agencies).toHaveBeenCalledWith(actor, businessId);
    expect(mocks.brand).not.toHaveBeenCalled();
  });
  it.each(["North Studio", "Strelva Agency"])("names the recorded agency %s with equal platform credit", async name => {
    mocks.provider.mockResolvedValue({ agencyWorkspaceId: agencyId, name });
    mocks.agencies.mockResolvedValue([{ agencyWorkspaceId: agencyId, name, providerOfRecord: true }]);
    mocks.brand.mockResolvedValue({ agencyId, name });
    expect(actorLabel(await captureAutomationActor(actor, businessId))).toBe(name + " · Runs on Strelva");
    expect(mocks.brand).toHaveBeenCalledWith(agencyId);
  });
  it("does not label a scoped agency client direct just because there is no provider of record", async () => {
    mocks.agencies.mockResolvedValue([{ agencyWorkspaceId: agencyId, name: "North Studio", providerOfRecord: false }]);
    mocks.brand.mockResolvedValue({ agencyId, name: "North Studio" });
    expect(actorLabel(await captureAutomationActor(actor, businessId))).toBe("North Studio · Runs on Strelva");
  });
  it("keeps failures, foreign brands and ambiguous agencies neutral; exact action scope can disambiguate", async () => {
    mocks.agencies.mockRejectedValueOnce(new Error("unavailable"));
    expect(await captureAutomationActor(actor, businessId)).toBeNull();
    mocks.agencies.mockResolvedValue([{ agencyWorkspaceId: agencyId }, { agencyWorkspaceId: otherId }]);
    expect(await captureAutomationActor(actor, businessId)).toBeNull();
    mocks.brand.mockResolvedValue({ agencyId: otherId, name: "Foreign" });
    expect(await captureAutomationActor(actor, businessId, agencyId)).toBeNull();
    mocks.brand.mockResolvedValue({ agencyId, name: "North Studio" });
    expect(actorLabel(await captureAutomationActor(actor, businessId, agencyId))).toBe("North Studio · Runs on Strelva");
    expect(await captureAutomationActor(actor, businessId, businessId)).toBeNull();
  });
});
