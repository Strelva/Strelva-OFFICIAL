import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ enabled: vi.fn(), choose: vi.fn(), prepare: vi.fn(), rate: vi.fn(), actor: vi.fn(), release: vi.fn(), homes: vi.fn() }));
vi.mock("@/products/inquiries", async () => ({ inquiryBookingHandoffEnabled: mocks.enabled, chooseInquiryBookingSlot: mocks.choose, prepareWorkspaceInquiryBooking: mocks.prepare, inquiryReleaseEnabledForWorkspace: mocks.release, prepareInquiryBookingInput: (await import("@/products/inquiries/booking-handoff")).prepareInquiryBookingInput }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/platform/owner-entry/linked-sites", () => ({ ownerEntryHomesOpen: mocks.homes }));
vi.mock("@/platform/workspaces/http", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/platform/workspaces/http")>()), workspaceHttpActor: mocks.actor, workspaceWriteGuard: () => null, readWorkspaceBody: (request: Request) => request.json(), workspaceJson: (data: unknown, status = 200) => Response.json(data, { status }), workspaceHttpFailure: () => Response.json({ error: "refused" }, { status: 403 }) }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedAsync: mocks.rate, isRateLimitedWindowedAsync: mocks.rate, rateLimitKey: () => "fixture-key" }));
import { POST as choose } from "@/app/inquiry-booking/[token]/action/route";
import { POST as propose } from "@/app/api/workspace/inquiries/booking-offer/route";
const id = "e0000000-0000-4000-8000-000000000001";
function selection(slot = "0", origin = "https://app.strelva.test") { return new Request("https://app.strelva.test/inquiry-booking/fixture/action", { method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ slot }) }); }
function proposal() { return new Request("https://app.strelva.test/api/workspace/inquiries/booking-offer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: id, rowId: id }) }); }
beforeEach(() => {
  vi.resetAllMocks(); mocks.enabled.mockReturnValue(true); mocks.rate.mockResolvedValue(false); mocks.actor.mockResolvedValue({ userId: id, verifiedEmail: "owner@example.test" }); mocks.homes.mockResolvedValue(true); mocks.release.mockResolvedValue(true); mocks.choose.mockResolvedValue({ id, status: "requested" }); mocks.prepare.mockResolvedValue({ chooseUrl: "/inquiry-booking/fixture" });
});
describe("inquiry booking routes", () => {
  it("has no flags-off selection or proposal effects", async () => {
    mocks.enabled.mockReturnValue(false);
    expect((await choose(selection(), { params: Promise.resolve({ token: "fixture" }) })).status).toBe(404);
    expect((await propose(proposal())).status).toBe(503);
    expect(mocks.choose).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("rejects cross-origin requests and malformed indices without acquiring a booking", async () => {
    expect((await choose(selection("0", "https://other.test"), { params: Promise.resolve({ token: "fixture" }) })).status).toBe(403);
    const response = await choose(selection("3"), { params: Promise.resolve({ token: "fixture" }) });
    expect(response.status).toBe(303); expect(response.headers.get("location")).toContain("error=unavailable"); expect(mocks.choose).not.toHaveBeenCalled();
  });
  it("redirects after explicit choice and retains failures as visible, without a second effect", async () => {
    const response = await choose(selection("1"), { params: Promise.resolve({ token: "fixture" }) });
    expect(response.status).toBe(303); expect(mocks.choose).toHaveBeenCalledExactlyOnceWith("fixture", 1);
    mocks.choose.mockRejectedValue(new Error("revoked"));
    const refused = await choose(selection(), { params: Promise.resolve({ token: "fixture" }) });
    expect(refused.headers.get("location")).toContain("error=unavailable");
    mocks.rate.mockResolvedValue(true); mocks.choose.mockClear();
    expect((await choose(selection(), { params: Promise.resolve({ token: "fixture" }) })).headers.get("location")).toContain("error=rate"); expect(mocks.choose).not.toHaveBeenCalled();
  });
  it("preserves the browser Host behind a proxy and refuses malformed Origin", async () => {
    const request = new Request("http://localhost:32766/inquiry-booking/fixture/action", { method: "POST", headers: { origin: "http://127.0.0.1:32766", host: "127.0.0.1:32766", "content-type": "application/x-www-form-urlencoded" }, body: "slot=0" });
    const response = await choose(request, { params: Promise.resolve({ token: "fixture" }) });
    expect(response.headers.get("location")).toBe("http://127.0.0.1:32766/inquiry-booking/fixture");
    expect((await choose(selection("0", "null"), { params: Promise.resolve({ token: "fixture" }) })).status).toBe(403);
  });
  it("requires a verified member, workspace release and owner SQL authority to propose times", async () => {
    mocks.actor.mockResolvedValue(null); expect((await propose(proposal())).status).toBe(401); expect(mocks.prepare).not.toHaveBeenCalled();
    mocks.actor.mockResolvedValue({ userId: id, verifiedEmail: "owner@example.test" }); mocks.release.mockResolvedValue(false);
    expect((await propose(proposal())).status).toBe(503); expect(mocks.prepare).not.toHaveBeenCalled();
    mocks.release.mockResolvedValue(true); mocks.prepare.mockRejectedValue(new Error("owner only")); expect((await propose(proposal())).status).toBe(403);
    mocks.prepare.mockResolvedValue({ chooseUrl: "/inquiry-booking/fixture" });
    expect(await (await propose(proposal())).json()).toEqual({ offer: { chooseUrl: "/inquiry-booking/fixture" } });
  });
  it("cancels an oversized chunked form without making a booking", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("slot=0&padding="));
        controller.enqueue(new TextEncoder().encode("x".repeat(2048)));
      }, cancel,
    });
    const request = new Request("https://app.strelva.test/inquiry-booking/fixture/action", Object.assign({ method: "POST", headers: { origin: "https://app.strelva.test", "content-type": "application/x-www-form-urlencoded" }, body }, { duplex: "half" }));
    expect(request.headers.has("content-length")).toBe(false);
    const response = await choose(request, { params: Promise.resolve({ token: "fixture" }) });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("error=unavailable");
    expect(cancel).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(mocks.choose).not.toHaveBeenCalled();
  });
  it("refuses unsupported form encodings and ambiguous choices without a booking", async () => {
    const unsupported = new Request("https://app.strelva.test/inquiry-booking/fixture/action", { method: "POST", headers: { origin: "https://app.strelva.test", "content-type": "application/json" }, body: '{"slot":"0"}' });
    expect((await choose(unsupported, { params: Promise.resolve({ token: "fixture" }) })).headers.get("location")).toContain("error=unavailable");
    const repeated = new Request("https://app.strelva.test/inquiry-booking/fixture/action", { method: "POST", headers: { origin: "https://app.strelva.test", "content-type": "application/x-www-form-urlencoded" }, body: "slot=0&slot=1" });
    expect((await choose(repeated, { params: Promise.resolve({ token: "fixture" }) })).headers.get("location")).toContain("error=unavailable");
    expect(mocks.choose).not.toHaveBeenCalled();
  });
});
