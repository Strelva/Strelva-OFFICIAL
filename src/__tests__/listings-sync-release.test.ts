import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listingsGoogleFixReached, listingsOwnerEmailEnabled, listingsSyncAvailable } from "@/products/listings-sync/server";
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

const KEYS = ["STRELVA_WORKSPACE_RELEASE", "STRELVA_LISTINGS_SYNC_RELEASE", "STRELVA_LISTINGS_SYNC_GOOGLE_FIX", "STRELVA_LISTINGS_SYNC_OWNER_EMAIL", "EMAIL_SENDING_ENABLED"];
beforeEach(() => { for (const key of KEYS) vi.stubEnv(key, ""); });
afterEach(() => {
  vi.unstubAllEnvs();
  setReleaseFlagsDb(null);
  clearReleaseFlagCache();
});

describe("Listings in sync switches", () => {
  it("is off with no env and makes no database call", async () => {
    const rpc = fakeFlags({ listings_sync: "on" });
    expect(await listingsSyncAvailable(WS)).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("is on with the workspace switch, the App flag and a row set on", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_LISTINGS_SYNC_RELEASE", "workspace");
    fakeFlags({ listings_sync: "on" });
    expect(await listingsSyncAvailable(WS)).toBe(true);
    clearReleaseFlagCache();
    fakeFlags({ listings_sync: "off" });
    expect(await listingsSyncAvailable(WS)).toBe(false);
  });

  it("keeps the Google fix off until its own env switch is set", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_LISTINGS_SYNC_RELEASE", "workspace");
    fakeFlags({ listings_sync: "on" });
    expect(await listingsGoogleFixReached(WS)).toBe(false);
    vi.stubEnv("STRELVA_LISTINGS_SYNC_GOOGLE_FIX", "1");
    expect(await listingsGoogleFixReached(WS)).toBe(true);
  });

  it("keeps owner email off while email sending is off", () => {
    vi.stubEnv("STRELVA_LISTINGS_SYNC_OWNER_EMAIL", "1");
    expect(listingsOwnerEmailEnabled()).toBe(false);
    vi.stubEnv("EMAIL_SENDING_ENABLED", "true");
    expect(listingsOwnerEmailEnabled()).toBe(true);
  });
});
