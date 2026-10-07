import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectedSitesStore } from "@/products/connected-sites/store";
import type { BusinessPagesStore } from "@/products/connected-sites/business-pages-store";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";

const deps = vi.hoisted(() => ({ user: null as null | { id: string; email: string; email_confirmed_at: string }, limited: vi.fn(), flag: vi.fn(), fetchPage: vi.fn() }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: async () => deps.user }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: deps.limited }));
vi.mock("@/platform/systems-release", () => ({ systemsReleasedFor: async () => true }));
vi.mock("@/platform/release-flags/store", () => ({ workspaceReleaseFlagEnabled: deps.flag }));
vi.mock("@/lib/pinned-public-text", () => ({ fetchPinnedPublicText: deps.fetchPage }));

import { setConnectedSitesStoreForTests } from "@/products/connected-sites/store";
import { setBusinessPagesStoreForTests } from "@/products/connected-sites/business-pages-store";
import { GET, POST } from "@/app/api/workspace/connected-sites/visibility/route";
import { ServerVisibility } from "@/experience/connected-sites/ServerVisibility";

const BUSINESS = "7c000000-0000-4000-8000-000000000002";
const SITE_ID = "7c000000-0000-4000-8000-000000000003";
const ORIGIN = "http://localhost:3000";
const site = { id: SITE_ID, workspaceId: BUSINESS, publicKey: "sk_pub_abcdefghijklmnopqrstuvwx", label: "barber", siteUrl: "https://barber.example/", siteHost: "barber.example", allowedOrigins: ["https://barber.example"], platform: "wix", captureForms: true, injectSchema: true, status: "active", verificationToken: null, verifiedAt: "2026-10-08T00:00:00Z", createdAt: "2026-10-08T00:00:00Z", updatedAt: "2026-10-08T00:00:00Z", revokedAt: null, firstEventAt: null, lastEventAt: null };
const confirmed = { revision: 2, facts: { display_name: "Fictional Barber", phone: "716-555-0100" }, services: [], confirmedAt: "2026-10-03T12:00:00Z" };
let sites: ConnectedSitesStore;
let pages: BusinessPagesStore;
const post = (body: unknown) => POST(new Request(`${ORIGIN}/api/workspace/connected-sites/visibility`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(body) }));
const get = () => GET(new Request(`${ORIGIN}/api/workspace/connected-sites/visibility?workspaceId=${BUSINESS}`));

describe("/api/workspace/connected-sites/visibility", () => {
  beforeEach(() => {
    vi.stubEnv("STRELVA_CONNECTED_SITES_RELEASE", "1");
    vi.stubEnv("STRELVA_BUSINESS_PAGES", "1");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.strelva.test");
    deps.user = { id: "7c000000-0000-4000-8000-000000000001", email: "Owner@Example.test", email_confirmed_at: "2026-10-01" };
    deps.limited.mockReset().mockResolvedValue(false);
    deps.flag.mockReset().mockResolvedValue(true);
    deps.fetchPage.mockReset();
    sites = { list: vi.fn(async () => [site, { ...site, id: "7c000000-0000-4000-8000-000000000009", status: "revoked" }]) } as unknown as ConnectedSitesStore;
    pages = {
      read: vi.fn(async () => ({ handle: "fictional-barber", published: true, publishedAt: "2026-10-04T00:00:00Z", updatedAt: "2026-10-04T00:00:00Z" })),
      set: vi.fn(async (_actor, _ws, input: { handle: string; published: boolean }) => ({ ...input, publishedAt: input.published ? "2026-10-05T00:00:00Z" : null, updatedAt: "2026-10-05T00:00:00Z" })),
      confirmedFacts: vi.fn(async () => confirmed),
      published: vi.fn(),
    };
    setConnectedSitesStoreForTests(sites);
    setBusinessPagesStoreForTests(pages);
  });
  afterEach(() => { vi.unstubAllEnvs(); setConnectedSitesStoreForTests(null); setBusinessPagesStoreForTests(null); });

  it("returns the page and one paste block per active site plus one for any site, from the same confirmed facts", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.page).toMatchObject({ handle: "fictional-barber", published: true, url: "https://app.strelva.test/biz/fictional-barber" });
    expect(body.blocks.map((item: { id: string }) => item.id)).toEqual([SITE_ID, "any"]);
    const [forSite, forAny] = body.blocks;
    expect(forSite.block.html).toContain('"url":"https://barber.example/"');
    expect(forAny.block.html).not.toContain('"url"');
    expect(forSite.block.hash).not.toBe(forAny.block.hash);
    expect(forAny.checkable).toBe(false);
    expect(pages.confirmedFacts).toHaveBeenCalledWith({ userId: deps.user!.id, verifiedEmail: "owner@example.test" }, BUSINESS);
  });

  it("leaves the page out while STRELVA_BUSINESS_PAGES is off, and refuses to publish", async () => {
    vi.stubEnv("STRELVA_BUSINESS_PAGES", "");
    const body = await (await get()).json();
    expect(body.pagesEnabled).toBe(false);
    expect(body.page).toBeNull();
    expect(pages.read).not.toHaveBeenCalled();
    expect(body.blocks).toHaveLength(2);
    expect((await post({ action: "page", workspaceId: BUSINESS, handle: "fictional-barber", published: true })).status).toBe(503);
    expect(pages.set).not.toHaveBeenCalled();
  });

  it("has no block until the name is confirmed", async () => {
    (pages.confirmedFacts as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ...confirmed, facts: { phone: "716-555-0100" } });
    expect((await (await get()).json()).blocks).toBeNull();
  });

  it("publishes a valid address and explains an invalid one", async () => {
    const response = await post({ action: "page", workspaceId: BUSINESS, handle: "Fictional-Barber", published: true });
    expect(response.status).toBe(200);
    expect((await response.json()).page).toMatchObject({ handle: "fictional-barber", published: true, url: "https://app.strelva.test/biz/fictional-barber" });
    const bad = await post({ action: "page", workspaceId: BUSINESS, handle: "a--b", published: true });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("Use 3 to 48 lowercase letters, numbers and single hyphens.");
    (pages.set as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new WorkspaceConflictError("Another business already uses that address. Try a different one."));
    expect((await post({ action: "page", workspaceId: BUSINESS, handle: "taken-name", published: true })).status).toBe(409);
    (pages.set as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new WorkspaceAccessError());
    expect((await post({ action: "page", workspaceId: BUSINESS, handle: "fictional-barber", published: true })).status).toBe(403);
  });

  it("checks the live page against today's block", async () => {
    const { blocks } = await (await get()).json();
    deps.fetchPage.mockResolvedValueOnce(`<html><head>${blocks[0].block.html}</head></html>`);
    let response = await post({ action: "check", workspaceId: BUSINESS, siteId: SITE_ID });
    expect(response.status).toBe(200);
    expect((await response.json()).check).toMatchObject({ siteId: SITE_ID, siteHost: "barber.example", status: "current", hash: blocks[0].block.hash });
    expect(deps.fetchPage).toHaveBeenCalledWith("https://barber.example/", { timeoutMs: 8000, maxBytes: 2_000_000 });
    deps.fetchPage.mockResolvedValueOnce("<html><head></head></html>");
    expect((await (await post({ action: "check", workspaceId: BUSINESS, siteId: SITE_ID })).json()).check.status).toBe("missing");
    deps.fetchPage.mockResolvedValueOnce(null);
    response = await post({ action: "check", workspaceId: BUSINESS, siteId: SITE_ID });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("couldn't open barber.example");
    expect((await post({ action: "check", workspaceId: BUSINESS, siteId: "7c000000-0000-4000-8000-000000000009" })).status).toBe(409);
  });

  it("refuses without a session, for a business where connected sites are off, and when rate limited", async () => {
    deps.user = null;
    expect((await get()).status).toBe(401);
    deps.user = { id: "7c000000-0000-4000-8000-000000000001", email: "owner@example.test", email_confirmed_at: "2026-10-01" };
    deps.flag.mockResolvedValue(false);
    expect((await get()).status).toBe(503);
    expect((await post({ action: "check", workspaceId: BUSINESS, siteId: SITE_ID })).status).toBe(503);
    deps.flag.mockResolvedValue(true);
    deps.limited.mockResolvedValueOnce(true);
    expect((await post({ action: "check", workspaceId: BUSINESS, siteId: SITE_ID })).status).toBe(429);
    vi.stubEnv("STRELVA_CONNECTED_SITES_RELEASE", "0");
    expect((await get()).status).toBe(503);
  });
});

describe("the workspace section", () => {
  const block = { id: SITE_ID, label: "barber.example", url: "https://barber.example/", checkable: true, block: { hash: "0123456789abcdef", html: '<script type="application/ld+json" data-strelva-schema="1">{}</script>' } };
  const render = (props: Partial<Parameters<typeof ServerVisibility>[0]> = {}) => renderToStaticMarkup(createElement(ServerVisibility, { workspaceId: BUSINESS, canManage: true, initial: { pagesEnabled: true, page: null, blocks: [block] }, suggestedHandle: "fictional-barber", ...props }));

  it("gives a manager the address form, the block and a check", () => {
    const html = render();
    expect(html).toContain('value="fictional-barber"');
    expect(html).toContain("Publish page");
    expect(html).toContain("&lt;script type=&quot;application/ld+json&quot; data-strelva-schema=&quot;1&quot;&gt;");
    expect(html).toContain("Check barber.example");
    expect(html).toContain("Version 0123456789abcdef");
  });
  it("shows a member the block but not the publish form", () => {
    const html = render({ canManage: false });
    expect(html).not.toContain("Publish page");
    expect(html).toContain("An owner or admin of this business publishes its page.");
    expect(html).toContain("Copy block");
  });
  it("hides the page while it is off, and asks for a confirmed name when there is no block", () => {
    const html = render({ initial: { pagesEnabled: false, page: null, blocks: null } });
    expect(html).not.toContain("public business page");
    expect(html).toContain("Confirm your business name in your details first.");
  });
});
