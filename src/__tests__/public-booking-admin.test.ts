import { describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({ data: [{ id: "grant-1", status: "published" }], error: null })),
}));

vi.mock("@/lib/db/client", () => ({ getSupabase: () => ({ rpc: boundary.rpc }) }));

import { publishPublicWebsiteBookingGrant } from "@/products/scheduling/public-booking-admin";

describe("public booking grant admin boundary", () => {
  it("unwraps the singleton row returned by the set-returning publish RPC", async () => {
    const result = await publishPublicWebsiteBookingGrant(
      { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "owner@example.test" },
      {
        businessId: "22222222-2222-4222-8222-222222222222",
        tenantId: "northstar",
        workId: "33333333-3333-4333-8333-333333333333",
        capabilityId: "consultations",
        capabilityVersion: 2,
        inquiryCapabilityId: "inquiries",
        inquiryVersion: 4,
        provider: "outlook",
        displayName: "Consultation",
        timeZone: "America/New_York",
      },
    );

    expect(result).toEqual({ id: "grant-1", status: "published" });
    expect(boundary.rpc).toHaveBeenCalledWith("publish_public_website_booking_grant", expect.objectContaining({
      p_business_id: "22222222-2222-4222-8222-222222222222",
      p_tenant_id: "northstar",
      p_provider: "outlook",
    }));
  });
});
