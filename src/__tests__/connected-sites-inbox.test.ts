/**
 * Connected-site inquiries in the workspace Inquiries inbox: read only while
 * connected sites are on for the business, through the store's member reads.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectedSitesStore } from "@/products/connected-sites/store";

const deps = vi.hoisted(() => ({ on: vi.fn() }));
vi.mock("@/products/connected-sites/server", async () => {
  const { connectedSitesStore } = await import("@/products/connected-sites/store");
  return { connectedSitesReleasedFor: deps.on, connectedSitesStore };
});

import { setConnectedSitesStoreForTests } from "@/products/connected-sites/store";
import { readConnectedSiteInquiries } from "@/products/inquiries/linked-leads";

const WS = "7e000000-0000-4000-8000-000000000001";
const ACTOR = { userId: "7e000000-0000-4000-8000-0000000000a1", verifiedEmail: "owner@example.test" };
const site = (id: string, status: "active" | "revoked", host: string) => ({ id, workspaceId: WS, siteHost: host, status });
const inquiry = (id: string, siteId: string) => ({ id, siteId, siteHost: "x", leadId: `lead_${id}`, name: "Pat", email: null, message: "Hi", source: "connected-site:strelva-form", capturedAt: "2026-10-04T09:00:00.000Z" });
let store: { list: ReturnType<typeof vi.fn>; inquiries: ReturnType<typeof vi.fn> };

beforeEach(() => {
  deps.on.mockReset().mockResolvedValue(true);
  store = {
    list: vi.fn(async () => [site("s-active", "active", "bakery.example"), site("s-old", "revoked", "old.example"), site("s-gone", "revoked", "gone.example")]),
    inquiries: vi.fn(async () => [inquiry("i1", "s-active"), inquiry("i2", "s-old")]),
  };
  setConnectedSitesStoreForTests(store as unknown as ConnectedSitesStore);
});
afterEach(() => setConnectedSitesStoreForTests(null));

describe("connected-site inquiries for the inbox", () => {
  it("groups by site: active sites, and a disconnected site only while it still has inquiries", async () => {
    const sites = await readConnectedSiteInquiries(ACTOR, WS);
    expect(deps.on).toHaveBeenCalledWith(ACTOR, WS);
    expect(store.inquiries).toHaveBeenCalledWith(ACTOR, WS, 500);
    expect(sites).toEqual([
      { siteId: "s-active", siteHost: "bakery.example", inquiries: [inquiry("i1", "s-active")] },
      { siteId: "s-old", siteHost: "old.example", inquiries: [inquiry("i2", "s-old")] },
    ]);
  });

  it("reads nothing while connected sites are off for the business, or its flag can't be read", async () => {
    deps.on.mockResolvedValue(false);
    expect(await readConnectedSiteInquiries(ACTOR, WS)).toBeNull();
    deps.on.mockRejectedValue(new Error("flags down"));
    expect(await readConnectedSiteInquiries(ACTOR, WS)).toBeNull();
    expect(store.list).not.toHaveBeenCalled();
  });

  it("a store failure throws, so the inbox says unavailable instead of empty", async () => {
    store.inquiries.mockRejectedValue(new Error("db"));
    await expect(readConnectedSiteInquiries(ACTOR, WS)).rejects.toThrow("db");
  });
});
