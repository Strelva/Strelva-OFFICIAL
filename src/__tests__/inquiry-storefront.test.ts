import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InquiryCapabilityState } from "@/products/inquiries/contracts";
import { projectPublishedInquiry } from "@/products/inquiries/storefront";

const mocks = vi.hoisted(() => ({ release: vi.fn(), tenant: vi.fn(), snapshot: vi.fn() }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mocks.tenant }));
vi.mock("@/products/inquiries/server", async () => ({
  inquiryReleaseEnabled: mocks.release,
  getInquiryRepository: () => ({ getSnapshot: mocks.snapshot }),
  projectPublishedInquiry: (await import("@/products/inquiries/storefront")).projectPublishedInquiry,
}));
import { GET } from "@/app/api/v1/inquiries/[tenant]/route";

const time = "2026-09-11T12:00:00Z";
const capability: InquiryCapabilityState = {
  id: "cap-example", businessId: "stable-business", status: "live", previousLive: null, activeRequestId: null, updatedAt: time,
  live: {
    id: "cap-example", businessId: "stable-business", kind: "inquiry", version: 3, name: "Seller inquiries", createdAt: time, updatedAt: time,
    form: { id: "form-example", component: "form", title: "Tell us about your home", intro: "We will help with the next step.", disclosure: "Strelva", fields: [{ id: "name", label: "Name", kind: "text", component: "text_field", required: true }] },
    record: { component: "record_list", type: "inquiry", singularLabel: "Seller inquiry", pluralLabel: "Seller inquiries", fields: [] },
    routing: { id: "route-example", component: "routing_rule", destination: "private-inbox@example.invalid", channel: "email", sentence: "Send to the private inbox", withinMinutes: 5 },
    followUp: null, connections: [],
  },
};

const request = () => GET(new Request("https://app.example/api/v1/inquiries/example?capabilityId=cap-example"), { params: Promise.resolve({ tenant: "example" }) });

describe("public inquiry form read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.release.mockReturnValue(true);
    mocks.tenant.mockResolvedValue({ active: true, stableId: "stable-business" });
    mocks.snapshot.mockResolvedValue({ state: { capabilities: [capability] } });
  });

  it("publishes only the form and its exact version, never private routing", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ schemaVersion: 1, capabilityId: "cap-example", version: 3 });
    expect(JSON.stringify(body)).not.toContain("private-inbox");
    expect(JSON.stringify(body)).not.toContain("routing");
    expect(mocks.snapshot).toHaveBeenCalledWith("example", "stable-business");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("does not expose a draft, paused form, or foreign definition", () => {
    expect(projectPublishedInquiry({ ...capability, status: "draft" })).toBeNull();
    expect(projectPublishedInquiry({ ...capability, status: "paused" })).toBeNull();
    expect(projectPublishedInquiry({ ...capability, businessId: "other" })).toBeNull();
  });

  it("allows readback of an accepted version still awaiting verification", () => {
    expect(projectPublishedInquiry({ ...capability, status: "live_unverified" })?.version).toBe(3);
  });

  it("distinguishes missing forms from unavailable persistence", async () => {
    mocks.snapshot.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("offline"));
    expect((await request()).status).toBe(404);
    expect((await request()).status).toBe(503);
  });

  it("keeps the public endpoint closed without explicit release or active tenant", async () => {
    mocks.release.mockReturnValueOnce(false);
    expect((await request()).status).toBe(503);
    expect(mocks.tenant).not.toHaveBeenCalled();
    mocks.tenant.mockResolvedValue({ active: false });
    expect((await request()).status).toBe(404);
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
});
