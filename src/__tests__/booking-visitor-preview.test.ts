import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { visitorBookingFixtureTransport } from "@/app/preview/strelva/booking-visitor/fixture";

function transport(state: Parameters<typeof visitorBookingFixtureTransport>[0], mode: "off" | "on" = "off") {
  const outside = vi.fn();
  const context = createContext({ URL, Response, location: { href: "http://localhost:3026/preview/strelva/booking-visitor" }, fetch: outside });
  runInContext(visitorBookingFixtureTransport(state, mode), context);
  return { outside, fetch: (input: string, init?: RequestInit) => context.fetch(input, init) as Promise<Response> };
}

const endpoint = "http://localhost:3026/preview/strelva/booking-visitor/mock/api/v1/bookings/fixture-native";

describe("isolated generated visitor fixture", () => {
  it("blocks an outside request without calling the pre-existing fetcher", async () => {
    const mock = transport("ready");
    await expect(mock.fetch("https://provider.example.test/calendar", { method: "POST" })).rejects.toThrow("blocks all outside requests");
    expect(mock.outside).not.toHaveBeenCalled();
  });

  it("adds business authority only in the simulated native mode and keeps receipt contracts", async () => {
    const off = transport("ready", "off");
    const on = transport("ready", "on");
    const schedule = await (await off.fetch(endpoint)).json();
    expect(schedule).not.toHaveProperty("bookingAuthority");
    expect(await (await on.fetch(endpoint)).json()).toEqual({ ...schedule, bookingAuthority: "business" });
    const init = { method: "POST", body: JSON.stringify({ slotId: "fixture-slot-two" }) };
    expect(await (await off.fetch(`${endpoint}/reservations`, init)).json()).toEqual(await (await on.fetch(`${endpoint}/reservations`, init)).json());
    expect(off.outside).not.toHaveBeenCalled();
    expect(on.outside).not.toHaveBeenCalled();
  });

  it("keeps receipt checking and cancellation entirely synthetic", async () => {
    const mock = transport("pending");
    const request = { method: "POST", body: "{}" };
    expect((await (await mock.fetch(`${endpoint}/reservations`, request)).json()).receipt.status).toBe("pending");
    expect((await (await mock.fetch(`${endpoint}/reservations/fictional/readback`, request)).json()).receipt.status).toBe("confirmed");
    expect((await (await mock.fetch(`${endpoint}/reservations/fictional`, { method: "DELETE", body: "{}" })).json()).receipt.status).toBe("cancelled");
    expect(mock.outside).not.toHaveBeenCalled();
  });

  it("simulates conflict guidance and intake without a network fallback", async () => {
    const mock = transport("conflict", "on");
    const response = await mock.fetch(`${endpoint}/reservations`, { method: "POST", body: "{}" });
    expect(response.status).toBe(409);
    expect((await response.json()).nextSlots).toHaveLength(1);
    const intake = transport("intake", "on");
    expect((await (await intake.fetch(endpoint)).json()).intake[0]).toMatchObject({ id: "goal", required: true });
    expect(mock.outside).not.toHaveBeenCalled();
    expect(intake.outside).not.toHaveBeenCalled();
  });

  it("does not expose the fixture when preview is disabled", async () => {
    vi.resetModules();
    vi.doMock("@/experience/workspace/preview/enabled", () => ({ strelvaUiPreviewEnabled: () => false }));
    const route = await import("@/app/preview/strelva/booking-visitor/route");
    expect((await route.GET(new Request("http://localhost/preview/strelva/booking-visitor?asset=runtime"))).status).toBe(404);
    vi.doUnmock("@/experience/workspace/preview/enabled");
    vi.resetModules();
  });

  it("forbids network connections and form navigation in the rendered document", async () => {
    vi.doMock("@/experience/workspace/preview/enabled", () => ({ strelvaUiPreviewEnabled: () => true }));
    const route = await import("@/app/preview/strelva/booking-visitor/route");
    const response = await route.GET(new Request("http://localhost/preview/strelva/booking-visitor?state=empty&mode=on"));
    expect(response.headers.get("Content-Security-Policy")).toContain("connect-src 'none'; form-action 'none'");
    expect(await response.text()).toContain("Every request stays in this browser");
    vi.doUnmock("@/experience/workspace/preview/enabled");
    vi.resetModules();
  });
});
