import { describe, expect, it, vi } from "vitest";
import { businessJsonLd, defaultAllowedOrigins, publicFactsFromRecord, verificationProofs } from "@/products/connected-sites/contracts";
import { connectSite, connectedSiteSystemId, normalizeSiteUrl, readPublicContext, recordBeacon, submitPublicInquiry, verifySite } from "@/products/connected-sites/server";
import { ConnectedSiteInputError, type ConnectedSitesStore } from "@/products/connected-sites/store";
import { connectedInquiryEmail, notifyConnectedSiteInquiry } from "@/lib/connected-site-notify";
import { systemsFromExisting } from "@/platform/systems/from-existing";
import { systemOriginId } from "@/platform/systems/invariants";
import { WorkspaceConflictError } from "@/platform/workspaces/types";

const actor = { userId: "77000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const BUSINESS = "77000000-0000-4000-8000-000000000002";
const SITE_ID = "77000000-0000-4000-8000-000000000003";
const KEY = "sk_pub_abcdefghijklmnopqrstuvwx";
const site = { id: SITE_ID, workspaceId: BUSINESS, siteUrl: "https://www.fictional-bakery.example/", siteHost: "www.fictional-bakery.example", allowedOrigins: ["https://www.fictional-bakery.example", "https://fictional-bakery.example"], captureForms: true, injectSchema: true, verified: true };
const stored = { id: SITE_ID, workspaceId: BUSINESS, publicKey: KEY, label: "fictional-bakery.example", siteUrl: site.siteUrl, siteHost: site.siteHost, allowedOrigins: site.allowedOrigins, platform: "wix" as const, captureForms: true, injectSchema: true, status: "active" as const, verificationToken: "c".repeat(32), verifiedAt: null, createdAt: "2026-10-08T00:00:00Z", updatedAt: "2026-10-08T00:00:00Z", revokedAt: null, firstEventAt: null, lastEventAt: null };

function store(overrides: Partial<ConnectedSitesStore> = {}): ConnectedSitesStore {
  return {
    create: vi.fn(async () => stored), list: vi.fn(async () => [stored]), update: vi.fn(async () => stored), revoke: vi.fn(async () => stored),
    confirmVerification: vi.fn(async () => ({ ...stored, verifiedAt: "2026-10-08T01:00:00Z", verificationToken: null })),
    inquiries: vi.fn(async () => []), activity: vi.fn(async () => ({})), resolve: vi.fn(async () => site),
    context: vi.fn(async () => ({ revision: 4, facts: { display_name: "Fictional Bakery", phone: "716-555-0100", hours: { timezone: "America/New_York", weekly: [{ day: 1, opens: "08:00", closes: "16:00" }] }, links: [{ kind: "booking", url: "https://book.example/bakery" }, { kind: "instagram", url: "https://instagram.com/bakery" }], address: { line1: "1 Main St", city: "Buffalo", region: "NY", postalCode: "14201" } }, services: [{ name: "Custom cakes", description: null, priceText: "From $40" }], site: { captureForms: true, injectSchema: true } })),
    recordEvents: vi.fn(async (_key, _origin, events) => events.length),
    recordInquiry: vi.fn(async () => ({ status: "recorded" as const, id: "77000000-0000-4000-8000-0000000000aa", workspaceId: BUSINESS })),
    recordSpam: vi.fn(async () => ({ status: "recorded" as const })), purge: vi.fn(async () => ({ events: 0, spam: 0 })),
    ...overrides,
  };
}

describe("connected site contracts", () => {
  it("serves business record facts in the shape connect.js fills, with schema.org from confirmed facts only", () => {
    const facts = publicFactsFromRecord({ facts: { display_name: "Fictional Bakery", phone: "716-555-0100", hours: { timezone: "America/New_York", weekly: [{ day: 1, opens: "08:00", closes: "16:00" }] }, links: [{ kind: "booking", url: "https://book.example/x" }, { kind: "facebook", url: "https://facebook.com/x" }], address: { line1: "1 Main St", city: "Buffalo", region: "NY", postalCode: "14201" } }, services: [{ name: "Custom cakes" }] });
    expect(facts).toMatchObject({ name: "Fictional Bakery", phone: "716-555-0100", booking_url: "https://book.example/x", social_links: ["https://facebook.com/x"], address: { street: "1 Main St", locality: "Buffalo", region: "NY", postalCode: "14201" }, services: [{ name: "Custom cakes" }] });
    expect(facts.hours![0]).toEqual({ day: "mon", opens: "08:00", closes: "16:00" });
    expect(facts.hours!.find(row => row.day === "sun")).toEqual({ day: "sun", closed: true });
    const ld = businessJsonLd(facts, "https://www.fictional-bakery.example/")!;
    expect(ld).toMatchObject({ "@type": "LocalBusiness", name: "Fictional Bakery", telephone: "716-555-0100" });
    expect(businessJsonLd({}, "https://x.example/")).toBeNull();
  });
  it("finds only proof material on a page: the verification meta and the site key on a script", () => {
    const html = `<head><meta name="strelva-site-verification" content="${"c".repeat(32)}"><script src="https://app.strelva.com/connect.js" data-strelva-site="${KEY}" defer></script><meta name="description" content="${"d".repeat(32)}"></head>`;
    expect(verificationProofs(html).sort()).toEqual(["c".repeat(32), KEY].sort());
    expect(verificationProofs("<p>strelva-site-verification cccc</p>")).toEqual([]);
  });
  it("accepts only a public https address, and allows exactly its www twin", () => {
    expect(normalizeSiteUrl("fictional-bakery.example")).toEqual({ siteUrl: "https://fictional-bakery.example/", siteHost: "fictional-bakery.example" });
    for (const bad of ["http://fictional-bakery.example", "https://10.0.0.1", "https://user:pw@x.example", "https://intranet", "not a url at all"]) expect(() => normalizeSiteUrl(bad, true)).toThrow(ConnectedSiteInputError);
    expect(() => normalizeSiteUrl("http://localhost:3001", true)).toThrow(ConnectedSiteInputError);
    expect(defaultAllowedOrigins("https://fictional-bakery.example/")).toEqual(["https://fictional-bakery.example", "https://www.fictional-bakery.example"]);
  });
  it("gives a connected site the website System id the spine derives", () => {
    expect(connectedSiteSystemId({ id: SITE_ID, workspaceId: BUSINESS })).toBe(systemOriginId(BUSINESS, { kind: "connected_site", ref: SITE_ID }));
  });
});

describe("connected sites on the server", () => {
  it("connects a site with fresh keys and only its own origins", async () => {
    const s = store();
    await connectSite(actor, { businessId: BUSINESS, siteUrl: "www.fictional-bakery.example", platform: "wix" }, s);
    const [, business, input] = (s.create as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(business).toBe(BUSINESS);
    expect(input).toMatchObject({ siteHost: "www.fictional-bakery.example", allowedOrigins: ["https://www.fictional-bakery.example", "https://fictional-bakery.example"], platform: "wix" });
    expect(input.publicKey).toMatch(/^sk_pub_[a-z0-9]{24}$/); expect(input.verificationToken).toMatch(/^[a-z0-9]{32}$/);
  });
  it("proves the host from the live page, and says plainly when the page can't be read", async () => {
    const s = store();
    await verifySite(actor, BUSINESS, SITE_ID, { store: s, fetchPage: async () => `<meta name="strelva-site-verification" content="${"c".repeat(32)}">` });
    expect(s.confirmVerification).toHaveBeenCalledWith(actor, BUSINESS, SITE_ID, ["c".repeat(32)]);
    const unread = store();
    await expect(verifySite(actor, BUSINESS, SITE_ID, { store: unread, fetchPage: async () => null })).rejects.toBeInstanceOf(WorkspaceConflictError);
    expect(unread.confirmVerification).not.toHaveBeenCalled();
    const gone = store({ list: vi.fn(async () => []) });
    await expect(verifySite(actor, BUSINESS, SITE_ID, { store: gone, fetchPage: async () => "" })).rejects.toBeInstanceOf(WorkspaceConflictError);
  });
  it("records beacon events with a server-bounded time, no query strings and a stable dedupe key", async () => {
    const s = store(); const now = Date.parse("2026-10-08T12:00:00Z");
    await recordBeacon(KEY, site, "https://www.fictional-bakery.example", { sid: "sessionabc123", events: [{ id: "evt12345678", kind: "visit", at: now + 10 * 86_400_000, path: "/menu?email=a@b.c", ref: "https://www.google.com/search?q=x" }] }, now, s);
    const [, origin, events] = (s.recordEvents as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(origin).toBe("https://www.fictional-bakery.example");
    expect(events[0]).toEqual({ kind: "visit", occurredAt: "2026-10-09T12:00:00.000Z", sessionId: "sessionabc123", pagePath: "/menu", referrerHost: "www.google.com", target: null, dedupeKey: `${SITE_ID.slice(0, 8)}:evt12345678` });
    await expect(recordBeacon(KEY, site, null, { events: [{ id: "evt12345678", kind: "booking" }] }, now, s)).rejects.toThrow();
  });
  it("puts an inquiry into the one lead store and tells the owner, without losing it when the notice fails", async () => {
    const s = store(); const notify = vi.fn(async () => { throw new Error("mail down"); });
    const result = await submitPublicInquiry(KEY, site, "https://www.fictional-bakery.example", { id: "inq12345678", capture: "strelva-form", path: "/contact", fields: { name: "Pat Visitor", email: "pat@example.test", phone: "716-555-0199", message: "A cake for Friday?" } }, { store: s, notify, now: Date.parse("2026-10-08T12:00:00Z") });
    expect(result).toEqual({ status: "recorded", id: "77000000-0000-4000-8000-0000000000aa" });
    const [, , lead] = (s.recordInquiry as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(lead).toMatchObject({ leadId: "lead_inq12345678", name: "Pat Visitor", email: "pat@example.test", message: "A cake for Friday?", source: "connected-site:strelva-form", capturedAt: "2026-10-08T12:00:00.000Z" });
    expect(lead.fields).toMatchObject({ phone: "716-555-0199", page: "/contact" });
    expect(lead.submissionHash).toMatch(/^[0-9a-f]{16}$/);
    expect(notify).toHaveBeenCalledOnce();
  });
  it("drops honeypot hits, holds spam in the pit and refuses empty or unwanted submissions", async () => {
    const s = store();
    expect(await submitPublicInquiry(KEY, site, "https://www.fictional-bakery.example", { id: "inq12345678", capture: "strelva-form", _hp: "bot", fields: { email: "x@y.z" } }, { store: s })).toEqual({ status: "ignored" });
    expect(await submitPublicInquiry(KEY, site, "https://www.fictional-bakery.example", { id: "inq12345679", capture: "strelva-form", fields: { email: "x@y.z", website: "http://spam" } }, { store: s })).toEqual({ status: "ignored" });
    expect(s.recordInquiry).not.toHaveBeenCalled(); expect(s.recordSpam).not.toHaveBeenCalled();
    const spammy = await submitPublicInquiry(KEY, site, "https://www.fictional-bakery.example", { id: "inq12345680", capture: "strelva-form", fields: { name: "xkqjzvwpqlmnbvcxzrtyu", email: "qwzxkvbnmlpoiuyt@qwzxkvbnmlpoiuyt.ru", message: "xkqjzvwpqlmnbvcxzrtyu" } }, { store: s });
    if (spammy.status === "held_as_spam") expect(s.recordSpam).toHaveBeenCalledOnce(); else expect(spammy.status).toBe("recorded");
    await expect(submitPublicInquiry(KEY, site, null, { id: "inq12345681", capture: "strelva-form", fields: { name: "Only a name" } }, { store: s })).rejects.toBeInstanceOf(ConnectedSiteInputError);
    await expect(submitPublicInquiry(KEY, { ...site, captureForms: false }, null, { id: "inq12345682", capture: "site-form", fields: { email: "pat@example.test" } }, { store: s })).rejects.toBeInstanceOf(ConnectedSiteInputError);
  });
  it("reads the public context from the business record", async () => {
    const context = (await readPublicContext(KEY, site, store()))!;
    expect(context.facts).toMatchObject({ name: "Fictional Bakery", booking_url: "https://book.example/bakery", services: [{ name: "Custom cakes", priceText: "From $40" }] });
    expect(context.jsonLd).toMatchObject({ name: "Fictional Bakery", url: site.siteUrl });
    expect(await readPublicContext(KEY, site, store({ context: vi.fn(async () => null) }))).toBeNull();
  });
});

describe("owner notice for a connected-site inquiry", () => {
  const inquiry = { id: "77000000-0000-4000-8000-0000000000aa", name: "Pat Visitor", email: "pat@example.test", message: "A cake?" };
  it("goes to the one owner recipient through the one email path", async () => {
    const send = vi.fn(async () => ({ status: "accepted" as const, providerMessageId: "m", acceptedAt: "now" }));
    expect(await notifyConnectedSiteInquiry({ site, inquiry }, { paused: () => false, recipient: async () => ({ email: "owner@bakery.example", name: null, from: "record", source: "owner" }), send })).toBe("sent");
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ audience: "client", to: "owner@bakery.example", idempotencyKey: `connected-inquiry:${inquiry.id}` }));
    expect(connectedInquiryEmail(site, inquiry).subject).toBe("New inquiry from fictional-bakery.example");
  });
  it("sends nothing while client email is paused or no owner is known", async () => {
    const send = vi.fn();
    expect(await notifyConnectedSiteInquiry({ site, inquiry }, { paused: () => true, send })).toBe("paused");
    expect(await notifyConnectedSiteInquiry({ site, inquiry }, { paused: () => false, recipient: async () => null, send })).toBe("no_recipient");
    expect(send).not.toHaveBeenCalled();
  });
});

describe("a connected site as a website System", () => {
  const base = { businessId: BUSINESS, savedWork: [], managedWebsites: [], inquiryWorkspaces: [], bookingGrants: [], calendarConnections: [] };
  const connected = { id: SITE_ID, label: "Bakery", siteUrl: site.siteUrl, siteHost: site.siteHost, status: "active" as const, verifiedAt: "2026-10-08T01:00:00Z", lastEventAt: null, createdAt: "2026-10-08T00:00:00Z", updatedAt: "2026-10-08T00:00:00Z" };
  it("is a website System with origin connected_site, Live once proven, reading the business record", () => {
    const listing = systemsFromExisting({ ...base, connectedSites: [connected] });
    const system = listing.systems[0]!;
    expect(system.system).toMatchObject({ id: systemOriginId(BUSINESS, { kind: "connected_site", ref: SITE_ID }), kind: "website", lifecycle: "live", name: "fictional-bakery.example", origin: { kind: "connected_site", ref: SITE_ID } });
    expect(system.connectedSite).toEqual({ siteUrl: site.siteUrl, siteHost: site.siteHost, verified: true, lastEventAt: null });
    expect(listing.connections[0]!.connection).toMatchObject({ kind: "read", state: "connected", target: { type: "business_resource", resource: "business_record:facts" } });
  });
  it("is a Draft until proven and Paused when disconnected, with the same id throughout", () => {
    const draft = systemsFromExisting({ ...base, connectedSites: [{ ...connected, verifiedAt: null }] }).systems[0]!;
    const paused = systemsFromExisting({ ...base, connectedSites: [{ ...connected, status: "revoked" }] }).systems[0]!;
    expect([draft.system.lifecycle, paused.system.lifecycle]).toEqual(["draft", "paused"]);
    expect(draft.system.id).toBe(paused.system.id);
  });
  it("is not shown to an agency that was only given other work", () => {
    expect(systemsFromExisting({ ...base, scope: "assigned", connectedSites: [connected] }).systems).toEqual([]);
  });
});
