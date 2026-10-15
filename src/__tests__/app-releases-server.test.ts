import { afterEach, describe, expect, it, vi } from "vitest";
import { appReleaseLabelsEnabled } from "@/platform/app-releases/release";
import {
  builtInAppReleaseMayReach,
  builtInAppReleaseReached,
  effectiveRequiredConnections,
  envGateOn,
  readBuiltInAppRelease,
  readBuiltInAppReleases,
} from "@/platform/app-releases/server";
import { clearReleaseFlagCache, setReleaseFlagsDb } from "@/platform/release-flags/store";

const WS = "7f000000-0000-4000-8000-000000000010";

function fakeFlags(flags: Record<string, "off" | "operators" | "on"> = {}) {
  const rpc = vi.fn(async () => ({
    data: {
      workspaceId: WS,
      flags: Object.fromEntries(Object.entries(flags).map(([flag, state]) => [flag, { state, revision: 1, changedAt: "2026-10-06T00:00:00Z" }])),
      testers: [],
      testerEmails: [],
    },
    error: null,
  }));
  setReleaseFlagsDb({ rpc });
  return rpc;
}

afterEach(() => {
  setReleaseFlagsDb(null);
  clearReleaseFlagCache();
});

describe("built-in App release server", () => {
  it("trims env gate values", () => {
    const gate = { kind: "env", name: "STRELVA_ASK_RELEASE", values: ["1"] } as const;
    expect(envGateOn(gate, { STRELVA_ASK_RELEASE: " 1 " })).toBe(true);
    expect(envGateOn(gate, { STRELVA_ASK_RELEASE: "0" })).toBe(false);
    expect(envGateOn(gate, {})).toBe(false);
  });

  it("reads Inquiries availability from the workspace row", async () => {
    const env = { STRELVA_WORKSPACE_RELEASE: "1", STRELVA_INQUIRIES_RELEASE: "workspace" };
    fakeFlags({ inquiries: "off" });
    expect(await readBuiltInAppRelease("inquiries", WS, undefined, env)).toEqual({ appId: "inquiries", available: false });
    clearReleaseFlagCache();
    fakeFlags({ inquiries: "on" });
    expect(await readBuiltInAppRelease("inquiries", WS, undefined, env)).toMatchObject({ available: true, release: 1 });
  });

  it("reaches Bookings Release 1 without reading any flag", async () => {
    const rpc = fakeFlags();
    expect(await builtInAppReleaseReached("bookings", "bookings.baseline", WS, undefined, {})).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("makes Ask unavailable unless STRELVA_ASK_RELEASE is set", async () => {
    fakeFlags({ systems: "on" });
    const base = { STRELVA_WORKSPACE_RELEASE: "1", STRELVA_SYSTEMS_RELEASE: "1" };
    expect(await readBuiltInAppRelease("ask", WS, undefined, base)).toEqual({ appId: "ask", available: false });
    expect(await readBuiltInAppRelease("ask", WS, undefined, { ...base, STRELVA_ASK_RELEASE: "1" })).toMatchObject({ available: true, release: 1 });
  });

  it("returns the Inquiries email requirement even when the inquiries flag is off", async () => {
    fakeFlags({ inquiries: "off" });
    const connections = await effectiveRequiredConnections("inquiries", WS, undefined, { STRELVA_WORKSPACE_RELEASE: "1", STRELVA_INQUIRIES_RELEASE: "workspace" });
    expect(connections).toEqual([expect.objectContaining({ provider: "resend", access: "act", optional: false })]);
  });

  it("throws on an unknown key", async () => {
    await expect(builtInAppReleaseReached("bookings", "bookings.nope", WS)).rejects.toThrow("Unknown Release key");
    expect(() => builtInAppReleaseMayReach("bookings", "bookings.nope")).toThrow();
  });

  it("reads all six Apps in catalog order", async () => {
    fakeFlags();
    const states = await readBuiltInAppReleases(WS, undefined, {});
    expect(states.map(state => state.appId)).toEqual(["bookings", "inquiries", "recaps", "documents", "ask", "internal_tools"]);
  });

  it("answers the early gate from env alone", () => {
    expect(builtInAppReleaseMayReach("bookings", "bookings.baseline", {})).toBe(true);
    expect(builtInAppReleaseMayReach("ask", "ask.baseline", {})).toBe(false);
    expect(builtInAppReleaseMayReach("ask", "ask.baseline", { STRELVA_WORKSPACE_RELEASE: "1", STRELVA_ASK_RELEASE: "1", STRELVA_SYSTEMS_RELEASE: "1" })).toBe(true);
  });

  it("shows labels only with both switches", () => {
    expect(appReleaseLabelsEnabled({})).toBe(false);
    expect(appReleaseLabelsEnabled({ STRELVA_WORKSPACE_RELEASE: "1" })).toBe(false);
    expect(appReleaseLabelsEnabled({ STRELVA_APP_RELEASES: "1" })).toBe(false);
    expect(appReleaseLabelsEnabled({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_APP_RELEASES: "1" })).toBe(true);
    expect(appReleaseLabelsEnabled({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_APP_RELEASES: "0" })).toBe(false);
  });
});
