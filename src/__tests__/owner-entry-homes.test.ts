import { afterEach, describe, expect, it, vi } from "vitest";
import { workspaceReturnTarget } from "@/lib/workspace-location";
import { setReleaseFlagsDb } from "@/platform/release-flags/store";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { linkedSiteDefaults, ownerEntryHomesOpen, readLinkedSite, readLinkedSites, type LinkedSiteDependencies } from "@/platform/owner-entry/linked-sites";
import { readWorkspaceLeads, leadView, type LeadDependencies } from "@/products/inquiries/linked-leads";
import { draftsByReview, readWorkspaceReviews, type ReviewDependencies } from "@/products/google-listing/linked-reviews";
import { readWorkspaceResults, type ResultDependencies } from "@/products/websites/linked-results";
import { readSiteSummaries, type SiteSummaryDependencies } from "@/platform/owner-entry/site-summary";
import { resolveRange, type PeriodStats } from "@/lib/analytics/period";
import { DASHBOARD_DISPOSITIONS, SETTINGS_ANCHORS, effectiveDisposition, pagesBlockingOwnerEntry } from "@/platform/owner-entry/dispositions";
import { routeDashboardRequest, type OwnerEntryDecision } from "@/platform/owner-entry/decision";
import { readPlace } from "@/platform/owner-entry/place-state";
import type { BusinessRecord } from "@/platform/business-record/contracts";
import { businessDetailsPatch, detailsWriteSource, detailText } from "@/platform/business-record/details";
import { saveBusinessDetails, type DetailsSaveDependencies } from "@/platform/business-record/details-save";
import { BusinessRecordConflictError } from "@/platform/business-record/repository";

const WS = "7f000000-0000-4000-8000-000000000010";
const STABLE = "7f000000-0000-4000-8000-0000000000b2";
const OTHER_STABLE = "7f000000-0000-4000-8000-0000000000b3";
const ACTOR = { userId: "7f000000-0000-4000-8000-000000000002", verifiedEmail: "owner@example.test" };

afterEach(() => {
  setReleaseFlagsDb(null);
  vi.restoreAllMocks();
});

const site = { tenantId: "lakeshore", tenantStableId: STABLE, siteName: "Lakeshore Dried Goods" };
const sitesOk = async () => ({ sites: [site], denied: [] });

describe("reading a business's sites through the tenant link", () => {
  const deps = (patch: Partial<LinkedSiteDependencies> = {}): LinkedSiteDependencies => ({
    links: async () => [{ tenantId: "lakeshore", tenantStableId: STABLE }, { tenantId: "harbor", tenantStableId: OTHER_STABLE }],
    canView: async (tenantId) => tenantId === "lakeshore",
    siteName: async (tenantId) => (tenantId === "lakeshore" ? "Lakeshore Dried Goods" : "Harbor Cafe"),
    ...patch,
  });

  it("calls the link read as the signed-in member, with a lowercased verified email", async () => {
    const rpc = vi.fn(async () => ({ data: [{ tenantId: "lakeshore", tenantStableId: STABLE, linkedAt: "2026-10-01T00:00:00Z" }], error: null }));
    setReleaseFlagsDb({ rpc });
    const result = await readLinkedSites({ ...ACTOR, verifiedEmail: "Owner@Example.test" }, WS, { ...deps(), links: linkedSiteDefaults.links });
    expect(rpc).toHaveBeenCalledWith("read_workspace_tenant_links", { p_workspace_id: WS, p_user_id: ACTOR.userId, p_verified_email: "owner@example.test" });
    expect(result.sites.map((item) => item.tenantId)).toEqual(["lakeshore"]);
  });

  it("refuses anyone who isn't a member of the business", async () => {
    setReleaseFlagsDb({ rpc: async () => ({ data: null, error: { message: "workspace_access_denied" } }) });
    await expect(readLinkedSites(ACTOR, WS, { ...deps(), links: linkedSiteDefaults.links })).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("names a linked site the person has no tenant access to, and reads nothing from it", async () => {
    const canView = vi.fn(async (tenantId: string) => tenantId === "lakeshore");
    const result = await readLinkedSites(ACTOR, WS, deps({ canView }));
    expect(result.sites.map((item) => item.tenantId)).toEqual(["lakeshore"]);
    expect(result.denied.map((item) => item.siteName)).toEqual(["Harbor Cafe"]);
  });

  it("treats a failed tenant check as a denial and never reads the demo tenant", async () => {
    const result = await readLinkedSites(ACTOR, WS, deps({
      links: async () => [{ tenantId: "demo", tenantStableId: STABLE }, { tenantId: "lakeshore", tenantStableId: STABLE }],
      canView: async () => { throw new Error("db down"); },
    }));
    expect(result.sites).toEqual([]);
    expect(result.denied.map((item) => item.tenantId)).toEqual(["lakeshore"]);
  });

  it("finds one allowed site for a write, and nothing for another business's tenant", async () => {
    expect(await readLinkedSite(ACTOR, WS, "lakeshore", deps())).toMatchObject({ tenantId: "lakeshore" });
    expect(await readLinkedSite(ACTOR, WS, "harbor", deps())).toBeNull();
    expect(await readLinkedSite(ACTOR, WS, "someone-else", deps())).toBeNull();
  });

  it("opens the homes only where owner entry is on for this business and viewer", async () => {
    const flag = vi.fn(async () => true);
    expect(await ownerEntryHomesOpen(WS, ACTOR.userId, { operator: async () => true, flag })).toBe(true);
    expect(flag).toHaveBeenCalledWith("owner_entry", WS, { operator: true, tester: false, userId: ACTOR.userId });
    expect(await ownerEntryHomesOpen(WS, ACTOR.userId, { operator: async () => false, flag: async () => false })).toBe(false);
    expect(await ownerEntryHomesOpen(WS, ACTOR.userId, { operator: async () => { throw new Error("x"); }, flag: async () => { throw new Error("y"); } })).toBe(false);
  });
});

describe("Inquiries reads the same lead store as /dashboard/leads", () => {
  const deps = (patch: Partial<LeadDependencies> = {}): LeadDependencies => ({
    sites: sitesOk,
    storeReady: () => true,
    now: () => Date.parse("2026-10-05T00:00:00Z"),
    leads: async () => [
      { id: "l1", name: "Dana", email: "dana@example.test", message: "Do you ship?", source: "contact-form", createdAt: "2026-10-01T10:00:00Z" },
      { id: "l2", name: " ", createdAt: "2026-10-03T10:00:00Z", fields: { phone: "716-555-0100", name: "x", empty: " " } },
    ],
    ...patch,
  });

  it("lists every lead, newest first", async () => {
    const result = await readWorkspaceLeads(ACTOR, WS, deps());
    expect(result.sites[0]!.leads.map((lead) => lead.id)).toEqual(["l2", "l1"]);
    expect(result.sites[0]!.lastThirtyDays).toBe(2);
    expect(result.sites[0]!.leads[0]).toMatchObject({ name: "Someone", email: null, fields: [["phone", "716-555-0100"]] });
  });

  it("says unavailable, never empty, when the store isn't configured or fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await readWorkspaceLeads(ACTOR, WS, deps({ storeReady: () => false }))).sites[0]).toMatchObject({ unavailable: true, leads: [] });
    expect((await readWorkspaceLeads(ACTOR, WS, deps({ leads: async () => { throw new Error("redis"); } }))).sites[0]).toMatchObject({ unavailable: true });
  });

  it("passes membership refusal through and keeps denied sites named", async () => {
    await expect(readWorkspaceLeads(ACTOR, WS, deps({ sites: async () => { throw new WorkspaceAccessError(); } }))).rejects.toBeInstanceOf(WorkspaceAccessError);
    const result = await readWorkspaceLeads(ACTOR, WS, deps({ sites: async () => ({ sites: [], denied: [site] }) }));
    expect(result).toEqual({ sites: [], denied: [site] });
  });

  it("trims a lead for display", () => {
    expect(leadView({ id: "x", name: "  Ann ", message: "  hi ", createdAt: "2026-10-01" })).toMatchObject({ name: "Ann", message: "hi", source: null });
  });
});

describe("Reviews reads the same stores as /dashboard/reviews", () => {
  const deps = (patch: Partial<ReviewDependencies> = {}): ReviewDependencies => ({
    sites: sitesOk,
    reviews: async () => [
      { id: "r1", source: "google", author: "Jane", rating: 5, text: "Great", date: "2026-09-01", externalId: "gbp_1" },
      { id: "r2", source: "google", author: "Sam", rating: 2, text: "Slow", date: "2026-09-05", externalId: "gbp_2", reply: "Sorry, Sam.", repliedAt: "2026-09-06" },
    ],
    googleConnected: async () => true,
    placeId: async () => "PLACE",
    replyMode: async () => "auto",
    pendingDrafts: async () => [
      { metadata: { kind: "review_reply_draft", reviewId: "gbp_1", draftedReply: "Thanks, Jane!", autoPostAt: "2026-09-02T12:00:00Z" } },
      { metadata: { kind: "review_reply_draft", reviewId: "gbp_2", draftedReply: "ignored, already replied" } },
      { metadata: { kind: "something_else", reviewId: "gbp_1" } },
    ],
    ...patch,
  });

  it("joins Strelva's waiting draft to its review and leaves replied reviews alone", async () => {
    const result = await readWorkspaceReviews(ACTOR, WS, deps());
    const [newest, older] = result.sites[0]!.reviews;
    expect(newest).toMatchObject({ id: "r2", reply: "Sorry, Sam.", draft: null });
    expect(older).toMatchObject({ id: "r1", draft: { reply: "Thanks, Jane!", autoPostAt: "2026-09-02T12:00:00Z" } });
    expect(result.sites[0]).toMatchObject({ googleConnected: true, googlePlaceId: "PLACE", replyMode: "auto", unavailable: false });
  });

  it("keeps the first draft for a review", () => {
    const drafts = draftsByReview([{ metadata: { kind: "review_reply_draft", reviewId: "a", draftedReply: "one" } }, { metadata: { kind: "review_reply_draft", reviewId: "a", draftedReply: "two" } }]);
    expect(drafts.get("a")?.reply).toBe("one");
  });

  it("says unavailable when the review store fails, and degrades the side reads", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await readWorkspaceReviews(ACTOR, WS, deps({
      reviews: async () => { throw new Error("pg"); },
      googleConnected: async () => { throw new Error("redis"); },
      pendingDrafts: async () => { throw new Error("redis"); },
    }));
    expect(result.sites[0]).toMatchObject({ unavailable: true, reviews: [], googleConnected: false });
  });
});

describe("Results reads what /dashboard/analytics reads", () => {
  const stats = (): PeriodStats => ({
    range: resolveRange("live"), pageViews: 40, pageViewsPrior: 20, pageViewsDelta: 100, actions: 3, actionsPrior: 1, actionsDelta: 200,
    bookingClicks: 2, bookingClicksPrior: 1, phoneClicks: 1, phoneClicksPrior: 0, series: [], hasData: true,
  });
  const deps = (patch: Partial<ResultDependencies> = {}): ResultDependencies => ({
    sites: sitesOk,
    stats: async () => stats(),
    daily: async () => [],
    snapshots: async () => [],
    search: async () => null as never,
    ga: async () => null as never,
    milestone: async () => null as never,
    scans: async () => ({ lakeshore: { url: "https://x", scannedAt: "2026-10-01", overallScore: 91, grade: "A", categories: [] } }),
    ...patch,
  });

  it("reads the chosen window and the latest site check per site", async () => {
    const stat = vi.fn(async () => stats());
    const range = resolveRange("week");
    const result = await readWorkspaceResults(ACTOR, WS, range, deps({ stats: stat }));
    expect(stat).toHaveBeenCalledWith("lakeshore", range);
    expect(result.sites[0]).toMatchObject({ tenantStableId: STABLE, health: { grade: "A" }, stats: { pageViews: 40 } });
  });

  it("never turns a failed traffic read into zero visits", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await readWorkspaceResults(ACTOR, WS, resolveRange("live"), deps({ stats: async () => { throw new Error("pg"); }, scans: async () => { throw new Error("redis"); } }));
    expect(result.sites[0]).toMatchObject({ stats: null, health: null });
  });
});

describe("Home's From your site", () => {
  const deps = (patch: Partial<SiteSummaryDependencies> = {}): SiteSummaryDependencies => ({
    sites: async () => ({ sites: [site], denied: [{ ...site, tenantId: "harbor", siteName: "Harbor Cafe" }] }),
    clicks: async (event) => (event === "page-view" ? { total: 120, thisWeek: 12 } : event === "booking-click" ? { total: 5, thisWeek: 1 } : { total: 3, thisWeek: 2 }),
    leads: async () => ({ count: 2, recent: [{ id: "l1", name: "Dana", message: "Do you ship?", createdAt: "2026-10-01" }] }),
    activity: async () => [
      { text: "Updated hours", time: "2026-10-02T00:00:00Z", type: "gbp-hours", actor: "ai" },
      { text: "Owner edit", time: "2026-10-02T00:00:00Z", type: "content", actor: "user" },
    ],
    ...patch,
  });

  it("counts calls as customer actions and keeps only Strelva's work", async () => {
    const result = await readSiteSummaries(ACTOR, WS, deps());
    expect(result.deniedSites).toEqual(["Harbor Cafe"]);
    expect(result.sites[0]).toMatchObject({
      visits: { total: 120, thisWeek: 12 }, actions: { total: 8, thisWeek: 3 },
      leads: { count: 2, recent: [{ name: "Dana" }] },
      activity: [{ label: "Updated your hours on Google" }],
    });
  });

  it("marks each failed read as unknown, never zero", async () => {
    const result = await readSiteSummaries(ACTOR, WS, deps({
      clicks: async (event) => { if (event === "phone-click") throw new Error("x"); return { total: 1, thisWeek: 1 }; },
      leads: async () => { throw new Error("redis"); },
      activity: async () => { throw new Error("pg"); },
    }));
    expect(result.sites[0]).toMatchObject({ visits: { total: 1 }, actions: null, leads: null, activity: null });
  });
});

describe("the pages that moved (owner-entry spec §5)", () => {
  const moved: OwnerEntryDecision = { kind: "workspace", workspaceId: WS, tenantStableId: STABLE, operator: false, tester: false };
  const route = (path: string, on: string[] = []) => routeDashboardRequest({ decision: moved, pathWithSearch: path, flagOn: (flag) => on.includes(flag) });

  it("marks today, review, leads, reviews, analytics and settings ready, each saying what it doesn't do yet", () => {
    for (const path of ["/", "/review", "/leads", "/reviews", "/analytics", "/settings"]) {
      const entry = DASHBOARD_DISPOSITIONS.find((item) => item.route === path)!;
      expect(entry.state, path).toBe("ready");
      expect(entry.parityGaps?.length, path).toBeGreaterThan(0);
    }
  });

  it("sends each to its workspace home with a 307-safe target", () => {
    expect(route("/dashboard/leads")).toEqual({ kind: "redirect", location: `/workspace/inquiries?workspaceId=${WS}`, route: "/leads" });
    expect(route("/dashboard/reviews")).toMatchObject({ kind: "redirect", location: `/workspace/reviews?workspaceId=${WS}` });
    expect(route("/dashboard/analytics")).toMatchObject({ kind: "redirect", location: `/workspace/results?workspaceId=${WS}` });
    expect(route("/dashboard/settings")).toMatchObject({ kind: "redirect", location: `/workspace/business-details?workspaceId=${WS}` });
    expect(route("/dashboard/ownership")).toMatchObject({ kind: "redirect", location: `/workspace/business-details?workspaceId=${WS}` });
  });

  it("keeps meaning carried in the query", () => {
    expect(route("/dashboard/analytics?range=month")).toMatchObject({ location: `/workspace/results?workspaceId=${WS}&range=month` });
    expect(route("/dashboard/analytics?range=custom&from=2026-09-01&to=2026-09-30")).toMatchObject({ location: `/workspace/results?workspaceId=${WS}&range=custom&from=2026-09-01&to=2026-09-30` });
    expect(route("/dashboard/analytics?range=bogus")).toMatchObject({ location: `/workspace/results?workspaceId=${WS}` });
    expect(route("/dashboard/health")).toMatchObject({ location: `/workspace/results?workspaceId=${WS}` });
    expect(route("/dashboard/settings?checkout=success")).toMatchObject({ location: `/workspace?view=settings&workspaceId=${WS}` });
    expect(route("/dashboard?checkout=success", ["needs_you"])).toMatchObject({ location: `/workspace?view=settings&workspaceId=${WS}` });
  });

  it("moves Today and the approval queue only while Needs you is on", () => {
    expect(route("/dashboard")).toMatchObject({ kind: "render-with-back", route: "/" });
    expect(route("/dashboard/review")).toMatchObject({ kind: "render-with-back", route: "/review" });
    expect(route("/dashboard", ["needs_you"])).toEqual({ kind: "redirect", location: `/workspace?workspaceId=${WS}`, route: "/" });
    expect(route("/dashboard/review", ["needs_you"])).toMatchObject({ kind: "redirect", location: `/workspace?workspaceId=${WS}` });
  });

  it("lets an operator keep the old page, and keeps everyone else on /dashboard when not moved", () => {
    expect(routeDashboardRequest({ decision: { ...moved, operator: true }, pathWithSearch: "/dashboard/leads?legacy=1" }).kind).toBe("render-with-back");
    expect(routeDashboardRequest({ decision: { kind: "dashboard", reason: "entry_off" }, pathWithSearch: "/dashboard/leads" })).toEqual({ kind: "render" });
  });

  it("no longer blocks owner entry for these pages; the site editor still does", () => {
    const blocking = pagesBlockingOwnerEntry(new Set(["always", "local"])).map((entry) => entry.route);
    for (const path of ["/", "/review", "/leads", "/reviews", "/analytics", "/settings", "/health", "/ownership"]) expect(blocking, path).not.toContain(path);
    expect(blocking).toContain("/site");
    expect(effectiveDisposition("/health").route).toBe("/analytics");
  });

  it("maps every old settings anchor somewhere that survives sign-in", () => {
    const context = { workspaceId: WS, tenantStableId: STABLE, search: new URLSearchParams() };
    for (const [anchor, target] of Object.entries(SETTINGS_ANCHORS)) expect(workspaceReturnTarget(target(context)), anchor).toBe(target(context));
  });
});

describe("workspaceReturnTarget accepts the new places", () => {
  it("accepts each place with its business", () => {
    for (const place of ["inquiries", "reviews", "results", "business-details"]) {
      expect(workspaceReturnTarget(`/workspace/${place}?workspaceId=${WS}`)).toBe(`/workspace/${place}?workspaceId=${WS}`);
    }
    expect(workspaceReturnTarget(`/workspace/results?workspaceId=${WS}&range=week`)).toBe(`/workspace/results?workspaceId=${WS}&range=week`);
  });

  it("refuses anything else", () => {
    expect(workspaceReturnTarget("/workspace/inquiries?workspaceId=nope")).toBeNull();
    expect(workspaceReturnTarget(`/workspace/inquiries?workspaceId=${WS}&range=week`)).toBeNull();
    expect(workspaceReturnTarget(`/workspace/inquiries?workspaceId=${WS}&workspaceId=${WS}`)).toBeNull();
    expect(workspaceReturnTarget(`/workspace/results?workspaceId=${WS}&range=forever`)).toBeNull();
    expect(workspaceReturnTarget(`/workspace/results?workspaceId=${WS}&from=2026-01-01`)).toBeNull();
    expect(workspaceReturnTarget(`/workspace/results?workspaceId=${WS}&range=custom&from=yesterday`)).toBeNull();
    expect(workspaceReturnTarget(`/workspace/reviews?workspaceId=${WS}#x`)).toBeNull();
    expect(workspaceReturnTarget(`/workspace/secrets?workspaceId=${WS}`)).toBeNull();
  });
});

describe("a place's read", () => {
  it("is permission for a refused membership and error, logged, for anything else", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await readPlace("x", WS, async () => 1)).toEqual({ kind: "ready", data: 1 });
    expect(await readPlace("x", WS, async () => { throw new WorkspaceAccessError(); })).toEqual({ kind: "permission" });
    expect(await readPlace("x", WS, async () => { throw new Error("db"); })).toEqual({ kind: "error" });
    expect(error).toHaveBeenCalledTimes(1);
  });
});

describe("Business details", () => {
  const record = (patch: Partial<BusinessRecord> = {}): BusinessRecord => ({
    workspaceId: WS, access: "owner", revision: 4, lastSequence: 4, updatedAt: null,
    facts: {
      display_name: { value: "Lakeshore", source: "tenant_import", verified: false, updatedAt: "2026-10-01T00:00:00Z", updatedBy: ACTOR.userId },
      owner_recipient: { value: { email: "ruth@example.test", name: "Ruth" }, source: "tenant_import", verified: false, updatedAt: "2026-10-01T00:00:00Z", updatedBy: ACTOR.userId },
    },
    services: [], people: [], contactCount: 0, ...patch,
  });

  it("writes only changed facts and keeps the recipient's name", () => {
    expect(businessDetailsPatch(record(), { display_name: "Lakeshore", phone: "", owner_recipient: "ruth@example.test" })).toEqual({ kind: "unchanged" });
    expect(businessDetailsPatch(record(), { display_name: "Lakeshore Dried Goods", owner_recipient: "Owner@Example.test" })).toEqual({
      kind: "patch", facts: { display_name: { value: "Lakeshore Dried Goods" }, owner_recipient: { value: { email: "owner@example.test", name: "Ruth" } } },
    });
    expect(businessDetailsPatch(record(), { display_name: "" })).toEqual({ kind: "patch", facts: { display_name: null } });
  });

  it("refuses a bad phone, a bad email, and clearing who gets Strelva's emails", () => {
    expect(businessDetailsPatch(record(), { phone: "12" })).toMatchObject({ kind: "invalid", field: "phone" });
    expect(businessDetailsPatch(record(), { email: "not-an-email" })).toMatchObject({ kind: "invalid", field: "email" });
    expect(businessDetailsPatch(record(), { owner_recipient: "" })).toMatchObject({ kind: "invalid", field: "owner_recipient" });
    expect(detailText(record(), "owner_recipient")).toBe("ruth@example.test");
  });

  it("lets the owner edit as owner, a Strelva operator as operator, and nobody else", () => {
    expect(detailsWriteSource("owner", false)).toBe("owner");
    expect(detailsWriteSource("admin", true)).toBe("operator");
    expect(detailsWriteSource("admin", false)).toBeNull();
    expect(detailsWriteSource("member", true)).toBeNull();
    expect(detailsWriteSource("agency", true)).toBeNull();
  });

  const form = (values: Record<string, string>) => new Map(Object.entries(values));
  const saveDeps = (patch: Partial<DetailsSaveDependencies> = {}): DetailsSaveDependencies => ({
    read: vi.fn(async () => record()),
    patch: vi.fn(async () => ({}) as never),
    operator: async () => false,
    ...patch,
  });

  it("saves with the revision the form was rendered from", async () => {
    const deps = saveDeps();
    expect(await saveBusinessDetails(ACTOR, WS, 4, form({ phone: "716-555-0100" }), deps)).toEqual({ outcome: "saved" });
    expect(deps.patch).toHaveBeenCalledWith(ACTOR, WS, 4, { facts: { phone: { value: "716-555-0100" } } }, { source: "owner" });
  });

  it("never overwrites a newer record, and refuses members", async () => {
    const deps = saveDeps();
    expect(await saveBusinessDetails(ACTOR, WS, 3, form({ phone: "716-555-0100" }), deps)).toEqual({ outcome: "conflict" });
    expect(deps.patch).not.toHaveBeenCalled();
    expect(await saveBusinessDetails(ACTOR, WS, 4, form({ phone: "716-555-0100" }), saveDeps({ read: async () => record({ access: "member" }) }))).toEqual({ outcome: "denied" });
    expect(await saveBusinessDetails(ACTOR, WS, 4, form({}), saveDeps({ read: async () => { throw new WorkspaceAccessError(); } }))).toEqual({ outcome: "denied" });
  });

  it("reports a race, a bad value and a store failure without saving anything twice", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await saveBusinessDetails(ACTOR, WS, 4, form({ phone: "716-555-0100" }), saveDeps({ patch: async () => { throw new BusinessRecordConflictError("business_record_revision_conflict", "changed"); } }))).toEqual({ outcome: "conflict" });
    expect(await saveBusinessDetails(ACTOR, WS, 4, form({ phone: "1" }), saveDeps())).toEqual({ outcome: "invalid", field: "phone" });
    expect(await saveBusinessDetails(ACTOR, WS, 4, form({ phone: "716-555-0100" }), saveDeps({ patch: async () => { throw new Error("pg"); } }))).toEqual({ outcome: "failed" });
    expect(await saveBusinessDetails(ACTOR, WS, 4, form({ display_name: "Lakeshore" }), saveDeps())).toEqual({ outcome: "unchanged" });
  });
});
