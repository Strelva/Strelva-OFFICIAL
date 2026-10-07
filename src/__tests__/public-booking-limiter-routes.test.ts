import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicBookingError } from "@/platform/bookings/errors";
const mocks = vi.hoisted(() => ({ limit: vi.fn(), read: vi.fn(), reserve: vi.fn(), confirm: vi.fn() }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedAsync: mocks.limit, rateLimitKey: (_r: Request, prefix: string) => prefix + ":fixture-ip" }));
vi.mock("@/products/scheduling/server", () => ({ PublicBookingError, publicBookingRangeSchema: { safeParse: (data: unknown) => ({ success: true, data }) }, publicBookingVisitorSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  createPublicWebsiteBookingService: () => ({ read: mocks.read, reserve: mocks.reserve, confirm: mocks.confirm }) }));
import { GET as read } from "@/app/api/v1/bookings/[tenant]/route";
import { POST as reserve } from "@/app/api/v1/bookings/[tenant]/reservations/route";
import { POST as confirm } from "@/app/booking-confirm/[token]/action/route";
import confirmationPage from "@/app/booking-confirm/[token]/page";
import { renderToStaticMarkup } from "react-dom/server";
const params = { params: Promise.resolve({ tenant: "fixture" }) };
const request = () => new Request("https://app.example.test/api/v1/bookings/fixture/reservations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ capabilityId: "consult", capabilityVersion: 1, slotId: "slot-abcdefgh", visitor: { name: "Dana", email: "dana@example.test" } }) });
beforeEach(() => { vi.clearAllMocks(); mocks.limit.mockResolvedValue(false); mocks.read.mockResolvedValue({ slots: [] }); });
describe("public booking route limits", () => {
  it.each([true, new Error("Redis down")])("denies reservation writes on rate limit or limiter error before placement", async result => {
    if (result instanceof Error) mocks.limit.mockRejectedValue(result); else mocks.limit.mockResolvedValue(result);
    expect((await reserve(request(), params)).status).toBe(result === true ? 429 : 503); expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("checks both visitor and business budgets before reading a calendar", async () => {
    expect((await read(new Request("https://app.example.test/api/v1/bookings/fixture?capabilityId=consult"), params)).status).toBe(200);
    expect(mocks.limit.mock.calls.map(c => c[0])).toEqual(["public-booking-read:fixture-ip", "public-booking-read:fixture"]);
    mocks.limit.mockResolvedValue(true); mocks.read.mockClear(); expect((await read(new Request("https://app.example.test/api/v1/bookings/fixture?capabilityId=consult"), params)).status).toBe(429); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("a Redis failure on availability reads prevents provider calls", async () => {
    mocks.limit.mockRejectedValue(new Error("Redis down")); expect((await read(new Request("https://app.example.test/api/v1/bookings/fixture?capabilityId=consult"), params)).status).toBe(503); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("a mail scanner GET never confirms; only same-origin POST consumes the email token", async () => {
    const html = renderToStaticMarkup(await confirmationPage({ params: Promise.resolve({ token: "email-only-token" }), searchParams: Promise.resolve({}) }));
    expect(html).toContain('method="post"'); expect(html).toContain("Confirm my email and request this time"); expect(mocks.confirm).not.toHaveBeenCalled();
    const token = { params: Promise.resolve({ token: "email-only-token" }) };
    const post = (origin: string) => new Request("https://app.example.test/booking-confirm/email-only-token", { method: "POST", headers: { origin } });
    expect((await confirm(post("https://other.example.test"), token)).status).toBe(403); expect(mocks.confirm).not.toHaveBeenCalled();
    mocks.confirm.mockResolvedValue({ status: "confirmed" }); expect((await confirm(post("https://app.example.test"), token)).headers.get("location")).toContain("done=confirmed"); expect(mocks.confirm).toHaveBeenCalledWith("email-only-token");
  });
  it("accepts same-origin no-referrer form posts with Origin null, while refusing opaque cross-site origins", async () => {
    const params = { params: Promise.resolve({ token: "email-token" }) };
    const post = (site: string) => new Request("https://app.example.test/booking-confirm/email-token/action", { method: "POST", headers: { origin: "null", "sec-fetch-site": site } });
    expect((await confirm(post("cross-site"), params)).status).toBe(403); expect(mocks.confirm).not.toHaveBeenCalled();
    mocks.confirm.mockResolvedValue({ status: "pending" });
    expect((await confirm(post("same-origin"), params)).headers.get("location")).toContain("done=pending");
    expect(mocks.confirm).toHaveBeenCalledOnce();
  });
  it("confirmation also fails closed on limiter errors", async () => {
    mocks.limit.mockRejectedValue(new Error("Redis down")); expect((await confirm(new Request("https://app.example.test/booking-confirm/token", { method: "POST", headers: { origin: "https://app.example.test" } }), { params: Promise.resolve({ token: "token" }) })).headers.get("location")).toContain("error=unavailable"); expect(mocks.confirm).not.toHaveBeenCalled();
  });
});
