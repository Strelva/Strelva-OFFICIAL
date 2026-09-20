import { describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  actor: vi.fn(async () => ({ userId: "owner-1", verifiedEmail: "owner@example.test" })),
  list: vi.fn(async () => []),
  publish: vi.fn(async (_actor: unknown, input: unknown) => ({ id: "grant-1", ...(input && typeof input === "object" ? input : {}) })),
  revoke: vi.fn(async () => ({ id: "grant-1", status: "revoked" })),
}));

vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/platform/workspaces/http", () => ({
  workspaceHttpActor: boundary.actor,
  workspaceHttpFailure: (error: unknown) => new Response(JSON.stringify({ error: String(error) }), { status: 503 }),
  workspaceJson: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }),
  workspaceWriteGuard: () => null,
  readWorkspaceBody: async (request: Request) => request.json(),
}));
vi.mock("@/products/scheduling/server", () => ({
  listPublicWebsiteBookingGrants: boundary.list,
  publishPublicWebsiteBookingGrant: boundary.publish,
  revokePublicWebsiteBookingGrant: boundary.revoke,
}));

import { DELETE, GET, POST } from "@/app/api/workspace/public-bookings/route";

const businessId = "11111111-1111-4111-8111-111111111111";
const workId = "22222222-2222-4222-8222-222222222222";

describe("public booking grant workspace action", () => {
  it("publishes an explicit tenant/work/capability binding through the owner action", async () => {
    const response = await POST(new Request("https://app.example/api/workspace/public-bookings", {
      method: "POST",
      headers: { origin: "https://app.example", "content-type": "application/json" },
      body: JSON.stringify({ action: "publish", businessId, tenantId: "northstar", workId, capabilityId: "consultations", capabilityVersion: 2, inquiryCapabilityId: "inquiries", inquiryVersion: 4, provider: "outlook", displayName: "Consultation", timeZone: "America/New_York" }),
    }));
    expect(response.status).toBe(201);
    expect(boundary.publish).toHaveBeenCalledWith({ userId: "owner-1", verifiedEmail: "owner@example.test" }, expect.objectContaining({ businessId, tenantId: "northstar", workId, provider: "outlook" }));
  });

  it("lists and revokes grants through the same workspace owner boundary", async () => {
    const get = await GET(new Request(`https://app.example/api/workspace/public-bookings?businessId=${businessId}`));
    expect(get.status).toBe(200);
    expect(boundary.list).toHaveBeenCalledWith({ userId: "owner-1", verifiedEmail: "owner@example.test" }, businessId);
    const revoke = await DELETE(new Request("https://app.example/api/workspace/public-bookings", {
      method: "DELETE",
      headers: { origin: "https://app.example", "content-type": "application/json" },
      body: JSON.stringify({ action: "revoke", businessId, grantId: "33333333-3333-4333-8333-333333333333", reason: "Website replaced." }),
    }));
    expect(revoke.status).toBe(200);
    expect(boundary.revoke).toHaveBeenCalledWith({ userId: "owner-1", verifiedEmail: "owner@example.test" }, expect.objectContaining({ businessId, reason: "Website replaced." }));
  });
});
