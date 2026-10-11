import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { uuidFromSeed } from "@/platform/business-record/tenant-import";
import { systemsFromExisting } from "@/platform/systems/from-existing";
import { projectWorkspaceSystems, publishingView, withPublishing } from "@/experience/systems/server";
import { readBusinessSystems } from "@/experience/systems/from-workspace";
import { SystemPage } from "@/experience/systems/SystemPage";
import { readPublishingExtras, publishingReleaseEnabled } from "@/products/publishing/server";
import { previewPublishingExtras, previewPublishingSnapshot } from "@/experience/workspace/preview/publishing-fixture";
import type { WorkspaceSnapshot } from "@/experience/workspace/contracts";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/workspace", useSearchParams: () => new URLSearchParams() }));

// From the server projection to what the owner reads: the listing System, its
// receipts in words, the newsletter, and blog as part of the website.

const BUSINESS = uuidFromSeed("business:mooney");
const STABLE = uuidFromSeed("tenant:mooney-firm");
const NOW = Date.parse("2026-10-06T15:00:00Z");
const actor = { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "sheri@example.test" };
const base = systemsFromExisting({
  businessId: BUSINESS, savedWork: [], inquiryWorkspaces: [], bookingGrants: [], calendarConnections: [],
  managedWebsites: [{ link: "tenant_link", tenantStableId: STABLE, tenantId: "mooney-firm", siteName: "The Mooney Firm", tenantActive: true, linkedAt: "2026-10-01T00:00:00Z" }],
});

async function project(mode: "on" | "pending" | "disconnected" | "none") {
  const listing = base;
  const snapshot = previewPublishingSnapshot(listing, "mooney", mode, NOW);
  const published = await withPublishing(listing, actor, NOW, { snapshot: async () => snapshot, extras: async () => previewPublishingExtras("mooney") });
  return projectWorkspaceSystems({ listing: published.listing, siteDomains: new Map(), candidates: [], observations: published.observations, actorId: actor.userId, now: NOW, publishing: published.publishing });
}

function views(systems: Awaited<ReturnType<typeof project>>) {
  const snapshot = { workspaceId: BUSINESS, workspaces: [{ id: BUSINESS, name: "The Mooney Firm", kind: "customer" }], work: [], delegations: [], systems, releases: { systems: true } } as unknown as WorkspaceSnapshot;
  return readBusinessSystems({ snapshot, sites: [] }).systems;
}

describe("publishing in the workspace", () => {
  it("is off unless STRELVA_PUBLISHING_RELEASE is 1", () => {
    expect(publishingReleaseEnabled({})).toBe(false);
    expect(publishingReleaseEnabled({ STRELVA_PUBLISHING_RELEASE: "1" })).toBe(true);
  });

  it("shows the listing with receipts in words, the newsletter, and blog as a website part", async () => {
    const all = views(await project("on"));
    const listing = all.find((item) => item.kind === "listing")!;
    expect(listing.name).toBe("The Mooney Firm");
    expect(listing.surface).toMatchObject({ kind: "listing", healthMessage: "Google listing read recently." });
    const receipts = listing.surface.kind === "listing" ? listing.surface.receipts.map((r) => r.headline) : [];
    expect(receipts).toEqual(["Updated your hours on Google.", "Replied to a review on Google.", "Posted. Google hasn't shown it yet."]);
    expect(all.find((item) => item.kind === "newsletter")?.name).toBe("The Mooney Firm newsletter");
    expect(all.find((item) => item.kind === "website")?.parts).toEqual([{ label: "Blog", published: 12, drafts: 1 }]);
    const text = JSON.stringify(all);
    expect(text).not.toMatch(/\b(AI|agent|automation)\b/);
  });

  it("offers Connect Google in context when there is no grant", async () => {
    const all = views(await project("none"));
    expect(all.some((item) => item.kind === "listing")).toBe(false);
    expect(all.find((item) => item.kind === "website")?.offers).toEqual([{ kind: "connect_google", label: "The Mooney Firm has no Google account connected yet" }]);
  });

  it("names access pending and disconnected as health, keeping the listing Live", async () => {
    const pending = views(await project("pending")).find((item) => item.kind === "listing")!;
    expect(pending.lifecycle).toBe("live");
    expect(pending.surface).toMatchObject({ healthMessage: "Google access pending. Replies and changes wait until Google approves." });
    expect(pending.surface.kind === "listing" && pending.surface.receipts[0]?.headline).toBe("Waiting for Google to approve access. Nothing was sent yet.");
    const dead = views(await project("disconnected")).find((item) => item.kind === "listing")!;
    expect(dead.lifecycle).toBe("live");
    expect(dead.health.state).toBe("blocked");
  });

  it("a failed publishing read leaves every other System and says publishing is unavailable", async () => {
    const out = await withPublishing(base, actor, NOW, { snapshot: async () => { throw new Error("db down"); }, extras: async () => ({}) });
    expect(out.listing).toBe(base);
    expect(publishingView(out.publishing)).toEqual({ status: "unavailable", listings: [], websiteParts: {}, offers: [] });
  });

  it("leaves out a store it can't read instead of reporting zero", async () => {
    const extras = await readPublishingExtras(base, { activeSubscribers: async () => { throw new Error("down"); }, collections: async () => [] });
    expect(extras.newsletters).toEqual([]);
    expect(extras.collections).toEqual([{ tenantId: "mooney-firm", types: [] }]);
  });
  it("keeps approved newsletter outputs discoverable after the last subscriber leaves", async () => {
    const extras = await readPublishingExtras(base, { activeSubscribers: async () => 0, collections: async () => [], approvedIssues: async () => 1 });
    const projected = await withPublishing(base, actor, NOW, { snapshot: async () => previewPublishingSnapshot(base, "mooney", "on", NOW), extras: async () => extras });
    expect(projected.listing.systems.find(item => item.system.kind === "newsletter")?.basis).toContain("0 active subscribers");
    expect(projected.listing.systems.find(item => item.system.kind === "newsletter")?.basis).toContain("approved issues and receipts stay here");
  });
  it("keeps newsletter history when subscriber reads fail without inventing a zero count", async () => {
    const extras = await readPublishingExtras(base, { activeSubscribers: async () => { throw new Error("down"); }, collections: async () => [], approvedIssues: async () => 1 });
    expect(extras.newsletters).toEqual([{ tenantId: "mooney-firm", activeSubscribers: null, approvedIssues: 1 }]);
    const projected = await withPublishing(base, actor, NOW, { snapshot: async () => previewPublishingSnapshot(base, "mooney", "on", NOW), extras: async () => extras });
    const newsletter = projected.listing.systems.find(item => item.system.kind === "newsletter");
    expect(newsletter?.basis).toContain("Subscriber count is unavailable");
    expect(newsletter?.basis).toContain("approved issues and receipts stay here");
  });

  it("renders the listing page with What changed, and an empty state", async () => {
    const all = views(await project("on"));
    const listing = all.find((item) => item.kind === "listing")!;
    const props = { systems: all, workspaceId: BUSINESS, readOnly: false, sources: [], systemHref: (id: string) => id, onHome: () => undefined, onAsk: () => undefined };
    const html = renderToStaticMarkup(<SystemPage {...props} system={listing} />);
    expect(html).toContain("What changed");
    expect(html).toContain("Replied to a review on Google.");
    const empty = renderToStaticMarkup(<SystemPage {...props} system={{ ...listing, surface: { kind: "listing", healthMessage: "Google listing read recently.", receipts: [] } }} />);
    expect(empty).toContain("Nothing yet.");
  });
});
