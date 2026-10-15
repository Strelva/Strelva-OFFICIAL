import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBookingPageAdapter, createInquiryFormAdapter } from "@/platform/make-real/live-adapters";
import { effectiveRequiredConnections } from "@/platform/app-releases/server";
import { assertRequiredConnections } from "@/platform/system-versions/required-connections";
import { BIZ, ctx, hostedEffect } from "./helpers/make-real-live-fixtures";

vi.mock("@/platform/system-versions/required-connections", () => ({ assertRequiredConnections: vi.fn(async () => {}) }));
vi.mock("@/platform/app-releases/server", async importOriginal => {
  const actual = await importOriginal<typeof import("@/platform/app-releases/server")>();
  return { ...actual, effectiveRequiredConnections: vi.fn(actual.effectiveRequiredConnections) };
});

const ports = { read: vi.fn(), publish: vi.fn(), rollback: vi.fn() } as never;

beforeEach(() => {
  vi.mocked(assertRequiredConnections).mockClear();
  vi.mocked(effectiveRequiredConnections).mockClear();
});

describe("Make it live reads the App's current Release", () => {
  it("never checks Connections for a booking page whose Connections are all optional", async () => {
    const adapter = createBookingPageAdapter(ports, ctx());
    await expect(adapter.ready!({ businessId: BIZ, effect: hostedEffect() })).resolves.toEqual({ ok: true });
    expect(assertRequiredConnections).not.toHaveBeenCalled();
  });

  it("checks the catalog requirement once for an inquiry form", async () => {
    const adapter = createInquiryFormAdapter(ports, ctx());
    await adapter.ready!({ businessId: BIZ, effect: hostedEffect() });
    expect(assertRequiredConnections).toHaveBeenCalledTimes(1);
    expect(assertRequiredConnections).toHaveBeenCalledWith({
      actor: expect.anything(), workspaceId: BIZ,
      requiredConnections: [expect.objectContaining({ provider: "resend", access: "act", optional: false, purpose: "Send System email to approved recipients" })],
    });
  });

  it("waits for a Release that declares a required Connection and returns the reason", async () => {
    vi.mocked(effectiveRequiredConnections).mockResolvedValueOnce([{ provider: "google_calendar", access: "read", optional: false, purpose: "Read busy times" }]);
    vi.mocked(assertRequiredConnections).mockRejectedValueOnce(new Error("Connect Google Calendar first."));
    const adapter = createBookingPageAdapter(ports, ctx());
    await expect(adapter.ready!({ businessId: BIZ, effect: hostedEffect() })).resolves.toEqual({ ok: false, reason: "Connect Google Calendar first." });
  });

  it("asks to retry when the Release cannot be read", async () => {
    vi.mocked(effectiveRequiredConnections).mockRejectedValueOnce(new Error("rpc down"));
    const adapter = createInquiryFormAdapter(ports, ctx());
    await expect(adapter.ready!({ businessId: BIZ, effect: hostedEffect() })).resolves.toEqual({
      ok: false, reason: "Open Connections and retry checking this business's accounts before making it live.",
    });
    expect(assertRequiredConnections).not.toHaveBeenCalled();
  });
});
