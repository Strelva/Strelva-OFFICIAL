import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceRequestConflictError } from "@/platform/service-requests";
import type { ConnectedSiteChangesStore } from "@/products/connected-sites/server";
import type { ConnectedSitesStore } from "@/products/connected-sites/store";

const deps = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; email_confirmed_at: string }, limited: vi.fn(), flag: vi.fn(), provider: vi.fn(), filed: vi.fn(), reconcile: vi.fn(),
}));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: async () => deps.user }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: deps.limited }));
vi.mock("@/platform/systems-release", () => ({ systemsReleasedFor: async () => true }));
vi.mock("@/platform/release-flags/store", () => ({ workspaceReleaseFlagEnabled: deps.flag }));
vi.mock("@/platform/service-requests/provider-options", () => ({ readSiteChangeProvider: deps.provider }));
vi.mock("@/platform/service-requests", async importOriginal => ({
  ...(await importOriginal<typeof import("@/platform/service-requests")>()),
  PostgresServiceRequestStore: {},
  ServiceRequestService: class { execute = deps.filed; },
}));
vi.mock("@/products/websites/index", () => ({ reconcileWebsiteSystemReleases: deps.reconcile }));
vi.mock("@/platform/infra/pinned-public-text", () => ({ fetchPinnedPublicText: async () => "<p>Open Saturday 9-2</p>", fetchPinnedPublicResponse: async () => null }));

import { setConnectedSiteChangesStoreForTests } from "@/products/connected-sites/changes-store";
import { setConnectedSitesStoreForTests } from "@/products/connected-sites/store";
import { connectedSiteSystemId } from "@/products/connected-sites/system-id";
import { GET, POST } from "@/app/api/workspace/connected-sites/changes/route";

const WS = "79000000-0000-4000-8000-000000000002";
const SITE = "79000000-0000-4000-8000-000000000003";
const CHANGE = "79000000-0000-4000-8000-000000000004";
const AGENCY = "79000000-0000-4000-8000-000000000005";
const SYSTEM = connectedSiteSystemId({ id: SITE, workspaceId: WS });
const ORIGIN = "http://localhost:3000";
const site = { id: SITE, workspaceId: WS, publicKey: "sk_pub_abcdefghijklmnopqrstuvwx", label: "b", siteUrl: "https://bakery.example/", siteHost: "bakery.example", allowedOrigins: ["https://bakery.example"], platform: "wix", captureForms: true, injectSchema: true, status: "active", verificationToken: null, verifiedAt: "2026-10-01T00:00:00Z", createdAt: "x", updatedAt: "x", revokedAt: null, firstEventAt: null, lastEventAt: null };
const planned = { id: "79000000-0000-4000-8000-0000000000a1", kind: "planned", pageUrl: "https://bakery.example/hours", editSteps: ["a"], expectText: "Open Saturday 9-2", removeText: null, ownerFacing: false, checkResult: null, matched: null, readBack: null, releaseNumber: null, note: null, recordedAt: "2026-10-20T00:00:00Z", actor: null };
const change = { id: CHANGE, requestId: null, origin: "agency", title: "Hours", createdAt: "2026-10-20T00:00:00Z", stage: "checking", steps: [planned] };
const view = { viewer: { role: "admin", isOwner: false, actingAgencyId: AGENCY, agencyName: "Agency" }, site: { id: SITE, siteHost: "bakery.example", siteUrl: "https://bakery.example/", platform: "wix" }, requests: [], changes: [change] };
let changes: ConnectedSiteChangesStore;
const post = (body: unknown) => POST(new Request(`${ORIGIN}/api/workspace/connected-sites/changes`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(body) }));
const get = () => GET(new Request(`${ORIGIN}/api/workspace/connected-sites/changes?workspaceId=${WS}&systemId=${SYSTEM}`));
const on = () => { vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_CONNECTED_SITES_RELEASE", "1"); vi.stubEnv("STRELVA_KEEP_YOUR_SITE_RELEASE", "workspace"); };

describe("/api/workspace/connected-sites/changes", () => {
  beforeEach(() => {
    deps.user = { id: "79000000-0000-4000-8000-000000000001", email: "owner@example.test", email_confirmed_at: "2026-10-01" };
    deps.limited.mockReset().mockResolvedValue(false);
    deps.flag.mockReset().mockResolvedValue(true);
    deps.provider.mockReset().mockResolvedValue({ kind: "agency", agencyWorkspaceId: AGENCY });
    deps.filed.mockReset().mockResolvedValue({ id: "79000000-0000-4000-8000-0000000000b1" });
    deps.reconcile.mockReset().mockResolvedValue(0);
    changes = {
      list: vi.fn(async () => view), plan: vi.fn(async () => change), markDone: vi.fn(async () => change), decide: vi.fn(),
      recordCheck: vi.fn(async () => ({ change, release: { number: 3 } })), releaseUnconfirmed: vi.fn(async () => ({ change, release: { number: 4 } })),
      withdraw: vi.fn(async () => change), reviews: vi.fn(), forRequest: vi.fn(), releases: vi.fn(),
    } as unknown as ConnectedSiteChangesStore;
    setConnectedSiteChangesStoreForTests(changes);
    setConnectedSitesStoreForTests({ list: vi.fn(async () => [site]) } as unknown as ConnectedSitesStore);
  });
  afterEach(() => { vi.unstubAllEnvs(); setConnectedSiteChangesStoreForTests(null); setConnectedSitesStoreForTests(null); });

  it("does not exist while the flag is off, and reads nothing", async () => {
    expect((await get()).status).toBe(404);
    expect((await post({ action: "check", workspaceId: WS, systemId: SYSTEM, changeId: CHANGE })).status).toBe(404);
    expect(changes.list).not.toHaveBeenCalled();
    expect(changes.recordCheck).not.toHaveBeenCalled();
    expect(deps.flag).not.toHaveBeenCalled();
  });
  it("is off for a business whose own row is off", async () => {
    on();
    deps.flag.mockResolvedValue(false);
    expect((await get()).status).toBe(404);
    expect((await post({ action: "withdraw", workspaceId: WS, systemId: SYSTEM, changeId: CHANGE })).status).toBe(404);
    expect(changes.withdraw).not.toHaveBeenCalled();
  });
  it("reads the view with the builder's name and the owner-email switch (off)", async () => {
    on();
    const body = await (await get()).json();
    expect(body.view.site.platformLabel).toBe("Wix");
    expect(body.ownerEmail).toBe(false);
  });
  it("needs a confirmed session", async () => {
    on();
    deps.user = null;
    expect((await get()).status).toBe(401);
    expect((await post({ action: "withdraw", workspaceId: WS, systemId: SYSTEM, changeId: CHANGE })).status).toBe(401);
  });
  it("asks the agency and returns the fresh view", async () => {
    on();
    const response = await post({ action: "ask", workspaceId: WS, systemId: SYSTEM, words: "Change the banner", idempotencyKey: "k-1" });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ requestId: "79000000-0000-4000-8000-0000000000b1", view: { site: { platformLabel: "Wix" } } });
    expect(deps.filed.mock.calls[0]![1]).toMatchObject({ context: { source: "connected_site_change", origin: "owner" } });
  });
  it("says to bring in an agency when there is none", async () => {
    on();
    deps.provider.mockRejectedValue(new ServiceRequestConflictError("No active agency access is available for this business."));
    const response = await post({ action: "ask", workspaceId: WS, systemId: SYSTEM, words: "Change the banner", idempotencyKey: "k-1" });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Requests go to your agency. Bring in an agency first." });
  });
  it("has no decide action: an owner says yes only in Needs you", async () => {
    on();
    const response = await post({ action: "decide", workspaceId: WS, systemId: SYSTEM, changeId: CHANGE, decision: "approved" });
    expect(response.status).toBe(400);
    expect(changes.decide).not.toHaveBeenCalled();
  });
  it("rejects unknown keys", async () => {
    on();
    expect((await post({ action: "withdraw", workspaceId: WS, systemId: SYSTEM, changeId: CHANGE, extra: 1 })).status).toBe(400);
    expect((await post({ action: "done", workspaceId: WS, systemId: SYSTEM, changeId: CHANGE, decision: "approved" })).status).toBe(400);
  });
  it("marks done, checks the live page once and reports the Release", async () => {
    on();
    const response = await post({ action: "done", workspaceId: WS, systemId: SYSTEM, changeId: CHANGE, note: "published" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ release: { number: 3 } });
    expect(changes.markDone).toHaveBeenCalledTimes(1);
    expect(changes.recordCheck).toHaveBeenCalledTimes(1);
  });
  it("records without confirmation only through its own action", async () => {
    on();
    const response = await post({ action: "record_unconfirmed", workspaceId: WS, systemId: SYSTEM, changeId: CHANGE });
    expect(await response.json()).toMatchObject({ release: { number: 4 } });
  });
  it("rate limits the live check per change", async () => {
    on();
    deps.limited.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const response = await post({ action: "check", workspaceId: WS, systemId: SYSTEM, changeId: CHANGE });
    expect(response.status).toBe(429);
    expect(deps.limited).toHaveBeenLastCalledWith(`connected-site-change-check:${CHANGE}`, 10, 600_000);
    expect(changes.recordCheck).not.toHaveBeenCalled();
  });
  it("plans through the store and refuses a plan with a wrong key", async () => {
    on();
    vi.stubEnv("STRELVA_NEEDS_YOU_RELEASE", "1");
    const plan = { pageUrl: "https://bakery.example/hours", whatToChange: "Update hours", expectText: "Open Saturday 9-2", ownerFacing: false };
    expect((await post({ action: "plan", workspaceId: WS, systemId: SYSTEM, siteId: SITE, plan })).status).toBe(200);
    expect(changes.plan).toHaveBeenCalledTimes(1);
    expect((await post({ action: "plan", workspaceId: WS, systemId: SYSTEM, siteId: SITE, plan: { ...plan, extra: 1 } })).status).toBe(400);
  });
});
