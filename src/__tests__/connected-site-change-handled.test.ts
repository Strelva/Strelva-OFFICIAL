import { afterEach, describe, expect, it, vi } from "vitest";
import { readConnectedSiteChangeHandled } from "@/products/connected-sites/changes-handled";
import type { ConnectedSiteChangesStore } from "@/products/connected-sites/changes-store";
import { connectedSiteChangeOwnerEmailEnabled } from "@/products/connected-sites/keep-your-site-release";

const WS = "aaaaaaaa-0000-4000-8000-000000000001";
const actor = { userId: "aaaaaaaa-0000-4000-8000-0000000000a1", verifiedEmail: "owner@example.test" };
const row = (patch: Record<string, unknown> = {}) => ({
  id: "aaaaaaaa-0000-4000-8000-0000000000f1", at: "2026-10-20T12:00:00Z", systemId: "aaaaaaaa-0000-4000-8000-0000000000d1", title: "Update the Saturday hours", siteHost: "bakery.example",
  platform: "wix", readBack: "confirmed", releaseNumber: 3, actor: { kind: "agency", displayName: "North Studio" }, ...patch,
});
const store = (rows: unknown[] | Error) => ({ releases: vi.fn(async () => { if (rows instanceof Error) throw rows; return rows; }) }) as unknown as ConnectedSiteChangesStore;
const on = () => { vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_CONNECTED_SITES_RELEASE", "workspace"); vi.stubEnv("STRELVA_KEEP_YOUR_SITE_RELEASE", "workspace"); };
afterEach(() => vi.unstubAllEnvs());

describe("What changed from connected-site Releases", () => {
  it("names the agency that made the edit, not the viewer, and says Strelva saw it live", async () => {
    on();
    const [receipt] = await readConnectedSiteChangeHandled(actor, WS, "2026-10-13T00:00:00Z", store([row()]));
    expect(receipt).toMatchObject({
      id: "connected-site-change:aaaaaaaa-0000-4000-8000-0000000000f1", store: "connected_site_changes", systemId: "aaaaaaaa-0000-4000-8000-0000000000d1",
      sentence: "North Studio changed bakery.example in Wix: Update the Saturday hours", changed: "Release 3", at: "2026-10-20T12:00:00Z",
      evidence: { providerAccepted: true, readBack: "verified" },
      undo: { state: "not_undoable", reason: "Changes on bakery.example are made in Wix. Ask your agency to change it back." },
    });
    expect(receipt!.actor).toMatchObject({ displayName: "North Studio" });
  });
  it("marks a Release recorded without seeing the change as not verified", async () => {
    on();
    const [receipt] = await readConnectedSiteChangeHandled(actor, WS, "x", store([row({ readBack: "not_confirmed" })]));
    expect(receipt!.evidence).toEqual({ providerAccepted: true, readBack: "not_verified" });
  });
  it("stays neutral when the actor was not recorded", async () => {
    on();
    const [receipt] = await readConnectedSiteChangeHandled(actor, WS, "x", store([row({ actor: null })]));
    expect(receipt!.sentence).toBe("Changed bakery.example in Wix: Update the Saturday hours");
    expect(receipt!.actor).toBeUndefined();
  });
  it("reads nothing while the flag is off", async () => {
    const s = store([row()]);
    expect(await readConnectedSiteChangeHandled(actor, WS, "x", s)).toEqual([]);
    expect(s.releases).not.toHaveBeenCalled();
  });
  it("returns nothing when the read fails", async () => {
    on();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await readConnectedSiteChangeHandled(actor, WS, "x", store(new Error("db")))).toEqual([]);
    warn.mockRestore();
  });
});

describe("owner email for planned changes", () => {
  it("is off unless both EMAIL_SENDING_ENABLED and the change switch are on", () => {
    vi.stubEnv("EMAIL_SENDING_ENABLED", "true");
    expect(connectedSiteChangeOwnerEmailEnabled()).toBe(false);
    vi.stubEnv("STRELVA_CONNECTED_SITE_CHANGE_OWNER_EMAIL", "1");
    expect(connectedSiteChangeOwnerEmailEnabled()).toBe(true);
    vi.stubEnv("EMAIL_SENDING_ENABLED", "false");
    expect(connectedSiteChangeOwnerEmailEnabled()).toBe(false);
  });
});
