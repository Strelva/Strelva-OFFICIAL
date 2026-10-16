/**
 * The legacy dashboard preview's fixture API. Pure data: no tenant, storage,
 * provider or email is imported. Writes succeed without changing anything,
 * except in the error state, where they refuse with a plain sentence.
 */
import { LEGACY_BUSINESS, LEGACY_TENANT, ago, legacyState, type LegacyState } from "./legacy-dashboard-fixtures";

export { legacyState };

type Result = { status: number; body: unknown };
const ok = (body: unknown): Result => ({ status: 200, body });

export async function legacyApiFixture(method: string, path: string, query: URLSearchParams, state: LegacyState, request: Request): Promise<Result> {
  if (method !== "GET") {
    if (state === "error") return { status: 409, body: { error: "This didn't go through, so nothing changed. Try again in a minute." } };
    if (path.startsWith("queue/")) return ok({ success: true });
    void request;
    return ok({ success: true, fixture: true });
  }
  switch (true) {
    case path === "workspace/owner-brand": return ok({ brand: null });
    case path === "my-properties": return ok({ properties: [{ id: LEGACY_TENANT, name: LEGACY_BUSINESS, href: "#" }] });
    case path === "content/settings": return ok({ siteName: LEGACY_BUSINESS, businessModel: state === "empty" ? "" : "local", brandVoice: "Warm and calm", ownerName: "Dr. Amy Lin", siteTagline: "Gentle family dentistry on Elmwood Ave", siteDescription: "Cleanings, fillings, crowns and children's visits in Buffalo.", bookingUrl: "/book", footerTagline: "Gentle family dentistry on Elmwood.", copyrightText: "Harbor Dental", phone: "(716) 555-0142", email: "hello@harbordental.com", address: "1180 Elmwood Ave, Buffalo, NY 14222" });
    case path === "dashboard/onboarding-status": return ok(state === "empty"
      ? { complete: false, steps: [
        { key: "business_type", label: "Say how patients find you", done: true, href: "#" },
        { key: "connect_google", label: "Connect your Google listing", done: false, href: "#" },
        { key: "first_edit", label: "Ask Strelva for one small change", done: false, href: "#" },
        { key: "first_report", label: "Read your first weekly report", done: false, href: "#" },
      ] }
      : { complete: true, steps: [] });
    case path === "threads": return ok(state === "empty" ? [] : [
      { id: "t-hours", title: "Thanksgiving hours", preview: "Close Thursday and Friday the week of the 23rd.", updatedAt: ago(3) },
      { id: "t-insurance", title: "Insurance list", preview: "Add Delta Dental to the insurance we accept.", updatedAt: ago(60) },
    ]);
    case path.startsWith("threads/"): return ok({ id: path.slice(8), messages: [
      { id: "m1", role: "user", content: "Close online booking Thursday and Friday for Thanksgiving.", timestamp: ago(3) },
      { id: "m2", role: "assistant", content: "Done as a draft: your homepage says you're closed Thursday and Friday, Nov 26 and 27. It waits in Needs you for your yes.", timestamp: ago(2.9) },
    ] });
    case path === "media": return state === "error" ? { status: 503, body: { error: "Photos could not be read." } } : ok({ assets: state === "empty" ? [] : [
      { id: "m1", url: "/xa/photo-dentist.webp", filename: "Dr. Lin at work.webp", width: 1200, height: 1680, size: 182_000, createdAt: ago(30) },
      { id: "m2", url: "/images/outcomes/storefront.webp", filename: "Our front windows on Elmwood.webp", width: 1600, height: 1100, size: 240_000, createdAt: ago(80) },
    ] });
    case path === "collections/product": return ok({ entries: state === "empty" ? [] : [
      { slug: "whitening-kit", status: "published", data: { name: "Whitening kit", priceCents: 4900 }, updated_at: ago(70) },
      { slug: "kids-brushing-set", status: "published", data: { name: "Kids' brushing set", priceCents: 1800 }, updated_at: ago(120) },
      { slug: "night-guard", status: "draft", data: { name: "Night guard fitting", priceCents: 12500, inStock: false }, updated_at: ago(8) },
    ] });
    case path.startsWith("collections/"): return ok({ entries: state === "empty" ? [] : [
      { slug: "first-visit", status: "published", data: { title: "What happens at a child's first visit" }, updated_at: ago(40) },
      { slug: "insurance", status: "draft", data: { title: "Which insurance we take" }, updated_at: ago(4) },
    ] });
    case path === "tenant-settings": return ok({ connections: { googleBusiness: { placeId: "ChIJ-harbor" } }, capabilities: {}, domains: { primary: "harbordental.com" } });
    case path === "connections": return state === "error" ? { status: 503, body: { error: "unavailable" } } : ok({ connections: state === "empty" ? [] : [
      { provider: "google", status: "connected", lastSyncedAt: ago(2), platformReady: true },
      { provider: "calendly", status: "needs_reauth", lastSyncedAt: ago(90), platformReady: true },
    ] });
    case path === "connections/google/resources": return ok({
      connection: { connected: true, status: "connected", scopes: [] },
      gsc: { status: "ready", selected: "sc-domain:harbordental.com", resources: [{ id: "sc-domain:harbordental.com", label: "harbordental.com" }] },
      // ?state=waiting shows the one case worth a sentence: two sites and none picked.
      ga4: state === "waiting"
        ? { status: "ready", selected: null, resources: [{ id: "properties/1", label: "harbordental.com" }, { id: "properties/2", label: "Harbor Dental old site" }] }
        : { status: "ready", selected: "properties/1", resources: [{ id: "properties/1", label: "harbordental.com" }] },
      gbp: { status: "ready", selected: { accountId: "a1", locationId: "l1" }, resources: [{ id: "a1|l1", label: "Harbor Dental", detail: "1180 Elmwood Ave" }] },
    });
    case path === "dashboard/content-autonomy": return ok({ mode: "approve" });
    case path === "content/theme": return ok({ fontDisplay: "DM_Sans", fontBody: "DM_Sans", colors: { cream: "#ffffff", sage: "#1f4e5f", bark: "#16202a", terra: "#c9773f", wheat: "#edf1ea" } });
    case path === "content/navigation": return ok({ menuItems: [{ label: "Services", href: "/services" }, { label: "Insurance", href: "/insurance" }, { label: "About", href: "/about" }], ctaLabel: "Book a visit", ctaHref: "/book" });
    case path === "content/footer": return ok({ tagline: "Gentle family dentistry on Elmwood.", columns: [{ heading: "Visit", links: [{ label: "1180 Elmwood Ave, Buffalo", href: "/contact" }] }], socialLinks: [], copyrightText: "Harbor Dental" });
    case path === "custom-repo/dependencies": return ok({ deliveryModel: "managed", dependencies: [], hasBlockingDependency: false });
    case path === "publish": return ok({ contentDrafts: state === "waiting" ? { hero: true } : {}, pageConfigDraft: false });
    case path === "site-snapshots": return ok({ snapshots: [] });
    // October 16: the last legacy reads the preview answered with a 404, so those pages never settled.
    case path === "dashboard/site-audit": return state === "empty" ? { status: 404, body: { error: "No site check yet." } } : ok({
      url: "https://harbordental.com", scannedAt: ago(26), overallScore: 86, grade: "B",
      categories: [
        { slug: "speed", name: "Loads on a phone", score: 92, weight: 0.3 },
        { slug: "local", name: "Found on Google", score: 81, weight: 0.4 },
        { slug: "trust", name: "Answers patients' questions", score: 84, weight: 0.3 },
      ],
      topFixes: [{ name: "Holiday hours", message: "Add Thanksgiving hours so Google and the site agree.", category: "local", impact: "high", quantified: null }],
    });
    case path === "dashboard/site-audit/history": return ok({ history: state === "empty" ? [] : [{ at: ago(24 * 14), score: 82 }, { at: ago(24 * 7), score: 84 }, { at: ago(26), score: 86 }] });
    case path === "admin/domains": return ok({ domains: state === "empty" ? [] : [{ domain: "harbordental.com", status: "active", dnsStatus: "verified", sslStatus: "active", primary: true }] });
    case path === "offboarding/status": return ok({ tenant: LEGACY_TENANT, requestedAt: null, checkpoints: [], connectedProviders: state === "empty" ? [] : ["google"], domains: state === "empty" ? [] : [{ domain: "harbordental.com", status: "active", dnsStatus: "verified", sslStatus: "active" }] });
    default: return { status: 404, body: { error: "This preview has no data for that." } };
  }
}
