import { describe, expect, it, vi } from "vitest";
import { buildWebsiteSystemDetail, type WebsiteDetailInputs } from "@/experience/systems/website-detail";
import type { WebsiteDetailSources } from "@/experience/systems/website-detail-server";

vi.mock("@/platform/systems/supabase-store", () => ({ createSupabaseSystemStore: () => ({}) }));
const { readWebsiteSystemDetail } = await import("@/experience/systems/website-detail-server");

const actor = { userId: "75000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const businessId = "75000000-0000-4000-8000-000000000002";
const siteId = "75000000-0000-4000-8000-000000000003";
const workId = "75000000-0000-4000-8000-000000000004";

function inputs(overrides: Partial<WebsiteDetailInputs> = {}): WebsiteDetailInputs {
  return {
    systemId: siteId, actorId: actor.userId, domains: [], decisions: [], draftSections: [], siteReview: null, changeRequests: [], serviceRequests: [],
    contentVersions: [], snapshots: [], documentRevisions: [], linkedPublications: [], unavailable: [], ...overrides,
  };
}

describe("website System page lists", () => {
  it("merges the four release stores into one History, newest first, with who and undo", () => {
    const detail = buildWebsiteSystemDetail(inputs({
      contentVersions: [{ id: "v_1", section: "hero", author: "ai", timestamp: "2026-10-01T10:00:00Z", status: "live" }, { id: "v_2", section: "hero", author: "user", timestamp: "2026-10-04T10:00:00Z", status: "live", changes: [{ field: "_restore" }] }],
      snapshots: [{ id: "s_1", label: "Daily copy", reason: "daily", author: "system", createdAt: "2026-10-02T10:00:00Z", status: "available" }],
      documentRevisions: [{ revision: 2, contentHash: "a".repeat(64), createdAt: "2026-10-03T10:00:00Z", createdBy: actor.userId, published: true }],
      changeRequests: [{ requestId: "evt_1", title: "Private events page added", kind: "custom_request", status: "shipped", createdAt: "2026-09-30T10:00:00Z", resolvedAt: "2026-10-05T10:00:00Z" }],
    }));
    expect(detail.history.map(item => item.source)).toEqual(["deploy", "content", "document", "snapshot", "content"]);
    expect(detail.history[0]).toMatchObject({ title: "Private events page added", by: "Strelva" });
    expect(detail.history[1]).toMatchObject({ title: "Restored an earlier homepage banner", by: "You" });
    expect(detail.history[2]).toMatchObject({ title: "Published site revision 2", by: "You" });
    expect(detail.history.filter(item => item.source !== "document").every(item => item.undo)).toBe(true);
    expect(detail.history[2].undo).toBeNull();
    // Issued rows never change here: History only reads them.
    expect(detail.requests).toEqual([]);
  });
  it("pins a saved copy Request and an earlier document restore directly on the owner's History row", () => {
    const detail = buildWebsiteSystemDetail(inputs({
      workspaceId: businessId, workId,
      snapshots: [{ id: "saved-copy", label: "Before rebuilding", reason: "manual", author: "user", createdAt: "2026-10-01T00:00:00Z", status: "available" }],
      documentRevisions: [1, 2].map(revision => ({ revision, contentHash: String(revision).repeat(64), createdAt: `2026-10-0${revision}T00:00:00Z`, createdBy: actor.userId, published: true })),
    }));
    expect(detail.history.find(row => row.source === "snapshot")).toMatchObject({ restore: { kind: "snapshot", snapshotId: "saved-copy" } });
    expect(detail.history.find(row => row.id.startsWith("document:1:"))).toMatchObject({ restore: { kind: "document", workId, targetRevision: 1, targetContentHash: "1".repeat(64) } });
    expect(detail.history.find(row => row.id.startsWith("document:2:"))?.restore).toBeUndefined();
    expect(detail.history.every(row => !row.restoreHref)).toBe(true);
  });
  it("includes actual deploy receipts with honest failed read-back and immutable evidence", () => {
    const detail = buildWebsiteSystemDetail(inputs({ repoDeployments: [{
      id: "deploy-receipt", requestId: "request", title: "Private events page", commitSha: "abcdef0",
      deploymentUrl: "https://fictional.vercel.app", readBack: "not_confirmed", recordedAt: "2026-10-05T10:00:00Z",
    }] }));
    expect(detail.history).toEqual([expect.objectContaining({
      source: "deploy", title: "Private events page · deployed, not yet confirmed",
      deployment: { commitSha: "abcdef0", url: "https://fictional.vercel.app", readBack: "not_confirmed" },
    })]);
  });
  it("lists only open Requests, with their stage", () => {
    const detail = buildWebsiteSystemDetail(inputs({
      changeRequests: [
        { requestId: "a", title: "Private events page", kind: "custom_request", status: "in_progress", createdAt: "2026-10-01T00:00:00Z" },
        { requestId: "b", title: "Old ask", kind: "custom_request", status: "declined", createdAt: "2026-09-01T00:00:00Z" },
        { requestId: "c", title: "Copy edit", kind: "content_update", status: "review", createdAt: "2026-10-02T00:00:00Z", section: "hero" },
      ],
      serviceRequests: [{ id: "75000000-0000-4000-8000-000000000009", outcome: "A new menu page", createdAt: "2026-10-03T00:00:00Z", status: "requested", commitment: "submitted" }],
    }));
    expect(detail.requests.map(item => [item.title, item.stage])).toEqual([["A new menu page", "ready_for_review"], ["Private events page", "in_progress"]]);
  });
  it("shows drafts only when no waiting decision already covers them", () => {
    const detail = buildWebsiteSystemDetail(inputs({
      decisions: [{ id: "d1", title: "Approve the new homepage banner", detail: null, openedAt: "2026-10-05T00:00:00Z", openHref: null }],
      draftSections: ["hero", "faq"],
      changeRequests: [{ requestId: "c", title: "Copy edit", kind: "content_update", status: "review", createdAt: "2026-10-02T00:00:00Z", section: "hero" }],
      siteReview: { workId, revision: 3, at: null, href: "/workspace?work=x" },
    }));
    expect(detail.waiting.map(item => item.kind)).toEqual(["decision", "content_draft", "site_review"]);
    expect(detail.waiting[1]!.title).toContain("questions and answers");
  });
});

function sources(overrides: Partial<WebsiteDetailSources> = {}): WebsiteDetailSources {
  return {
    listSystems: vi.fn(async () => ({ businessId, connections: [], systems: [{ system: { id: siteId, kind: "website", name: "gldf.example.test" }, references: { tenantId: "gldf", savedWorkId: workId, tenantStableId: null }, provenance: "existing", basis: null }] })) as unknown as WebsiteDetailSources["listSystems"],
    domains: vi.fn(async () => ({ monitorKnown: true, monitorScannedAt: null, rows: [{ domain: "gldf.example.test", system: "gldf", role: "production", verification: { status: "misconfigured", dns: "misconfigured", ssl: "unknown", label: "DNS misconfigured" }, registration: null, uptime: null, expiry: { at: null, days: null, label: "Expiry unknown" }, lastCheckedAt: "2026-10-07T00:00:00Z", whoCanChange: "The owner, with their registrar" }] })) as unknown as WebsiteDetailSources["domains"],
    events: vi.fn(async () => []) as unknown as WebsiteDetailSources["events"],
    drafts: vi.fn(async () => ({ hero: true })) as unknown as WebsiteDetailSources["drafts"],
    versions: vi.fn(async () => []) as unknown as WebsiteDetailSources["versions"],
    snapshots: vi.fn(async () => []) as unknown as WebsiteDetailSources["snapshots"],
    needsYou: () => ({ enabled: true, list: async () => ({ items: [
      { id: "n1", systemId: null, sourceId: "gldf:evt1", title: "Holiday hero", detail: null, openedAt: "2026-10-06T00:00:00Z", openHref: null },
      { id: "n2", systemId: null, sourceId: "other-tenant:evt2", title: "Another site's ask", detail: null, openedAt: "2026-10-06T00:00:00Z", openHref: null },
      { id: "n3", systemId: siteId, sourceId: "svc:1", title: "Go live", detail: null, openedAt: "2026-10-06T00:00:00Z", openHref: null },
    ] }) }),
    serviceRequests: vi.fn(async () => [
      { id: "75000000-0000-4000-8000-000000000010", status: "requested", outcome: "Menu page", createdAt: "2026-10-01T00:00:00Z", context: { tenantId: "gldf" }, deliveryCommitment: null },
      { id: "75000000-0000-4000-8000-000000000011", status: "requested", outcome: "Unrelated tool", createdAt: "2026-10-01T00:00:00Z", context: {}, deliveryCommitment: null },
    ]),
    documents: { list: vi.fn(async () => []), receipts: vi.fn(async () => []), linkedPublications: vi.fn(async () => []) } as unknown as WebsiteDetailSources["documents"],
    rebuild: vi.fn(async () => null),
    connectedSites: () => null,
    ...overrides,
  };
}

describe("website System page loader", () => {
  it("reads every source for the site this business holds, filtering decisions and requests to it", async () => {
    const s = sources();
    const detail = (await readWebsiteSystemDetail(actor, businessId, siteId, s))!;
    expect(detail.domains).toEqual([{ hostname: "gldf.example.test", state: "misconfigured", label: "DNS misconfigured", lastCheckedAt: "2026-10-07T00:00:00Z", whoCanChange: "The owner, with their registrar" }]);
    expect(detail.waiting.map(item => item.title)).toEqual(["Holiday hero", "Go live", "A change to the homepage banner is ready for review"]);
    expect(detail.requests.map(item => item.title)).toEqual(["Menu page"]);
    expect(detail.unavailable).toEqual([]);
    expect(s.events).toHaveBeenCalledWith("gldf", { limit: 100 });
  });
  it("keeps deploy and reconciliation outages visible without inventing an empty history", async () => {
    const detail = (await readWebsiteSystemDetail(actor, businessId, siteId, sources({
      repoChanges: async () => { throw new Error("receipt storage down"); },
    })))!;
    expect(detail.unavailable).toContain("Repo deploy history");
    expect(detail.history).toEqual([]);
  });
  it("names a source it could not read instead of showing it as empty", async () => {
    const detail = (await readWebsiteSystemDetail(actor, businessId, siteId, sources({ versions: vi.fn(async () => { throw new Error("down"); }) as unknown as WebsiteDetailSources["versions"], domains: vi.fn(async () => { throw new Error("down"); }) as unknown as WebsiteDetailSources["domains"] })))!;
    expect(detail.unavailable).toEqual(expect.arrayContaining(["Content history", "Domains"]));
    expect(detail.domains).toEqual([]);
  });
  it("returns nothing for a System that is not a website of this business", async () => {
    expect(await readWebsiteSystemDetail(actor, businessId, "75000000-0000-4000-8000-0000000000ff", sources())).toBeNull();
    const notWebsite = sources({ listSystems: vi.fn(async () => ({ businessId, connections: [], systems: [{ system: { id: siteId, kind: "inquiry", name: "x" }, references: { tenantId: "gldf", savedWorkId: null, tenantStableId: null }, provenance: "existing", basis: null }] })) as unknown as WebsiteDetailSources["listSystems"] });
    expect(await readWebsiteSystemDetail(actor, businessId, siteId, notWebsite)).toBeNull();
  });
  it("propagates an access failure from the Systems listing", async () => {
    const denied = sources({ listSystems: vi.fn(async () => { throw new Error("workspace_access_denied"); }) as unknown as WebsiteDetailSources["listSystems"] });
    await expect(readWebsiteSystemDetail(actor, businessId, siteId, denied)).rejects.toThrow(/workspace_access_denied/);
  });
  it("uses the tenant's own pending owner asks when Needs you is off", async () => {
    const detail = (await readWebsiteSystemDetail(actor, businessId, siteId, sources({
      needsYou: () => ({ enabled: false, list: async () => ({ items: [] }) }),
      events: vi.fn(async () => [{ id: "e1", tenantId: "gldf", type: "change_request", status: "pending", title: "Restructure the menu", body: "A structural change", createdAt: "2026-10-06T00:00:00Z", source: "agent", metadata: { kind: "custom_code_or_design_request" } }]) as unknown as WebsiteDetailSources["events"],
    })))!;
    expect(detail.requests.map(item => item.title)).toContain("Restructure the menu");
  });
});
