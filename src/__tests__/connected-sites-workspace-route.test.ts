import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectedSitesStore } from "@/products/connected-sites/store";
import { WorkspaceAccessError } from "@/platform/workspaces/types";

const deps = vi.hoisted(() => ({ user: null as null | { id: string; email: string; email_confirmed_at: string }, limited: vi.fn() }));
vi.mock("@/lib/db/server-client", () => ({ getSessionUser: async () => deps.user }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimitedWindowedAsync: deps.limited }));

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
    store = { create: vi.fn(async () => stored), list: vi.fn(async () => [stored]), activity: vi.fn(async () => ({})), inquiries: vi.fn(async () => []), revoke: vi.fn(async () => ({ ...stored, status: "revoked", revokedAt: "2026-10-08T02:00:00Z" })), update: vi.fn(async () => stored), confirmVerification: vi.fn() } as unknown as ConnectedSitesStore;
    setConnectedSitesStoreForTests(store);
  });
  afterEach(() => { vi.unstubAllEnvs(); setConnectedSitesStoreForTests(null); });

  it("connects a site and returns its two lines and its System id", async () => {
    const response = await post({ action: "connect", workspaceId: BUSINESS, siteUrl: "bakery.example", platform: "wix" });
    expect(response.status).toBe(201);
    const { site } = await response.json();
    expect(site.snippet.script).toContain('data-strelva-site="sk_pub_abcdefghijklmnopqrstuvwx"');
    expect(site.snippet.meta).toContain(`content="${"c".repeat(32)}"`);
    expect(site.systemId).toMatch(/^[0-9a-f-]{36}$/);
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
  it("lists sites with activity and inquiries, and disconnects", async () => {
    const list = await GET(new Request(`${ORIGIN}/api/workspace/connected-sites?workspaceId=${BUSINESS}`));
    expect(list.status).toBe(200);
    expect((await list.json()).sites[0].siteHost).toBe("bakery.example");
    const gone = await post({ action: "disconnect", workspaceId: BUSINESS, siteId: SITE_ID });
    expect((await gone.json()).site.status).toBe("revoked");
  });
});
