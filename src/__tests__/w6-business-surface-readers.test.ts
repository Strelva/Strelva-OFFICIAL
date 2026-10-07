import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readInquirySurface } from "@/products/inquiries/server";
import { InMemoryInquiryRepository } from "@/products/inquiries/repository";
import { bookingLifecyclePorts } from "@/platform/bookings/lifecycle-ports";
import type { TenantConfig } from "@/lib/types";
const mocks = vi.hoisted(() => ({ context: vi.fn(), tenant: vi.fn(), owner: vi.fn() }));
vi.mock("@/platform/business-record/public-reader", () => ({ readReleasedTenantBusinessContext: mocks.context }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => null }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mocks.tenant }));
vi.mock("@/lib/owner-recipient", () => ({ ownerNoticeEmail: mocks.owner }));
vi.mock("@/platform/infra/auth", () => ({ getTenantRole: async () => "owner", roleHasPermission: () => true }));
vi.mock("@/products/inquiries/delivery-surface", () => ({
  projectInquiryDeliveryTimeline: async (input: { state: unknown }) => ({ state: input.state, evidence: {} }),
}));
vi.mock("@/products/inquiries/email-consent", () => ({ projectInquiryEmailConnection: async () => ({ id: "email", status: "disconnected" }) }));
const config: TenantConfig = { id: "fixture", subdomain: "fixture", siteName: "Old website name", ownerName: "Owner", industry: "wellness", createdAt: "2026-10-07", template: "wellness" };
beforeEach(() => { vi.clearAllMocks(); mocks.tenant.mockResolvedValue(config); mocks.owner.mockResolvedValue("record-owner@example.test"); });
afterEach(() => vi.restoreAllMocks());
describe("one record across client surfaces", () => {
  it("shows current confirmed business facts in inquiries and identifies their source", async () => {
    mocks.context.mockResolvedValue({ facts: { display_name: "Current business", description: "Current description" }, services: [] });
    const { snapshot } = await readInquirySurface({ tenantId: "fixture", businessId: "fixture", config, actorId: "owner", repository: new InMemoryInquiryRepository() });
    expect(snapshot.business).toMatchObject({ name: "Current business", description: "Current description" });
    expect(snapshot.onboarding.statements.find(statement => statement.id === "business")).toMatchObject({ value: "Current business", provenance: "Business record" });
  });
  it("retains issued tenant presentation when the gated business projection is unavailable", async () => {
    mocks.context.mockResolvedValue(null);
    const { snapshot } = await readInquirySurface({ tenantId: "fixture", businessId: "fixture", config, actorId: "owner", repository: new InMemoryInquiryRepository() });
    expect(snapshot.business.name).toBe("Old website name");
    expect(snapshot.onboarding.statements.find(statement => statement.id === "business")?.provenance).toBe("Tenant settings");
  });
  it("booking notices use the same business name and one owner recipient", async () => {
    mocks.context.mockResolvedValue({ facts: { legal_name: "Current legal name" }, services: [] });
    const input = { tenantId: "fixture" } as Parameters<typeof bookingLifecyclePorts.business>[0];
    expect(await bookingLifecyclePorts.business(input)).toMatchObject({ name: "Current legal name", ownerEmail: "record-owner@example.test" });
    mocks.context.mockResolvedValue(null);
    expect(await bookingLifecyclePorts.business(input)).toMatchObject({ name: "Old website name" });
  });
});
