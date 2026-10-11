import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectedSitesStore } from "@/products/connected-sites/store";

const deps = vi.hoisted(() => ({ limited: vi.fn(), spam: vi.fn(), notify: vi.fn(), flag: vi.fn() }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedAsync: deps.limited, rateLimitKey: (_req: Request, prefix: string) => prefix }));
vi.mock("@/lib/lead-spam", () => ({ scoreLeadSpam: deps.spam }));
vi.mock("@/platform/infra/pinned-public-text", () => ({ fetchPinnedPublicText: async () => '<script type="application/ld+json">{"@type":"LocalBusiness","url":"https://www.fictional-bakery.example/","name":"Old Bakery"}</script>' }));
vi.mock("@/products/connected-sites/notify", () => ({ notifyConnectedSiteInquiry: deps.notify }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/platform/release-flags/store", () => ({ workspaceReleaseFlagEnabled: deps.flag }));

import { setConnectedSitesStoreForTests } from "@/products/connected-sites/store";
import { POST as postInquiry, OPTIONS } from "@/app/api/v1/connect/[siteKey]/inquiries/route";
import { POST as postEvents } from "@/app/api/v1/connect/[siteKey]/events/route";
import { GET as getContext } from "@/app/api/v1/connect/[siteKey]/context/route";

const KEY = "sk_pub_abcdefghijklmnopqrstuvwx";
const ORIGIN = "https://www.fictional-bakery.example";
const site = { id: "78000000-0000-4000-8000-000000000003", workspaceId: "78000000-0000-4000-8000-000000000002", siteUrl: `${ORIGIN}/`, siteHost: "www.fictional-bakery.example", allowedOrigins: [ORIGIN, "https://fictional-bakery.example"], captureForms: true, injectSchema: true, verified: true };
let store: ConnectedSitesStore;
const params = (siteKey = KEY) => ({ params: Promise.resolve({ siteKey }) });
const inquiry = (body: unknown = { id: "inq12345678", capture: "strelva-form", fields: { name: "Pat", email: "pat@example.test", message: "Hi" } }, origin: string | null = ORIGIN) =>
  postInquiry(new Request(`https://app.strelva.test/api/v1/connect/${KEY}/inquiries`, { method: "POST", headers: { "content-type": "text/plain", ...(origin ? { origin } : {}) }, body: JSON.stringify(body) }), params());

describe("public connect routes", () => {
  beforeEach(() => {
    vi.stubEnv("STRELVA_CONNECTED_SITES_RELEASE", "1");
    deps.limited.mockReset().mockResolvedValue(false);
    deps.spam.mockReset().mockReturnValue({ isSpam: false, score: 0, signals: [] });
    deps.notify.mockReset().mockResolvedValue("sent");
    deps.flag.mockReset().mockResolvedValue(true);
    store = {
      resolve: vi.fn(async () => site), context: vi.fn(async () => ({ revision: 1, facts: { display_name: "Fictional Bakery" }, services: [], site: { captureForms: true, injectSchema: true } })),
      recordEvents: vi.fn(async () => 1), recordInquiry: vi.fn(async () => ({ status: "recorded" as const, id: "78000000-0000-4000-8000-0000000000aa", workspaceId: site.workspaceId })),
      recordSchemaConflict: vi.fn(async () => ({})),
      recordSpam: vi.fn(async () => ({ status: "recorded" as const })),
    } as unknown as ConnectedSitesStore;
    setConnectedSitesStoreForTests(store);
  });
  afterEach(() => { vi.unstubAllEnvs(); setConnectedSitesStoreForTests(null); });

  it("is off unless the release is on", async () => {
    vi.stubEnv("STRELVA_CONNECTED_SITES_RELEASE", "0");
    expect((await inquiry()).status).toBe(503);
    expect((await getContext(new Request(`https://app.strelva.test/api/v1/connect/${KEY}/context`), params())).status).toBe(503);
  });
  it("is gated per business: the site key's business row decides, and an off business stores nothing", async () => {
    expect((await inquiry()).status).toBe(201);
    expect(deps.flag).toHaveBeenCalledWith("connected_sites", site.workspaceId, { operator: true, tester: false });
    deps.flag.mockResolvedValue(false);
    (store.recordInquiry as ReturnType<typeof vi.fn>).mockClear();
    expect((await inquiry()).status).toBe(503);
    expect((await postEvents(new Request(`https://app.strelva.test/api/v1/connect/${KEY}/events`, { method: "POST", headers: { origin: ORIGIN }, body: JSON.stringify({ events: [{ id: "e1", kind: "visit" }] }) }), params())).status).toBe(503);
    expect((await getContext(new Request(`https://app.strelva.test/api/v1/connect/${KEY}/context`), params())).status).toBe(503);
    expect(store.recordInquiry).not.toHaveBeenCalled();
    expect(store.recordEvents).not.toHaveBeenCalled();
    // A failed flag read fails closed.
    deps.flag.mockRejectedValue(new Error("db down"));
    expect((await inquiry()).status).toBe(503);
  });
  it("workspace mode: on only where the business row turns it on", async () => {
    vi.stubEnv("STRELVA_CONNECTED_SITES_RELEASE", "workspace");
    expect((await inquiry()).status).toBe(201);
    deps.flag.mockResolvedValue(false);
    expect((await inquiry()).status).toBe(503);
  });
  it("records an inquiry from the verified site's own origin and tells the owner", async () => {
    const response = await inquiry();
    expect(response.status).toBe(201);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await response.json()).toEqual({ ok: true, id: "78000000-0000-4000-8000-0000000000aa" });
    expect(store.recordInquiry).toHaveBeenCalledWith(KEY, ORIGIN, expect.objectContaining({ leadId: "lead_inq12345678" }));
    expect(deps.notify).toHaveBeenCalledOnce();
  });
  it("refuses no Origin, another Origin, an unverified site and an unknown key, storing nothing", async () => {
    expect((await inquiry(undefined, null)).status).toBe(403);
    expect((await inquiry(undefined, "https://evil.example")).status).toBe(403);
    (store.resolve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ...site, verified: false });
    expect((await inquiry()).status).toBe(403);
    (store.resolve as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    expect((await inquiry()).status).toBe(404);
    expect((await postInquiry(new Request("https://app.strelva.test/x", { method: "POST", headers: { origin: ORIGIN }, body: "{}" }), params("not-a-key"))).status).toBe(404);
    expect(store.recordInquiry).not.toHaveBeenCalled();
  });
  it("answers spam and honeypots like a success while holding or dropping them", async () => {
    deps.spam.mockReturnValue({ isSpam: true, score: 5, signals: ["random"] });
    const held = await inquiry();
    expect(held.status).toBe(201);
    expect(store.recordSpam).toHaveBeenCalledOnce(); expect(store.recordInquiry).not.toHaveBeenCalled();
    const trap = await inquiry({ id: "inq12345679", capture: "strelva-form", _hp: "x", fields: { email: "pat@example.test" } });
    expect(trap.status).toBe(201); expect(store.recordInquiry).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
  });
  it("reports a replay as a duplicate and rejects bad bodies", async () => {
    (store.recordInquiry as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ status: "exists", id: "78000000-0000-4000-8000-0000000000aa", workspaceId: site.workspaceId });
    const replay = await inquiry();
    expect(replay.status).toBe(200); expect(await replay.json()).toMatchObject({ duplicate: true });
    expect((await inquiry({ id: "x", capture: "strelva-form", fields: {} })).status).toBe(400);
    expect((await postInquiry(new Request("https://app.strelva.test/x", { method: "POST", headers: { origin: ORIGIN }, body: "x".repeat(20_000) }), params())).status).toBe(413);
  });
  it("fails closed when the inquiry limiter is down, but beacons fail open", async () => {
    deps.limited.mockRejectedValue(new Error("redis down"));
    expect((await inquiry()).status).toBe(429);
    const events = await postEvents(new Request("https://app.strelva.test/x", { method: "POST", headers: { origin: ORIGIN }, body: JSON.stringify({ events: [{ id: "evt12345678", kind: "visit" }] }) }), params());
    expect(events.status).toBe(202); expect(await events.json()).toEqual({ accepted: 1 });
  });
  it("accepts additive schema-only reports with the same host gates, default off and no notification", async () => {
    const body = { events: [], platformSchema: { present: true } };
    const request = (origin = ORIGIN) => new Request(`https://app.strelva.test/api/v1/connect/${KEY}/events`, { method: "POST", headers: { origin }, body: JSON.stringify(body) });
    vi.stubEnv("STRELVA_CONNECTED_SITE_SCHEMA_CONFLICTS_RELEASE", "0");
    expect(await (await postEvents(request(), params())).json()).toEqual({ accepted: 0 });
    expect(store.context).not.toHaveBeenCalled();
    expect(store.recordSchemaConflict).not.toHaveBeenCalled();
    vi.stubEnv("STRELVA_CONNECTED_SITE_SCHEMA_CONFLICTS_RELEASE", "1");
    expect((await postEvents(request(), params())).status).toBe(202);
    expect(store.recordSchemaConflict).toHaveBeenCalledWith(KEY, ORIGIN, expect.objectContaining({ sourceId: site.id, route: "owner_decides", sourceLifecycle: "connected_site_schema" }));
    expect(deps.notify).not.toHaveBeenCalled();
    expect(store.recordEvents).not.toHaveBeenCalled();
    expect((await postEvents(request("https://evil.example"), params())).status).toBe(403);
    vi.mocked(store.resolve).mockResolvedValueOnce({ ...site, verified: false });
    expect((await postEvents(request(), params())).status).toBe(403);
    expect(store.recordSchemaConflict).toHaveBeenCalledTimes(1);
  });
  it("serves the context to anyone, cached for a minute", async () => {
    const response = await getContext(new Request(`https://app.strelva.test/api/v1/connect/${KEY}/context`), params());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60, s-maxage=60");
    expect((await response.json()).facts).toEqual({ name: "Fictional Bakery" });
    expect((await OPTIONS()).status).toBe(204);
  });
});
