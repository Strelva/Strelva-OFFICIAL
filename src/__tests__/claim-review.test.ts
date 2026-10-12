import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), session: vi.fn(), rate: vi.fn(), seed: vi.fn(), assess: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.rate }));
vi.mock("@/products/agency-clients/seed", async (load) => ({ ...(await load<typeof import("@/products/agency-clients/seed")>()), seedFromSite: mocks.seed }));
vi.mock("@/products/ai-visibility/usecase", () => ({ runPrivateAiVisibilityAssessment: mocks.assess }));

import { POST as agencyClients } from "@/app/api/workspace/agency-clients/route";
import { POST as plainAccept } from "@/app/api/workspace-claims/[token]/route";
import { GET as reviewGet, POST as reviewPost } from "@/app/api/workspace-claims/[token]/review/route";
import { addAgencyClient, claimAreaConsentText, claimReviewReleaseEnabled, type AgencyClientDeps } from "@/products/agency-clients/server";
import { foundFromCrawl, parseFoundHours } from "@/products/agency-clients/seed";
import { extractBusinessFacts } from "@/products/websites/server";
import type { FoundFactInput } from "@/products/agency-clients/contracts";

const AGENCY = "a9300000-0000-4000-8000-000000000020";
const CLIENT = "a9300000-0000-4000-8000-000000000010";
const KEY = "a9300000-0000-4000-8000-0000000000c1";
const TOKEN = "r".repeat(43);
const ORIGIN = "https://app.strelva.com";
const FOUND_ID = "a9300000-0000-4000-8000-0000000000f2";
const actor = { userId: "a9300000-0000-4000-8000-000000000001", verifiedEmail: "lead@north.example.test" };

const receipt = (overrides: Record<string, unknown> = {}) => ({ additionId: "a9300000-0000-4000-8000-0000000000d1", agencyWorkspaceId: AGENCY, customerWorkspaceId: CLIENT,
  name: "Northside Bakery", sourceKind: "url", sourceUrl: "https://northside-bakery.example/", prospectId: null, factsSeeded: 2,
  seatId: "a9300000-0000-4000-8000-0000000000e1", addedBy: actor.userId, addedAt: "2026-10-12T12:00:00.000Z", replayed: false, ...overrides });
const found: FoundFactInput[] = [
  { entity: "fact", key: "phone", value: "(716) 555-0142", sourceUrl: "https://northside-bakery.example/contact", quote: "Call (716) 555-0142" },
  { entity: "service", value: { name: "Custom cakes" }, sourceUrl: "https://northside-bakery.example/services", quote: "Custom cakes" },
];
const seed = { scan: { status: "scanned" as const, seeded: ["phone"], name: "Northside Bakery", message: null }, facts: { phone: { value: "(716) 555-0142" } }, found };
const review = { status: "pending", workspaceId: CLIENT, workspaceName: "Northside Bakery", agencyWorkspaceId: AGENCY, agencyName: "North Studio",
  found: [{ id: FOUND_ID, entity: "fact", key: "phone", value: "(716) 555-0142", sourceUrl: "https://northside-bakery.example/contact", quote: "Call (716) 555-0142" }],
  prepared: [{ id: "a9300000-0000-4000-8000-0000000000a9", name: "Order form", kind: "intake" }], fullControlTaken: [] };
const areas = { website: "full_control", inquiries: "none", bookings: "prepare", google: "prepare", internal_tools: "none" } as const;

function deps(map: Record<string, { data?: unknown; error?: { message: string } }>, claimReview: boolean | undefined) {
  const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) => ({ data: map[name]?.data ?? (name === "authorize_agency_client_add" ? "owner" : null), error: map[name]?.error ?? null }));
  return { rpc, seed: vi.fn(async () => seed), token: () => "t".repeat(43), now: () => new Date("2026-10-12T12:00:00.000Z"),
    assess: vi.fn(async () => { throw new Error("not run"); }), ...(claimReview === undefined ? {} : { claimReview: () => claimReview }) } satisfies AgencyClientDeps;
}
const staged = { data: { staged: 2, waiting: 2, preparing: ["bookings", "google", "inquiries", "internal_tools", "website"] } };
const names = (d: ReturnType<typeof deps>) => d.rpc.mock.calls.map(([name]) => name);

describe("claim review release", () => {
  it("is off unless the workspace, add-client and claim review flags are all exactly on", () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    expect(claimReviewReleaseEnabled({ STRELVA_AGENCY_ADD_CLIENT_RELEASE: "1" })).toBe(false);
    expect(claimReviewReleaseEnabled({ STRELVA_AGENCY_ADD_CLIENT_RELEASE: "1", STRELVA_CLAIM_REVIEW_RELEASE: "true" })).toBe(false);
    expect(claimReviewReleaseEnabled({ STRELVA_CLAIM_REVIEW_RELEASE: "1" })).toBe(false);
    expect(claimReviewReleaseEnabled({ STRELVA_AGENCY_ADD_CLIENT_RELEASE: "1", STRELVA_CLAIM_REVIEW_RELEASE: "1" })).toBe(true);
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0");
    expect(claimReviewReleaseEnabled({ STRELVA_AGENCY_ADD_CLIENT_RELEASE: "1", STRELVA_CLAIM_REVIEW_RELEASE: "1" })).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe("addAgencyClient with and without the claim review", () => {
  it("flag off (negative control): seeds the record as before and stages nothing", async () => {
    for (const off of [undefined, false]) {
      const d = deps({ agency_add_client: { data: receipt() } }, off);
      const result = await addAgencyClient(actor, { action: "add", agencyWorkspaceId: AGENCY, url: "northside-bakery.example", idempotencyKey: KEY }, d);
      expect((d.rpc.mock.calls.find(([name]) => name === "agency_add_client")![1].p_input as { facts: unknown }).facts).toEqual(seed.facts);
      expect(names(d)).not.toContain("stage_agency_client_found_facts");
      expect(result).not.toHaveProperty("found");
    }
  });

  it("flag on: found facts wait for the owner instead of entering the record, and the agency prepares every area", async () => {
    const d = deps({ agency_add_client: { data: receipt() }, stage_agency_client_found_facts: staged }, true);
    const result = await addAgencyClient(actor, { action: "add", agencyWorkspaceId: AGENCY, url: "northside-bakery.example", idempotencyKey: KEY }, d);
    expect((d.rpc.mock.calls.find(([name]) => name === "agency_add_client")![1].p_input as { facts: unknown }).facts).toEqual({});
    const stage = d.rpc.mock.calls.find(([name]) => name === "stage_agency_client_found_facts")![1];
    expect(stage).toMatchObject({ p_agency_workspace_id: AGENCY, p_customer_workspace_id: CLIENT, p_found: found });
    expect(JSON.stringify(stage.p_found)).not.toContain("verified");
    expect(result.found).toEqual({ status: "staged", ...staged.data });
  });

  it("flag on: a replayed add restages safely, a client without a website still gets pre-claim Prepare, and a staging failure keeps the client", async () => {
    const replay = deps({ agency_add_client: { data: receipt({ replayed: true }) }, stage_agency_client_found_facts: staged }, true);
    await addAgencyClient(actor, { action: "add", agencyWorkspaceId: AGENCY, url: "northside-bakery.example", idempotencyKey: KEY }, replay);
    expect(names(replay)).toContain("stage_agency_client_found_facts");

    const noSite = deps({ agency_add_client: { data: receipt({ sourceUrl: null }) }, stage_agency_client_found_facts: staged }, true);
    await addAgencyClient(actor, { action: "add", agencyWorkspaceId: AGENCY, name: "Northside Bakery", idempotencyKey: KEY }, noSite);
    expect(noSite.rpc.mock.calls.find(([name]) => name === "stage_agency_client_found_facts")![1].p_found).toEqual([]);

    const failed = deps({ agency_add_client: { data: receipt() }, stage_agency_client_found_facts: { error: { message: "connection reset" } } }, true);
    const result = await addAgencyClient(actor, { action: "add", agencyWorkspaceId: AGENCY, url: "northside-bakery.example", idempotencyKey: KEY }, failed);
    expect(result.client.customerWorkspaceId).toBe(CLIENT);
    expect(result.found).toMatchObject({ status: "unavailable", staged: 0 });
  });
});

describe("found facts from the same crawl", () => {
  const page = (url: string, html: string, links: Array<{ url: string; text: string }> = []) => ({ url, sourceId: `src_${url.length}`, html, visibleText: "", title: "Northside Bakery", headings: [], links, assets: [] });
  const crawl = { pages: [
    page("https://northside-bakery.example/", `<html><head><title>Northside Bakery</title><meta name="description" content="A neighborhood bakery on Elmwood Avenue in Buffalo."><script type="application/ld+json">${JSON.stringify({ "@type": "Bakery", name: "Northside Bakery", telephone: "(716) 555-0142", openingHours: "Mo-Fr 07:00-15:00",
      employee: { "@type": "Person", name: "Pat Baker" }, makesOffer: { "@type": "Offer", name: "Custom cakes" } })}</script></head><body><main><p>Fresh bread daily since 1998.</p></main></body></html>`,
      [{ url: "https://www.instagram.com/northsidebakery", text: "Instagram" }, { url: "https://www.facebook.com/sharer/sharer.php?u=x", text: "Share" }]),
  ], skipped: [], assets: [], crawledAt: "2026-10-12T12:00:00.000Z", bytes: 1000, elapsedMs: 10, limited: false };

  it("keeps services, people, hours, description and social links, each with the page and words it came from", () => {
    const facts = extractBusinessFacts({ url: "https://northside-bakery.example/" }, crawl);
    const result = foundFromCrawl("https://northside-bakery.example/", facts, crawl);
    const byKey = (key: string) => result.find((item) => item.entity === "fact" && item.key === key);
    expect(byKey("phone")).toMatchObject({ value: "(716) 555-0142", sourceUrl: "https://northside-bakery.example/" });
    expect(byKey("hours")?.value).toEqual({ weekly: [1, 2, 3, 4, 5].map((day) => ({ day, opens: "07:00", closes: "15:00" })) });
    expect(byKey("hours")).not.toHaveProperty("value.timezone");
    expect(byKey("description")).toMatchObject({ value: "A neighborhood bakery on Elmwood Avenue in Buffalo." });
    expect(byKey("links")?.value).toEqual([{ kind: "website", url: "https://northside-bakery.example/" }, { kind: "instagram", url: "https://www.instagram.com/northsidebakery" }]);
    expect(result).toContainEqual(expect.objectContaining({ entity: "service", value: { name: "Custom cakes" } }));
    expect(result).toContainEqual(expect.objectContaining({ entity: "person", value: { name: "Pat Baker" } }));
    for (const item of result) { expect(item.sourceUrl).toMatch(/^https:\/\//); expect(item.quote.length).toBeGreaterThan(0); }
  });

  it("reads common written hours and leaves anything unclear out", () => {
    expect(parseFoundHours(["Monday - Wednesday 9am - 5pm", "Sa 10:00-14:00"])).toEqual([
      { day: 1, opens: "09:00", closes: "17:00" }, { day: 2, opens: "09:00", closes: "17:00" }, { day: 3, opens: "09:00", closes: "17:00" }, { day: 6, opens: "10:00", closes: "14:00" }]);
    expect(parseFoundHours(["By appointment", "Mo 17:00-09:00"])).toEqual([]);
  });
});

describe("claim review routes", () => {
  const get = () => new Request(`${ORIGIN}/api/workspace-claims/${TOKEN}/review`);
  const post = (path: string, body: unknown) => new Request(`${ORIGIN}${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", origin: ORIGIN } });
  const context = { params: Promise.resolve({ token: TOKEN }) };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_AGENCY_ADD_CLIENT_RELEASE", "1");
    vi.stubEnv("STRELVA_CLAIM_REVIEW_RELEASE", "1");
    mocks.session.mockResolvedValue({ id: "a9300000-0000-4000-8000-000000000009", email: "pat@northside-bakery.example", email_confirmed_at: "2026-10-12" });
    mocks.rate.mockResolvedValue(false);
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "read_agency_client_claim_review" ? review
      : name === "accept_agency_client_claim_review" ? { workspaceId: CLIENT, workspaceName: "Northside Bakery", status: "accepted", alreadyAccepted: false, areas, facts: { confirmed: 1, changed: 0, removed: 0, waiting: 0 } } : null, error: null }));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("flag off (negative control): the review is not there and the plain claim still works", async () => {
    vi.stubEnv("STRELVA_CLAIM_REVIEW_RELEASE", "");
    expect((await reviewGet(get(), context)).status).toBe(404);
    expect((await reviewPost(post(`/api/workspace-claims/${TOKEN}/review`, { facts: [], areas }), context)).status).toBe(404);
    mocks.rpc.mockResolvedValue({ data: { workspaceId: CLIENT, workspaceName: "Northside Bakery", status: "accepted", alreadyAccepted: false }, error: null });
    expect((await plainAccept(post(`/api/workspace-claims/${TOKEN}`, {}), context)).status).toBe(200);
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(["accept_agency_client_owner_claim"]);
  });

  it("flag on: the plain claim can't skip the per-area decision", async () => {
    const response = await plainAccept(post(`/api/workspace-claims/${TOKEN}`, {}), context);
    expect(response.status).toBe(409);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("shows the review only to a signed-in account", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await reviewGet(get(), context)).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps a different signed-in account to the recipient refusal", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "agency_client_claim_recipient_mismatch" } });
    const response = await reviewGet(get(), context);
    expect(response.status).toBe(403);
  });

  it("records consent per area in the owner's words, never for an area left out", async () => {
    const response = await reviewPost(post(`/api/workspace-claims/${TOKEN}/review`, { facts: [{ id: FOUND_ID, decision: "confirm" }], areas }), context);
    expect(response.status).toBe(200);
    const args = mocks.rpc.mock.calls.find(([name]) => name === "accept_agency_client_claim_review")![1];
    expect(args.p_areas).toEqual(areas);
    expect(Object.keys(args.p_consents).sort()).toEqual(["bookings", "google", "website"]);
    expect(args.p_consents.website).toBe(claimAreaConsentText("North Studio", "Northside Bakery", "website", "full_control"));
    expect(args.p_consents.google).toContain("Nothing goes live until I approve it.");
    for (const text of Object.values(args.p_consents) as string[]) expect(text).toContain("I keep payment, adding and ending agencies, my data and leaving Strelva.");
    expect(args.p_facts).toEqual([{ id: FOUND_ID, decision: "confirm" }]);
  });

  it("refuses a malformed choice before claiming anything", async () => {
    const response = await reviewPost(post(`/api/workspace-claims/${TOKEN}/review`, { facts: [], areas: { ...areas, website: "admin" } }), context);
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    const missing = await reviewPost(post(`/api/workspace-claims/${TOKEN}/review`, { facts: [], areas: { website: "prepare" } }), context);
    expect(missing.status).toBe(400);
  });

  it("the agency add route stays as before with the claim review flag on but add-client off", async () => {
    vi.stubEnv("STRELVA_AGENCY_ADD_CLIENT_RELEASE", "");
    const response = await agencyClients(post("/api/workspace/agency-clients", { action: "add", agencyWorkspaceId: AGENCY, url: "northside-bakery.example", idempotencyKey: KEY }));
    expect(response.status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
