import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGbpPost, updateBusinessHours, uploadGbpPhoto } from "@/lib/gbp-management";

const mocks = vi.hoisted(() => ({
  begin: vi.fn(), complete: vi.fn(), readback: vi.fn(), event: vi.fn(),
  grant: vi.fn(), location: vi.fn(), token: vi.fn(), safety: vi.fn(),
}));
vi.mock("@/lib/workspace-ports", () => ({ workspacePorts: () => ({ outsideWriteReceipts: async () => ({
  beginGoogleWrite: mocks.begin, completeGoogleWrite: mocks.complete, recordReadback: mocks.readback,
}) }) }));
vi.mock("@/lib/google-access", () => ({ getGoogleGrant: mocks.grant, getGoogleLocation: mocks.location, getValidGoogleAccessToken: mocks.token }));
vi.mock("@/lib/events", () => ({ addEvent: mocks.event }));
vi.mock("@/lib/slack", () => ({ sendSlackNotification: vi.fn(async () => undefined) }));
vi.mock("@/lib/audit/checks", () => ({ validateUrlSafety: mocks.safety }));

const beforeHours = { regularHours: { periods: [{ openDay: "MONDAY", openTime: { hours: 8 }, closeDay: "MONDAY", closeTime: { hours: 16 } }] } };
const hours = { regularHours: { periods: [{ openDay: "MONDAY" as const, openTime: { hours: 9, minutes: 0 }, closeDay: "MONDAY" as const, closeTime: { hours: 17, minutes: 0 } }] } };
const options = { commandKey: "approval:test", actor: "approved event test" };
const receiptId = "10000000-0000-4000-8000-000000000001";
const attemptId = "10000000-0000-4000-8000-000000000002";
const resource = "accounts/1/locations/2/localPosts/post";
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status }); }
function fetchDouble() { return vi.spyOn(globalThis, "fetch"); }
function writes(fetch: ReturnType<typeof fetchDouble>) { return fetch.mock.calls.filter(([, init]) => ["POST", "PATCH"].includes(init?.method ?? "")); }

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "1");
  mocks.grant.mockResolvedValue({ status: "connected", scopes: ["https://www.googleapis.com/auth/business.manage"] });
  mocks.location.mockResolvedValue({ accountId: "1", locationId: "2" }); mocks.token.mockResolvedValue("test-token");
  mocks.begin.mockResolvedValue({ claimed: true, attemptId, acceptance: "pending", receipt: null });
  mocks.complete.mockResolvedValue({ id: receiptId }); mocks.readback.mockResolvedValue({ id: receiptId });
  mocks.safety.mockResolvedValue(undefined); mocks.event.mockResolvedValue({ id: "event" });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("operator Google dispatch reservations and read-back", () => {
  it("captures before-hours, reserves before PATCH, and compares Google's omitted zeroes semantically", async () => {
    const fetch = fetchDouble().mockResolvedValueOnce(json(beforeHours)).mockResolvedValueOnce(json({ name: "locations/2" }))
      .mockResolvedValueOnce(json({ regularHours: { periods: [{ openDay: "MONDAY", openTime: { hours: 9 }, closeDay: "MONDAY", closeTime: { hours: 17 } }] } }));
    expect(await updateBusinessHours("alpha", hours, options)).toMatchObject({ success: true, verified: true });
    expect(writes(fetch)).toHaveLength(1);
    expect(mocks.begin.mock.invocationCallOrder[0]!).toBeLessThan(fetch.mock.invocationCallOrder[1]!);
    expect(mocks.complete).toHaveBeenCalledWith(attemptId, expect.objectContaining({ beforeState: beforeHours, acceptance: "accepted", readback: "pending" }));
    expect(mocks.readback).toHaveBeenCalledWith(receiptId, "matched", expect.any(String));
  });
  it("treats Google's empty midnight TimeOfDay as zero hours and minutes", async () => {
    const midnight = { regularHours: { periods: [{ openDay: "MONDAY" as const, openTime: { hours: 0, minutes: 0 }, closeDay: "MONDAY" as const, closeTime: { hours: 8, minutes: 0 } }] } };
    fetchDouble().mockResolvedValueOnce(json(beforeHours)).mockResolvedValueOnce(json({ name: "locations/2" }))
      .mockResolvedValueOnce(json({ regularHours: { periods: [{ openDay: "MONDAY", openTime: {}, closeDay: "MONDAY", closeTime: { hours: 8 } }] } }));
    expect(await updateBusinessHours("alpha", midnight, options)).toMatchObject({ success: true, verified: true });
    expect(mocks.readback).toHaveBeenCalledWith(receiptId, "matched", expect.any(String));
  });
  it("fails closed before PATCH when before-hours or reservation storage is unavailable", async () => {
    const fetch = fetchDouble().mockResolvedValueOnce(json({}, 503));
    expect(await updateBusinessHours("alpha", hours, options)).toMatchObject({ success: false });
    expect(mocks.begin).not.toHaveBeenCalled(); expect(writes(fetch)).toHaveLength(0);
    fetch.mockResolvedValueOnce(json(beforeHours)); mocks.begin.mockRejectedValueOnce(new Error("database unavailable"));
    expect(await updateBusinessHours("alpha", hours, options)).toMatchObject({ success: false });
    expect(writes(fetch)).toHaveLength(0);
  });
  it.each(["accepted", "pending", "unknown"])("does not replay a %s dispatch", async (acceptance) => {
    const fetch = fetchDouble(); mocks.begin.mockResolvedValue({ claimed: false, attemptId, acceptance, receipt: { readback: "failed" } });
    expect(await createGbpPost("alpha", { summary: "Hello" }, options)).toMatchObject({ success: acceptance === "accepted", verified: false });
    expect(fetch).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
  });
  it.each(["matched", "differs", "failed"])("records post read-back %s without resending an accepted post", async (readback) => {
    const fetch = fetchDouble().mockResolvedValueOnce(json({ name: resource }));
    if (readback === "failed") fetch.mockRejectedValueOnce(new Error("Google unavailable"));
    else fetch.mockResolvedValueOnce(json({ name: resource, summary: readback === "matched" ? "Hello" : "Changed" }));
    expect(await createGbpPost("alpha", { summary: "Hello" }, options)).toMatchObject({ success: true, verified: readback === "matched" });
    expect(writes(fetch)).toHaveLength(1); expect(mocks.readback).toHaveBeenCalledWith(receiptId, readback, expect.any(String));
    expect(mocks.complete.mock.invocationCallOrder[0]!).toBeLessThan(fetch.mock.invocationCallOrder[1]!);
  });
  it("records missing Google resource identity as not possible, never as verified", async () => {
    const fetch = fetchDouble().mockResolvedValueOnce(json({}));
    expect(await createGbpPost("alpha", { summary: "Hello" }, options)).toMatchObject({ success: true, verified: false });
    expect(fetch).toHaveBeenCalledOnce(); expect(mocks.readback).toHaveBeenCalledWith(receiptId, "not_possible", expect.any(String));
  });
  it("records a provider rejection and preserves the setup-pending outcome", async () => {
    const fetch = fetchDouble().mockResolvedValueOnce(json({ error: "RESOURCE_EXHAUSTED quota" }, 429));
    expect(await createGbpPost("alpha", { summary: "Hello" }, options)).toMatchObject({ success: false, pendingSetup: true });
    expect(mocks.complete).toHaveBeenCalledWith(attemptId, expect.objectContaining({ acceptance: "rejected" }));
    expect(fetch).toHaveBeenCalledOnce(); expect(mocks.readback).not.toHaveBeenCalled();
  });
  it("records a lost response as uncertain instead of retryable rejection", async () => {
    const fetch = fetchDouble().mockRejectedValueOnce(new Error("lost response"));
    expect(await createGbpPost("alpha", { summary: "Hello" }, options)).toMatchObject({ success: false, evidence: expect.stringContaining("Do not resend") });
    expect(mocks.complete).toHaveBeenCalledWith(attemptId, expect.objectContaining({ acceptance: "unknown" })); expect(fetch).toHaveBeenCalledOnce();
  });
  it("keeps an accepted write accepted when receipt settlement or read-back evidence storage fails", async () => {
    const fetch = fetchDouble().mockResolvedValueOnce(json({ name: resource })).mockResolvedValueOnce(json({ name: resource, summary: "Hello" }));
    mocks.complete.mockRejectedValueOnce(new Error("database down"));
    expect(await createGbpPost("alpha", { summary: "Hello" }, options)).toMatchObject({ success: true, evidence: expect.stringContaining("reconciliation") });
    expect(writes(fetch)).toHaveLength(1); expect(mocks.readback).not.toHaveBeenCalled();
    fetch.mockResolvedValueOnce(json({ name: resource })).mockResolvedValueOnce(json({ name: resource, summary: "Hello" }));
    mocks.readback.mockRejectedValueOnce(new Error("database down"));
    expect(await createGbpPost("alpha", { summary: "Hello" }, options)).toMatchObject({ success: true, evidence: expect.stringContaining("receipt remains pending") });
  });
  it("verifies photo source and category, and rejects unsafe sources before dispatch", async () => {
    const name = "accounts/1/locations/2/media/photo";
    const fetch = fetchDouble().mockResolvedValueOnce(json({ name })).mockResolvedValueOnce(json({ name, sourceUrl: "https://example.test/photo.jpg", locationAssociation: { category: "COVER" } }));
    expect(await uploadGbpPhoto("alpha", "https://example.test/photo.jpg", "COVER", options)).toMatchObject({ success: true, verified: true });
    expect(mocks.readback).toHaveBeenCalledWith(receiptId, "matched", expect.any(String));
    mocks.safety.mockRejectedValueOnce(new Error("private address"));
    expect(await uploadGbpPhoto("alpha", "http://127.0.0.1/photo", "COVER", options)).toMatchObject({ success: false });
    expect(writes(fetch)).toHaveLength(1);
  });
  it("keeps the flag-off hours write on its original path without reading the new receipt stores", async () => {
    vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "0");
    const fetch = fetchDouble().mockResolvedValueOnce(json({})).mockResolvedValueOnce(json({}));
    expect(await updateBusinessHours("alpha", hours, options)).toMatchObject({ success: true, verified: true });
    expect(fetch.mock.calls[0]?.[1]?.method).toBe("PATCH"); expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.begin).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
  });
});
