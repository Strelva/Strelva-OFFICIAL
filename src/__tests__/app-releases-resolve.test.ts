import { describe, expect, it, vi } from "vitest";
import type { AppReleaseGate, BuiltInApp, BuiltInAppRelease } from "@/platform/app-releases/contracts";
import { resolveBuiltInAppRelease } from "@/platform/app-releases/resolve";

const resend = { provider: "resend", access: "act", optional: false, purpose: "Send email" } as const;
const calendar = { provider: "google_calendar", access: "read", optional: true, purpose: "Read busy times" } as const;
const r2Gate: AppReleaseGate = { kind: "workspace_flag", flag: "catalog_reports" };
const r3Gate: AppReleaseGate = { kind: "env", name: "STRELVA_TEST_X", values: ["1"] };
const availability: AppReleaseGate = { kind: "env", name: "STRELVA_TEST_AVAILABLE", values: ["1"] };

const release = (number: number, gates: AppReleaseGate[], requiredConnections: BuiltInAppRelease["requiredConnections"]): BuiltInAppRelease => ({
  key: `bookings.r${number}`, number, summary: "A thing.", shippedIn: null, changesLiveBehavior: gates.length > 0, gates, requiredConnections,
});
const app: BuiltInApp = {
  id: "bookings", name: "Bookings", publisher: "platform", systemKinds: ["booking"], labelOnSystems: true, makeRealChannels: [], availability: [availability],
  releases: [release(1, [], [resend]), release(2, [r2Gate], [resend, calendar]), release(3, [r3Gate], [calendar])],
};

const reader = (on: AppReleaseGate[]) => vi.fn((gate: AppReleaseGate) => on.some(item => JSON.stringify(item) === JSON.stringify(gate)));

describe("resolveBuiltInAppRelease", () => {
  it("is unavailable when an availability gate is off", async () => {
    expect(await resolveBuiltInAppRelease(app, reader([r2Gate, r3Gate]))).toEqual({ appId: "bookings", available: false });
  });

  it("stays on Release 1 when Release 2 is off and never reads Release 3", async () => {
    const gateOn = reader([availability, r3Gate].slice(0, 1));
    const state = await resolveBuiltInAppRelease(app, gateOn);
    expect(state).toMatchObject({ available: true, release: 1, latest: 3, key: "bookings.r1", heldBack: { number: 2, gates: [r2Gate] } });
    expect(gateOn).not.toHaveBeenCalledWith(r3Gate);
  });

  it("reaches Release 3 when everything is on", async () => {
    expect(await resolveBuiltInAppRelease(app, reader([availability, r2Gate, r3Gate]))).toMatchObject({ release: 3, heldBack: null });
  });

  it("holds at Release 1 when Release 2 is off but Release 3 is on (prefix rule)", async () => {
    expect(await resolveBuiltInAppRelease(app, reader([availability, r3Gate]))).toMatchObject({ release: 1 });
  });

  it("takes required Connections from the effective Release", async () => {
    const one = await resolveBuiltInAppRelease(app, reader([availability]));
    const two = await resolveBuiltInAppRelease(app, reader([availability, r2Gate]));
    const three = await resolveBuiltInAppRelease(app, reader([availability, r2Gate, r3Gate]));
    if (!one.available || !two.available || !three.available) throw new Error("expected available");
    expect(one.requiredConnections).toEqual([resend]);
    expect(two.requiredConnections).toEqual([resend, calendar]);
    expect(three.requiredConnections).toEqual([calendar]);
  });

  it("can ignore availability", async () => {
    const gateOn = reader([]);
    expect(await resolveBuiltInAppRelease(app, gateOn, { ignoreAvailability: true })).toMatchObject({ available: true, release: 1 });
    expect(gateOn).not.toHaveBeenCalledWith(availability);
  });
});
