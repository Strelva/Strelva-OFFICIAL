import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_LISTINGS_READ_MASK, readBookingSurface, readGoogleLocation, readWebsitePage, readYelpBusiness } from "@/products/listings-sync/readers";
import { readListingTargets, type TargetDeps } from "@/products/listings-sync/targets";

const WS = "7f000000-0000-4000-8000-000000000010";
const OTHER = "7f000000-0000-4000-8000-000000000011";

beforeEach(() => { vi.stubEnv("STRELVA_LISTINGS_SYNC_YELP", ""); });
afterEach(() => vi.unstubAllEnvs());

describe("readWebsitePage", () => {
  const html = `<html><head><script type="application/ld+json">${JSON.stringify({ "@type": "LocalBusiness", name: "Harbor", telephone: "(716) 555-0100" })}</script></head>
    <body><a href="tel:+17165550100">Call</a><a href="/book">Book</a><a href="https://calendly.com/x">Calendly</a><a href="mailto:a@b.test">Mail</a><p>Open   daily</p><script>var x=1</script></body></html>`;
  it("extracts JSON-LD, tel links and absolute hrefs", async () => {
    const read = await readWebsitePage("https://harbor.example.test/", { fetchPage: async () => html });
    expect(read?.report.businesses[0]?.telephone).toBe("(716) 555-0100");
    expect(read?.telHrefs).toEqual(["tel:+17165550100"]);
    expect(read?.hrefs).toEqual(["https://harbor.example.test/book", "https://calendly.com/x"]);
    expect(read?.text).toContain("Open daily");
    expect(read?.text).not.toContain("var x");
  });
  it("returns null when the page cannot be read", async () => {
    expect(await readWebsitePage("https://harbor.example.test/", { fetchPage: async () => null })).toBeNull();
  });
});

describe("readGoogleLocation", () => {
  const target = { tenantId: "t1", locationId: "loc1" };
  const make = (over: { approval?: string; accessPending?: boolean; getLocation?: unknown; contextThrows?: boolean } = {}) => {
    const getLocation = vi.fn(async () => over.getLocation ?? { ok: true, data: { phoneNumbers: { primaryPhone: "x" } } });
    const patchLocation = vi.fn();
    const context = vi.fn(async () => { if (over.contextThrows) throw new Error("Reconnect Google to continue."); return { client: { getLocation, patchLocation }, location: { locationId: "loc1" } }; });
    const control = vi.fn(async () => ({ accessPending: over.accessPending ?? false }));
    const access = vi.fn(() => ({ approval: over.approval ?? "approved" }));
    return { deps: { context, control, access } as never, getLocation, patchLocation, context, control };
  };
  it("waits on Google when approval is pending, without calling Google", async () => {
    const m = make({ approval: "pending" });
    expect(await readGoogleLocation(target, WS, m.deps)).toEqual({ status: "waiting_on_google" });
    expect(m.context).not.toHaveBeenCalled();
  });
  it("waits on Google when the listing control says access is pending", async () => {
    const m = make({ accessPending: true });
    expect(await readGoogleLocation(target, WS, m.deps)).toEqual({ status: "waiting_on_google" });
    expect(m.getLocation).not.toHaveBeenCalled();
  });
  it("asks to reconnect when the context throws", async () => {
    expect(await readGoogleLocation(target, WS, make({ contextThrows: true }).deps)).toEqual({ status: "reconnect", reason: "Reconnect Google to continue." });
  });
  it("waits on Google on setup_pending", async () => {
    expect(await readGoogleLocation(target, WS, make({ getLocation: { ok: false, kind: "setup_pending", status: 403, detail: "" } }).deps)).toEqual({ status: "waiting_on_google" });
  });
  it("reads with the fixed mask and never patches", async () => {
    const m = make();
    const read = await readGoogleLocation(target, WS, m.deps);
    expect(read).toEqual({ status: "read", data: { phoneNumbers: { primaryPhone: "x" } } });
    expect(m.getLocation).toHaveBeenCalledWith({ locationId: "loc1" }, GOOGLE_LISTINGS_READ_MASK);
    expect(m.patchLocation).not.toHaveBeenCalled();
  });
  it("maps auth and other failures", async () => {
    expect((await readGoogleLocation(target, WS, make({ getLocation: { ok: false, kind: "auth", status: 401, detail: "" } }).deps)).status).toBe("reconnect");
    expect((await readGoogleLocation(target, WS, make({ getLocation: { ok: false, kind: "error", status: 500, detail: "" } }).deps)).status).toBe("unreadable");
  });
});

describe("readBookingSurface", () => {
  it("returns hours outside the record", async () => {
    const context = {
      tenantStableId: null, workspaceId: WS, systemId: "s1", paused: false, services: [],
      hours: { timezone: "America/New_York", weekly: [{ day: 1, opens: "09:00", closes: "17:00" }] },
      phone: null, settings: { bookableHours: [{ day: 1, opens: "09:00", closes: "20:00" }] },
    };
    const read = await readBookingSurface("scope", { booking: async () => context as never });
    expect(read?.outside).toEqual([{ day: 1, opens: "09:00", closes: "20:00" }]);
    expect(await readBookingSurface("scope", { booking: async () => null })).toBeNull();
  });
});

describe("readYelpBusiness", () => {
  it("returns null with the env unset and makes no calls", async () => {
    const fetchSpy = vi.fn();
    const connection = vi.fn();
    expect(await readYelpBusiness("t1", { connection, fetch: fetchSpy as never })).toBeNull();
    expect(connection).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("reads one business when enabled", async () => {
    vi.stubEnv("STRELVA_LISTINGS_SYNC_YELP", "1");
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ phone: "+17165550100" }) }));
    const read = await readYelpBusiness("t1", { connection: async () => ({ accessToken: "key", apiKey: "biz-1" }), fetch: fetchSpy as never });
    expect(read).toMatchObject({ phone: "+17165550100" });
    expect(fetchSpy).toHaveBeenCalledWith("https://api.yelp.com/v3/businesses/biz-1", expect.objectContaining({ headers: { Authorization: "Bearer key" } }));
  });
});

describe("readListingTargets", () => {
  const deps = (over: Partial<TargetDeps> = {}): TargetDeps => ({
    raw: async () => ({
      tenants: [{ tenantId: "t1", tenantStableId: "7f000000-0000-4000-8000-0000000000a1", deliveryModel: "platform_template" }],
      connectedSites: [
        { id: "7f000000-0000-4000-8000-0000000000b1", siteUrl: "https://www.harbor.example.test/", siteHost: "www.harbor.example.test", platform: "wix", injectSchema: true },
        { id: "7f000000-0000-4000-8000-0000000000b2", siteUrl: "https://other.example.test/", siteHost: "other.example.test", platform: "wix", injectSchema: true },
      ],
      agencies: [],
    }),
    tenant: async id => ({ id }),
    publicUrl: () => "https://harbor.example.test",
    editing: () => "native",
    binding: async scope => (scope === "t1" ? { workspaceId: WS, locations: [{ locationId: "loc1", title: "Harbor" }, { locationId: "loc1", title: "Dup" }] } : { workspaceId: OTHER, locations: [{ locationId: "loc9", title: null }] }),
    booking: async scope => ({ workspaceId: WS, systemId: "s1", calendarKey: "cal1", tenantStableId: null, ...(scope ? {} : {}) }),
    bookingScope: () => "workspace-booking",
    publishingScope: () => "workspace-pub",
    yelp: async () => null,
    yelpEnabled: () => false,
    ...over,
  });
  it("dedupes the same host, keeping the tenant", async () => {
    const targets = await readListingTargets(WS, deps());
    expect(targets.websites.map(site => site.surfaceKey)).toEqual(["website:tenant:t1", "website:connected:7f000000-0000-4000-8000-0000000000b2"]);
    expect(targets.websites[0]).toMatchObject({ editing: "native", label: "harbor.example.test" });
  });
  it("keeps only bindings for this workspace and dedupes locations", async () => {
    const targets = await readListingTargets(WS, deps());
    expect(targets.google).toEqual([{ surfaceKey: "google:loc1", tenantId: "t1", locationId: "loc1", label: "Harbor" }]);
  });
  it("dedupes booking by calendar and sets hasAgency", async () => {
    const targets = await readListingTargets(WS, deps({ raw: async () => ({ tenants: [{ tenantId: "t1", tenantStableId: "7f000000-0000-4000-8000-0000000000a1", deliveryModel: "x" }], connectedSites: [], agencies: [OTHER] }) }));
    expect(targets.booking).toEqual([{ surfaceKey: "booking:workspace-booking", scope: "workspace-booking", label: "Booking page" }]);
    expect(targets.hasAgency).toBe(true);
  });
  it("caps counts and swallows a failed lookup", async () => {
    const sites = Array.from({ length: 8 }, (_v, i) => ({ id: `7f000000-0000-4000-8000-0000000001${i}0`.slice(0, 36), siteUrl: `https://s${i}.example.test/`, siteHost: `s${i}.example.test`, platform: "wix", injectSchema: true }));
    const targets = await readListingTargets(WS, deps({
      raw: async () => ({ tenants: [], connectedSites: sites, agencies: [] }),
      binding: async () => { throw new Error("down"); },
      booking: async () => { throw new Error("down"); },
    }));
    expect(targets.websites).toHaveLength(4);
    expect(targets.google).toEqual([]);
    expect(targets.booking).toEqual([]);
  });
  it("lists Yelp only when enabled and connected", async () => {
    const on = await readListingTargets(WS, deps({ yelpEnabled: () => true, yelp: async () => ({ accessToken: "k", apiKey: "b" }) }));
    expect(on.yelp).toEqual([{ surfaceKey: "yelp:t1", tenantId: "t1" }]);
    expect((await readListingTargets(WS, deps({ yelp: async () => ({ accessToken: "k", apiKey: "b" }) }))).yelp).toEqual([]);
  });
});
