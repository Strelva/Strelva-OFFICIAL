import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectedSitesStore } from "@/products/connected-sites/store";
import { WorkspaceAccessError } from "@/platform/workspaces/types";

const page = vi.hoisted(() => ({ html: "" as string | null }));
const deps = vi.hoisted(() => ({ user: null as null | { id: string; email: string; email_confirmed_at: string }, limited: vi.fn(), systemsOn: true, flag: vi.fn(), eligible: vi.fn() }));
vi.mock("@/platform/infra/pinned-public-text", () => ({
  fetchPinnedPublicText: async () => page.html,
  fetchPinnedPublicResponse: async () => page.html === null ? null : { url: "https://bakery.example/", status: 200, headers: new Headers({ "content-type": "text/html" }), body: Buffer.from(page.html) },
}));
vi.mock("@/platform/connections/server", () => ({ connectionEligibilityFor: deps.eligible }));
vi.mock("@/platform/connections/holders", () => ({ recordConnectionHolder: vi.fn(async () => undefined) }));
vi.mock("@/products/connected-sites/installer", () => ({ resolveConnectedSiteInstaller: vi.fn(async (_actor, workspaceId) => ({ kind: "business", workspaceId })) }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: async () => deps.user }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: deps.limited }));
// Per workspace: connected sites follow Systems for the business (release-flag rule).
vi.mock("@/platform/systems-release", () => ({ systemsReleasedFor: async () => deps.systemsOn }));
// And the business's own connected_sites row.
vi.mock("@/platform/release-flags/store", () => ({ workspaceReleaseFlagEnabled: deps.flag }));

import { setConnectedSitesStoreForTests } from "@/products/connected-sites/store";
import { GET, POST } from "@/app/api/workspace/connected-sites/route";

const BUSINESS = "79000000-0000-4000-8000-000000000002";
const SITE_ID = "79000000-0000-4000-8000-000000000003";
const ORIGIN = "http://localhost:3000";
const stored = { id: SITE_ID, workspaceId: BUSINESS, publicKey: "sk_pub_abcdefghijklmnopqrstuvwx", label: "bakery", siteUrl: "https://bakery.example/", siteHost: "bakery.example", allowedOrigins: ["https://bakery.example"], platform: "wix", captureForms: true, injectSchema: true, status: "active", verificationToken: "c".repeat(32), verifiedAt: null, createdAt: "2026-10-08T00:00:00Z", updatedAt: "2026-10-08T00:00:00Z", revokedAt: null, firstEventAt: null, lastEventAt: null };
let store: ConnectedSitesStore;
const post = (body: unknown) => POST(new Request(`${ORIGIN}/api/workspace/connected-sites`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("/api/workspace/connected-sites", () => {
  beforeEach(() => {
    vi.stubEnv("STRELVA_CONNECTED_SITES_RELEASE", "1");
    deps.user = { id: "79000000-0000-4000-8000-000000000001", email: "Owner@Example.test", email_confirmed_at: "2026-10-01" };
    deps.limited.mockReset().mockResolvedValue(false);
    deps.systemsOn = true;
    deps.flag.mockReset().mockResolvedValue(true);
    deps.eligible.mockReset().mockResolvedValue({ eligible: true, through: { kind: "platform" } });
    store = { create: vi.fn(async () => stored), list: vi.fn(async () => [stored]), activity: vi.fn(async () => ({})), inquiries: vi.fn(async () => []), revoke: vi.fn(async () => ({ ...stored, status: "revoked", revokedAt: "2026-10-08T02:00:00Z" })), update: vi.fn(async () => stored), confirmVerification: vi.fn(async () => ({ ...stored, verifiedAt: "2026-10-08T01:00:00Z", verificationToken: null })), recordCheck: vi.fn(async () => ({ ...stored, verifiedAt: "2026-10-08T01:00:00Z", lastCheckResult: "present" })) } as unknown as ConnectedSitesStore;
    page.html = `<html><head><meta name="generator" content="Wix.com Website Builder"><script src="https://app.strelva.test/connect.js" data-strelva-site="${stored.publicKey}" defer></script></head></html>`;
    setConnectedSitesStoreForTests(store);
  });
  afterEach(() => { vi.unstubAllEnvs(); setConnectedSitesStoreForTests(null); });

  it("is off for a business where Systems is off, and touches no store", async () => {
    deps.systemsOn = false;
    expect((await post({ action: "connect", workspaceId: BUSINESS, siteUrl: "bakery.example" })).status).toBe(503);
    expect((await GET(new Request(`${ORIGIN}/api/workspace/connected-sites?workspaceId=${BUSINESS}`))).status).toBe(503);
    expect(store.create).not.toHaveBeenCalled();
    expect(store.list).not.toHaveBeenCalled();
  });
  it("connects a site and returns its two lines and its System id", async () => {
    const response = await post({ action: "connect", workspaceId: BUSINESS, siteUrl: "bakery.example", platform: "wix" });
    expect(response.status).toBe(201);
    const { site } = await response.json();
    expect(site.snippet.script).toContain('data-strelva-site="sk_pub_abcdefghijklmnopqrstuvwx"');
    expect(site.snippet.meta).toContain(`content="${"c".repeat(32)}"`);
    expect(site.systemId).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("refuses unavailable provider access while the existing release gates remain on", async () => {
    deps.eligible.mockResolvedValue({ eligible: false, reason: "not_configured", message: "Website script is coming soon." });
    const response = await post({ action: "connect", workspaceId: BUSINESS, siteUrl: "bakery.example" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "Website script is coming soon." });
    expect(store.create).not.toHaveBeenCalled();
  });
  it("refuses without a session, when off, for a bad address and when SQL denies", async () => {
    deps.user = null; expect((await post({ action: "connect", workspaceId: BUSINESS, siteUrl: "bakery.example" })).status).toBe(401);
    deps.user = { id: "79000000-0000-4000-8000-000000000001", email: "owner@example.test", email_confirmed_at: "2026-10-01" };
    expect((await post({ action: "connect", workspaceId: BUSINESS, siteUrl: "https://10.0.0.1" })).status).toBe(400);
    (store.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new WorkspaceAccessError());
    expect((await post({ action: "connect", workspaceId: BUSINESS, siteUrl: "bakery.example" })).status).toBe(403);
    expect((await post({ action: "rename", workspaceId: BUSINESS })).status).toBe(400);
    vi.stubEnv("STRELVA_CONNECTED_SITES_RELEASE", "0");
    expect((await post({ action: "connect", workspaceId: BUSINESS, siteUrl: "bakery.example" })).status).toBe(503);
  });
  it("is off for a business whose own connected_sites row is off, even with Systems on", async () => {
    deps.flag.mockResolvedValue(false);
    expect((await post({ action: "connect", workspaceId: BUSINESS, siteUrl: "bakery.example" })).status).toBe(503);
    expect(deps.flag).toHaveBeenCalledWith("connected_sites", BUSINESS, { operator: false, tester: false, userId: "79000000-0000-4000-8000-000000000001" });
    expect(store.create).not.toHaveBeenCalled();
  });
  it("lists sites with activity and inquiries, and disconnects", async () => {
    const list = await GET(new Request(`${ORIGIN}/api/workspace/connected-sites?workspaceId=${BUSINESS}`));
    expect(list.status).toBe(200);
    expect((await list.json()).sites[0].siteHost).toBe("bakery.example");
    const gone = await post({ action: "disconnect", workspaceId: BUSINESS, siteId: SITE_ID });
    expect((await gone.json()).site.status).toBe("revoked");
  });

  describe("keep your site", () => {
    it("check does not exist while the flag is off, and records nothing", async () => {
      const response = await post({ action: "check", workspaceId: BUSINESS, siteId: SITE_ID });
      expect(response.status).toBe(404);
      expect(store.recordCheck).not.toHaveBeenCalled();
    });
    it("check re-reads the live page and stores what it found", async () => {
      vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
      vi.stubEnv("STRELVA_KEEP_YOUR_SITE_RELEASE", "workspace");
      const response = await post({ action: "check", workspaceId: BUSINESS, siteId: SITE_ID });
      expect(response.status).toBe(200);
      expect((await response.json()).site.lastCheckResult).toBe("present");
      expect(store.recordCheck).toHaveBeenCalledWith(expect.anything(), BUSINESS, SITE_ID, { result: "present", platform: "wix", evidence: ["generator: Wix.com Website Builder"] });
    });
    it("check is rate limited per site", async () => {
      vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
      vi.stubEnv("STRELVA_KEEP_YOUR_SITE_RELEASE", "workspace");
      deps.limited.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      expect((await post({ action: "check", workspaceId: BUSINESS, siteId: SITE_ID })).status).toBe(429);
      expect(deps.limited).toHaveBeenLastCalledWith(`connected-site-check:${SITE_ID}`, 10, 600_000);
    });
    it("verify records the detected builder once when on, and not when off", async () => {
      expect((await post({ action: "verify", workspaceId: BUSINESS, siteId: SITE_ID })).status).toBe(200);
      expect(store.recordCheck).not.toHaveBeenCalled();
      vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
      vi.stubEnv("STRELVA_KEEP_YOUR_SITE_RELEASE", "workspace");
      expect((await post({ action: "verify", workspaceId: BUSINESS, siteId: SITE_ID })).status).toBe(200);
      expect(store.recordCheck).toHaveBeenCalledTimes(1);
      expect(store.recordCheck).toHaveBeenCalledWith(expect.anything(), BUSINESS, SITE_ID, expect.objectContaining({ result: "present", platform: "wix" }));
    });
  });
});
