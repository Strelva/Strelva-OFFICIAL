import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { PublicBookingError } from "@/platform/bookings/errors";
const WS = "cf000000-0000-4000-8000-000000000001";
const m = vi.hoisted(() => ({ enabled: true, actor: { userId: "cf000000-0000-4000-8000-000000000002", verifiedEmail: "owner@example.test" } as unknown,
  manage: vi.fn(), context: vi.fn(), inquiry: vi.fn(), prepare: vi.fn(), send: vi.fn(), emailAllowed: true, options: vi.fn(), requireOffers: vi.fn(), limited: false }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/platform/workspaces/http", async (importOriginal) => ({ ...await importOriginal<typeof import("@/platform/workspaces/http")>(), workspaceHttpActor: async () => m.actor }));
vi.mock("@/products/scheduling/server", () => ({ assertWorkspaceCalendarManager: m.manage }));
vi.mock("@/platform/bookings/store", () => ({ readBookingContext: m.context }));
vi.mock("@/lib/leads", () => ({ getLeadById: m.inquiry }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: async () => m.limited }));
vi.mock("@/platform/infra/email/send", () => ({ sendEmailWithReceipt: m.send }));
vi.mock("@/platform/bookings/updates", () => ({ bookingCustomerEmailAllowed: async () => m.emailAllowed }));
vi.mock("@/products/bookings/server", () => ({ readInquiryProposalOptions: m.options }));
vi.mock("@/platform/bookings/inquiry-offers", () => ({ bookingInquiryOffersEnabled: () => m.enabled, requireInquiryBookingOffers: m.requireOffers,
  prepareInquiryBookingOffer: m.prepare, bookingOfferEmailOptions: () => ({ rows: [{ label: "Consultation", value: "Nov 6, 10 AM" }], button: { label: "Choose a time", url: "https://example.test/book-inquiry/fictional" } }) }));
import { GET, POST } from "@/app/api/workspace/bookings/propose-times/route";
const INPUT = { workspaceId: WS, tenantId: "fixture", inquiryId: "inquiry-fixture", serviceId: "consult", starts: ["2026-11-06T15:00:00Z"], expectedCustomerEmail: "dana@example.test" };
function post(patch: Record<string, unknown> = {}, origin = "https://app.strelva.test") { return POST(new Request("https://app.strelva.test/api/workspace/bookings/propose-times", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ ...INPUT, ...patch }) })); }
function get() { return GET(new Request(`https://app.strelva.test/api/workspace/bookings/propose-times?${new URLSearchParams({ workspaceId: WS, tenantId: "fixture", inquiryId: "inquiry-fixture" })}`)); }
beforeEach(() => {
  vi.clearAllMocks(); m.enabled = true; m.emailAllowed = true; m.limited = false; m.actor = { userId: "cf000000-0000-4000-8000-000000000002", verifiedEmail: "owner@example.test" };
  m.manage.mockResolvedValue(undefined); m.context.mockResolvedValue({ workspaceId: WS }); m.inquiry.mockResolvedValue({ name: "Dana Reed", email: "dana@example.test" });
  m.prepare.mockResolvedValue({ id: "offer-fixture", serviceName: "Consultation" }); m.send.mockResolvedValue({ status: "accepted" });
  m.requireOffers.mockResolvedValue(undefined); m.options.mockResolvedValue({ services: [], slots: [], paused: false });
});
describe("owner inquiry suggested-times route", () => {
  it("flags off preserves no discovery, no proposal, no send", async () => {
    m.enabled = false; expect((await get()).status).toBe(503); expect((await post()).status).toBe(503);
    expect(m.options).not.toHaveBeenCalled(); expect(m.prepare).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
  });
  it("requires store-served discovery and passes only authorized inquiry identifiers", async () => {
    expect((await get()).status).toBe(200); expect(m.options).toHaveBeenCalledWith(m.actor, { workspaceId: WS, tenantId: "fixture", inquiryId: "inquiry-fixture" }); expect(m.send).not.toHaveBeenCalled();
    m.requireOffers.mockRejectedValue(new PublicBookingError("unavailable", "Suggestions are not enabled.")); expect((await get()).status).toBe(503);
  });
  it("checks session, origin, owner permission, site scope and the three-time bound before sending", async () => {
    m.actor = null; expect((await get()).status).toBe(401); expect((await post()).status).toBe(401);
    m.actor = { userId: "actor", verifiedEmail: "owner@example.test" }; expect((await post({}, "https://other.test")).status).toBe(403);
    m.manage.mockRejectedValue(new WorkspaceAccessError()); expect((await post()).status).toBe(403);
    m.manage.mockResolvedValue(undefined); m.context.mockResolvedValue({ workspaceId: "other" }); expect((await post()).status).toBe(404);
    m.context.mockResolvedValue({ workspaceId: WS }); expect((await post({ starts: [...INPUT.starts, ...INPUT.starts, ...INPUT.starts, ...INPUT.starts] })).status).toBe(400);
    expect(m.prepare).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
  });
  it("refuses a changed customer address or newly taken time", async () => {
    m.inquiry.mockResolvedValue({ name: "Dana Reed", email: "changed@example.test" }); expect((await post()).status).toBe(409); expect(m.prepare).not.toHaveBeenCalled();
    m.inquiry.mockResolvedValue({ name: "Dana Reed", email: "dana@example.test" }); m.prepare.mockRejectedValue(new PublicBookingError("conflict", "A selected time has been taken."));
    expect((await post()).status).toBe(409); expect(m.send).not.toHaveBeenCalled();
  });
  it("uses the captured customer, leaves routing fields out of the strict offer input and honors email gates", async () => {
    m.emailAllowed = false;
    const response = await post(); expect((await response.json()).delivery).toBe("suppressed"); expect(m.send).not.toHaveBeenCalled();
    expect(m.prepare).toHaveBeenCalledWith({ tenantId: "fixture", inquiryId: "inquiry-fixture", serviceId: "consult", starts: INPUT.starts, source: "owner", customer: { name: "Dana Reed", email: "dana@example.test" } });
  });
  it("reports email provider acceptance separately from delivery and never hides a send failure", async () => {
    expect((await (await post()).json()).delivery).toBe("accepted"); expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ to: "dana@example.test", audience: "customer", tenantId: "fixture", idempotencyKey: "inquiry-offer:offer-fixture" }));
    m.send.mockRejectedValue(new Error("provider unavailable")); expect((await (await post()).json()).delivery).toBe("unavailable");
  });
});
