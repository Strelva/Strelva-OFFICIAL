import styles from "@/experience/bookings/visitor.module.css";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createHash } from "node:crypto";
const m = vi.hoisted(() => ({ rpc: vi.fn(), claims: vi.fn(), tenant: vi.fn(), unsubscribe: vi.fn() }));
vi.mock("@/platform/bookings/native", () => ({ nativeRpc: m.rpc, tokenHash: (value: string) => createHash("sha256").update(value).digest("hex") }));
vi.mock("@/lib/newsletter-unsubscribe", () => ({ verifyUnsubscribeToken: m.claims }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: m.tenant }));
vi.mock("@/lib/storage/newsletter-store", () => ({ unsubscribeSubscriber: m.unsubscribe }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedAsync: async () => false, rateLimitKey: () => "fixture" }));
import { readPublicBookingIdentity } from "@/platform/bookings/public-identity";
import BookingConfirmationPage from "@/app/booking-confirm/[token]/page";
import { GET, POST } from "@/app/api/newsletter/unsubscribe/route";
import BusinessPayment from "@/app/pay/business/BusinessPayment";
import { publicPaymentRequestSchema } from "@/app/pay/business/public-payment";
const token = "x".repeat(43);
const identity = { businessName: "Lakeview Yoga", start: "2026-11-06T12:00:00Z", end: "2026-11-06T13:00:00Z", state: "held", bookingStatus: null };
const payment = publicPaymentRequestSchema.parse({ id: "b2640000-0000-4000-8000-000000000001", workspaceId: "b2640000-0000-4000-8000-000000000002", businessName: "Lakeview Yoga", kind: "deposit", cancellationPolicy: { refundable: true }, lines: [], amountCents: 2500, currency: "usd", expiresAt: "2099-01-01T00:00:00Z", paid: false, status: "unpaid" });
beforeEach(() => { vi.resetAllMocks(); m.rpc.mockResolvedValue(identity); m.claims.mockReturnValue({ tenantId: "lakeview", email: "visitor@example.test" }); m.tenant.mockResolvedValue({ siteName: "Lakeview <Yoga>" }); });
async function confirmation(done = "confirmed") { return renderToStaticMarkup(await BookingConfirmationPage({ params: Promise.resolve({ token }), searchParams: Promise.resolve({ done }) })); }
describe("token-verified public identity", () => {
  it("reads only the bounded confirmation projection and never consumes a request", async () => {
    expect(await readPublicBookingIdentity(token)).toEqual(identity);
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith("read_public_booking_confirmation", { p_hash: createHash("sha256").update(token).digest("hex") });
    m.rpc.mockClear(); expect(await readPublicBookingIdentity("invalid")).toBeNull(); expect(m.rpc).not.toHaveBeenCalled();
  });
  it("does not turn a query string into a confirmed booking", async () => {
    const html = await confirmation(); expect(html).toContain("Lakeview Yoga"); expect(html).toContain("Confirm my email"); expect(html).not.toContain("Confirmed");
    m.rpc.mockResolvedValue({ ...identity, state: "placed", bookingStatus: "requested" });
    expect(await confirmation()).toContain("Waiting on Lakeview Yoga"); expect(await confirmation()).not.toContain("Confirmed");
  });
  it("uses the persisted booking status even if the query claims a different outcome", async () => {
    m.rpc.mockResolvedValue({ ...identity, state: "placed", bookingStatus: "confirmed" }); expect(await confirmation("pending")).toContain("You’re booked");
    m.rpc.mockResolvedValue({ ...identity, state: "placed", bookingStatus: "cancelled" }); expect(await confirmation()).toContain("Your booking is no longer active");
  });
  it("holds the confirmation form when identity is unavailable", async () => {
    m.rpc.mockRejectedValue(new Error("offline")); const html = await confirmation(); expect(html).not.toContain("<form"); expect(html).not.toContain("Lakeview Yoga"); expect(html).toContain("role=\"alert\"");
  });
  it("renders a readable zoned time and the recorded confirmation deadline", async () => {
    m.rpc.mockResolvedValue({ ...identity, timeZone: "America/New_York", expiresAt: "2026-11-06T12:15:00Z" });
    const html = await confirmation();
    expect(html).toContain("7:00 AM</span><span"); expect(html).toContain("Eastern Time"); expect(html).toContain("Confirm by Friday, Nov 6 at 7:15 AM");
    expect(html).not.toContain("2026-11-06T12:00");
    expect(html).not.toContain("America/New_York");
    // The same deadline form as every visitor page: the time above names the zone.
    expect(html).toContain(`<p class="${styles.deadline}">Confirm by Friday, Nov 6 at 7:15 AM.</p>`);
  });
  it("holds a consumed but unplaced outcome for a read rather than offering another placement", async () => {
    m.rpc.mockResolvedValue({ ...identity, state: "confirming" });
    const html = await confirmation(); expect(html).toContain("Outcome not confirmed"); expect(html).toContain("See where my booking stands"); expect(html).not.toContain("<form");
  });
  it("names and escapes the newsletter business on a read-only GET and successful POST", async () => {
    const request = new Request("https://example.test/api/newsletter/unsubscribe?token=fixture");
    expect(await (await GET(request)).text()).toContain("Lakeview &lt;Yoga&gt; newsletter"); expect(m.unsubscribe).not.toHaveBeenCalled();
    expect(await (await POST(request)).text()).toContain("Lakeview &lt;Yoga&gt; newsletter"); expect(m.unsubscribe).toHaveBeenCalledWith("visitor@example.test", "lakeview");
  });
  it("never reads a business or unsubscribes from invalid claims", async () => {
    m.claims.mockReturnValue(null); const request = new Request("https://example.test/api/newsletter/unsubscribe?token=invalid");
    expect((await GET(request)).status).toBe(400); expect((await POST(request)).status).toBe(400); expect(m.tenant).not.toHaveBeenCalled(); expect(m.unsubscribe).not.toHaveBeenCalled();
  });
  it("shows the payee before checkout and holds links without business identity", () => {
    const html = renderToStaticMarkup(<BusinessPayment token="fixture" initialRequest={payment} />);
    expect(html).toContain("Your booking deposit with Lakeview Yoga"); expect(html).toContain("Payment goes to Lakeview Yoga through Stripe"); expect(html).toContain("Accept and pay");
    const unknown = renderToStaticMarkup(<BusinessPayment token="fixture" initialRequest={{ ...payment, businessName: undefined }} />);
    expect(unknown).toContain("which business it"); expect(unknown).not.toContain("Accept and pay");
  });
});
