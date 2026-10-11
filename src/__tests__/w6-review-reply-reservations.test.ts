import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishReviewReply } from "@/lib/gbp-replies";
const mocks = vi.hoisted(() => ({ begin: vi.fn(), complete: vi.fn(), readback: vi.fn(), port: vi.fn() }));
vi.mock("@/lib/workspace-ports", () => ({ workspacePorts: () => ({ outsideWriteReceipts: mocks.port }) }));
vi.mock("@/lib/google-access", () => ({
  getGoogleGrant: vi.fn(async () => ({ status: "connected", scopes: undefined })),
  getValidGoogleAccessToken: vi.fn(async () => "fixture-token"),
  getGoogleLocation: vi.fn(async () => ({ accountId: "accounts/1", locationId: "2" })),
}));
vi.mock("@/lib/events", () => ({ addEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/slack", () => ({ sendSlackNotification: vi.fn(async () => undefined) }));
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const options = { actor: "approved event test", commandKey: "approval:fixture" };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "1");
  mocks.port.mockResolvedValue({ beginGoogleWrite: mocks.begin, completeGoogleWrite: mocks.complete, recordReadback: mocks.readback });
  mocks.begin.mockResolvedValue({ claimed: true, attemptId: "attempt" });
  mocks.complete.mockResolvedValue({ id: "receipt" }); mocks.readback.mockResolvedValue({});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("review replies through durable dispatch reservations", () => {
  it.each(["matched", "differs", "failed"])("settles accepted before %s read-back and reads the review resource", async result => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({ reviewReply: { comment: "Before" } })).mockResolvedValueOnce(json({}));
    fetch.mockResolvedValueOnce(result === "failed" ? json({}, 503) : json({ reviewReply: { comment: result === "matched" ? "Thank you!" : "Other" } }));
    expect(await publishReviewReply("alpha", "review", "Thank you!", options)).toMatchObject({ published: true, verified: result === "matched" });
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
    expect(fetch.mock.calls[2]?.[0]).toBe("https://mybusiness.googleapis.com/v4/accounts/1/locations/2/reviews/review");
    expect(mocks.begin.mock.invocationCallOrder[0]!).toBeLessThan(fetch.mock.invocationCallOrder[1]!);
    expect(mocks.complete.mock.invocationCallOrder[0]!).toBeLessThan(fetch.mock.invocationCallOrder[2]!);
    expect(mocks.complete).toHaveBeenCalledWith("attempt", expect.objectContaining({ acceptance: "accepted", beforeState: { comment: "Before" }, readback: "pending" }));
    expect(mocks.readback).toHaveBeenCalledWith("receipt", result, expect.any(String));
  });
  it.each(["pending", "accepted", "unknown"])("never resends a %s reservation", async acceptance => {
    mocks.begin.mockResolvedValueOnce({ claimed: false, acceptance, receipt: { readback: "failed" } });
    const fetch = vi.spyOn(globalThis, "fetch");
    expect(await publishReviewReply("alpha", "review", "Thank you!", options)).toMatchObject({ published: acceptance === "accepted", verified: false });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends nothing if receipt storage cannot reserve", async () => {
    mocks.port.mockRejectedValueOnce(new Error("storage down")); const fetch = vi.spyOn(globalThis, "fetch");
    expect(await publishReviewReply("alpha", "review", "Thanks", options)).toMatchObject({ published: false }); expect(fetch).not.toHaveBeenCalled();
  });
  it("returns accepted after failed settlement and never dispatches the uncertain retry", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({})).mockResolvedValueOnce(json({})).mockResolvedValueOnce(json({}, 503));
    mocks.complete.mockRejectedValueOnce(new Error("storage down"));
    expect(await publishReviewReply("alpha", "review", "Thanks", options)).toMatchObject({ published: true, evidence: expect.stringContaining("reconcile") });
    mocks.begin.mockResolvedValueOnce({ claimed: false, acceptance: "pending", receipt: null });
    expect(await publishReviewReply("alpha", "review", "Thanks", options)).toMatchObject({ published: false });
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
  });
  it.each(["rejected", "unknown"])("records %s without asserting verification", async outcome => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({}));
    if (outcome === "rejected") fetch.mockResolvedValueOnce(json({}, 403)); else fetch.mockRejectedValueOnce(new Error("lost response"));
    expect(await publishReviewReply("alpha", "review", "Thanks", options)).toMatchObject({ published: false, verified: false });
    expect(mocks.complete).toHaveBeenCalledWith("attempt", expect.objectContaining({ acceptance: outcome })); expect(mocks.readback).not.toHaveBeenCalled();
  });
});
