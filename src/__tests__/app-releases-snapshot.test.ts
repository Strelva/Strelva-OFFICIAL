import { describe, expect, it } from "vitest";
import { appReleasesForSnapshot } from "@/platform/app-releases/server";
import type { BuiltInAppReleaseState } from "@/platform/app-releases/contracts";

const bookings: BuiltInAppReleaseState = {
  appId: "bookings", available: true, release: 1, key: "bookings.baseline", latest: 1, heldBack: null,
  requiredConnections: [{ provider: "resend", access: "act", optional: true, purpose: "Send booking confirmations and reminders to customers" }],
};

describe("appReleasesForSnapshot", () => {
  it("drops unavailable Apps and formats the label", () => {
    expect(appReleasesForSnapshot([bookings, { appId: "ask", available: false }])).toEqual({
      bookings: { appId: "bookings", name: "Bookings", release: 1, latest: 1, label: "Bookings Release 1", requiredConnections: bookings.requiredConnections },
    });
  });
  it("gives an empty object for no input", () => {
    expect(appReleasesForSnapshot([])).toEqual({});
  });
});
