import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  acceptOwnerClaim,
  addAgencyClient,
  AgencyClientError,
  agencyAddClientReleaseEnabled,
  deliverOwnerClaim,
  issueAgencyClientOwnerClaim,
  readOwnerClaim,
  type AgencyClientDeps,
} from "@/products/agency-clients/server";
import { seedFromSite } from "@/products/agency-clients/seed";
import { WebsiteCrawlError } from "@/products/websites/server";

const AGENCY = "a9000000-0000-4000-8000-000000000020";
const CLIENT = "a9000000-0000-4000-8000-000000000010";
const PROSPECT = "a9000000-0000-4000-8000-0000000000a1";
const KEY = "a9000000-0000-4000-8000-0000000000c1";
const actor = { userId: "a9000000-0000-4000-8000-000000000001", verifiedEmail: "Owner@Agency.example.test " };
const TOKEN = "t".repeat(43);

const receipt = (overrides: Record<string, unknown> = {}) => ({
  additionId: "a9000000-0000-4000-8000-0000000000d1", agencyWorkspaceId: AGENCY, customerWorkspaceId: CLIENT, name: "Northside Bakery",
  sourceKind: "url", sourceUrl: "https://northside-bakery.example/", prospectId: null, factsSeeded: 4,
  seatId: "a9000000-0000-4000-8000-0000000000e1", addedBy: actor.userId, addedAt: "2026-10-07T12:00:00.000Z", replayed: false, ...overrides,
});
const claim = { claimId: "a9000000-0000-4000-8000-0000000000f1", customerWorkspaceId: CLIENT, workspaceName: "Northside Bakery",
  recipientEmail: "pat@northside-bakery.example", delivery: { status: "not_sent", reason: "gated", decision: "R08", agencyEmailVerified: false },
  expiresAt: "2026-10-21T12:00:00.000Z", createdAt: "2026-10-07T12:00:00.000Z", replacedPending: false };

function deps(responses: Record<string, { data?: unknown; error?: { message: string } }> = {}, seed?: AgencyClientDeps["seed"]) {
  const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) => ({ data: responses[name]?.data ?? (name === "authorize_agency_client_add" ? "owner" : null), error: responses[name]?.error ?? null }));
  const seedFn = vi.fn(seed ?? (async () => ({ scan: { status: "scanned" as const, seeded: ["phone", "email"], name: "Northside Bakery & Cafe", message: null },
    facts: { phone: { value: "(716) 555-0142" }, email: { value: "hello@northside-bakery.example" } } })));
  return { rpc, seed: seedFn, token: () => TOKEN, now: () => new Date("2026-10-07T12:00:00.000Z") } satisfies AgencyClientDeps;
}

describe("agency add client release", () => {
  it("is off unless both the workspace release and its own flag are on", () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    expect(agencyAddClientReleaseEnabled({})).toBe(false);
    expect(agencyAddClientReleaseEnabled({ STRELVA_AGENCY_ADD_CLIENT_RELEASE: "true" })).toBe(false);
    expect(agencyAddClientReleaseEnabled({ STRELVA_AGENCY_ADD_CLIENT_RELEASE: "1" })).toBe(true);
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0");
    expect(agencyAddClientReleaseEnabled({ STRELVA_AGENCY_ADD_CLIENT_RELEASE: "1" })).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe("addAgencyClient", () => {
  it("refuses unauthorized actors before prospect reads or any crawl", async () => {
    const d = deps({ authorize_agency_client_add: { error: { message: "agency_client_access_denied" } } });
    await expect(addAgencyClient(actor, { action: "add", agencyWorkspaceId: AGENCY,
      prospectId: PROSPECT, url: "https://example.com", idempotencyKey: KEY }, d)).rejects.toMatchObject({ status: 403 });
    expect(d.seed).not.toHaveBeenCalled();
    expect(d.rpc.mock.calls.map(([name]) => name)).toEqual(["authorize_agency_client_add"]);
  });
  it("fails closed before crawling when admission storage is unavailable", async () => {
    const d = deps({ authorize_agency_client_add: { error: { message: "database unavailable" } } });
    await expect(addAgencyClient(actor, { action: "add", agencyWorkspaceId: AGENCY,
      url: "https://example.com", idempotencyKey: KEY }, d)).rejects.toMatchObject({ status: 503 });
    expect(d.seed).not.toHaveBeenCalled();
  });
  it("adds from a URL with unconfirmed scanned facts, then issues an owner link that is never sent", async () => {
    const d = deps({ agency_add_client: { data: receipt() }, issue_agency_client_owner_claim: { data: claim } });
    const result = await addAgencyClient(actor, { action: "add", agencyWorkspaceId: AGENCY, url: "northside-bakery.example", name: "Northside Bakery",
      ownerEmail: "pat@northside-bakery.example", idempotencyKey: KEY }, d);

    expect(d.seed).toHaveBeenCalledWith("https://northside-bakery.example/");
    const [name, args] = d.rpc.mock.calls[1]!;
    expect(name).toBe("agency_add_client");
    expect(args).toMatchObject({
      p_user_id: actor.userId, p_verified_email: "owner@agency.example.test", p_agency_workspace_id: AGENCY, p_command_id: KEY,
      p_input: { name: "Northside Bakery", sourceUrl: "https://northside-bakery.example/", prospectId: null,
        facts: { phone: { value: "(716) 555-0142" }, email: { value: "hello@northside-bakery.example" } } },
    });
    // No fact is ever sent as verified.
    expect(JSON.stringify(args)).not.toContain("verified\":true");
    expect(args).toHaveProperty("p_command_digest", createHash("sha256").update(JSON.stringify([AGENCY, "Northside Bakery", "https://northside-bakery.example/", null])).digest("hex"));

    const [claimName, claimArgs] = d.rpc.mock.calls[2]!;
    expect(claimName).toBe("issue_agency_client_owner_claim");
    expect(claimArgs).toMatchObject({ p_customer_workspace_id: CLIENT, p_recipient_email: "pat@northside-bakery.example",
      p_token_hash: createHash("sha256").update(TOKEN).digest("hex"), p_expires_at: "2026-10-21T12:00:00.000Z" });
    expect(result.ownerClaim).toMatchObject({ claimPath: `/workspace/claim/${TOKEN}`, delivery: { status: "not_sent", reason: "gated" } });
    expect(result.website).toEqual({
      connect: `/workspace/site?workspaceId=${CLIENT}&entry=connect`,
      rebuild: `/workspace/site?workspaceId=${CLIENT}&entry=rebuild`,
      rebuildOpenToAgency: true,
    });
    expect(result.scan.seeded).toEqual(["phone", "email"]);
  });

  it("names the business from the site when the agency left the name blank", async () => {
    const d = deps({ agency_add_client: { data: receipt({ name: "Northside Bakery & Cafe" }) } });
    await addAgencyClient(actor, { action: "add", agencyWorkspaceId: AGENCY, url: "https://northside-bakery.example", idempotencyKey: KEY }, d);
    expect(d.rpc.mock.calls[1]![1]).toMatchObject({ p_input: { name: "Northside Bakery & Cafe" } });
  });

  it("adds a prospect from the agency's own list, using its business and website", async () => {
    const d = deps({
      agency_prospect_list: { data: [{ id: PROSPECT, business: "Lakeview Dental", url: "https://lakeview-dental.example", email: "dr@lakeview-dental.example", name: "Dr. Lee" }] },
      agency_add_client: { data: receipt({ sourceKind: "prospect", prospectId: PROSPECT, name: "Lakeview Dental" }) },
    });
    await addAgencyClient(actor, { action: "add", agencyWorkspaceId: AGENCY, prospectId: PROSPECT, idempotencyKey: KEY }, d);
    expect(d.rpc.mock.calls[1]).toEqual(["agency_prospect_list", { p_workspace_id: AGENCY, p_user_id: actor.userId, p_email: actor.verifiedEmail }]);
    expect(d.seed).toHaveBeenCalledWith("https://lakeview-dental.example/");
    expect(d.rpc.mock.calls[2]![1]).toMatchObject({ p_input: { name: "Lakeview Dental", prospectId: PROSPECT, sourceUrl: "https://lakeview-dental.example/" } });
  });

  it("refuses a prospect outside the agency's list before creating anything", async () => {
    const d = deps({ agency_prospect_list: { data: [] } });
    await expect(addAgencyClient(actor, { action: "add", agencyWorkspaceId: AGENCY, prospectId: PROSPECT, idempotencyKey: KEY }, d))
      .rejects.toMatchObject({ status: 404, code: "agency_client_prospect_not_found" });
    expect(d.rpc.mock.calls.map(([name]) => name)).toEqual(["authorize_agency_client_add", "agency_prospect_list"]);
  });

  it.each(["http://localhost:3000", "https://127.0.0.1", "https://169.254.169.254/latest", "javascript:alert(1)", "https://user:pass@example.com"])("refuses a non-public URL %s in production without fetching or writing", async (url) => {
    vi.stubEnv("NODE_ENV", "production");
    const d = deps();
    await expect(addAgencyClient(actor, { action: "add", agencyWorkspaceId: AGENCY, url, name: "X", idempotencyKey: KEY }, d)).rejects.toMatchObject({ status: 400 });
    expect(d.seed).not.toHaveBeenCalled();
    expect(d.rpc).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("adds by name alone and reads nothing", async () => {
    const d = deps({ agency_add_client: { data: receipt({ sourceUrl: null }) } });
    const result = await addAgencyClient(actor, { action: "add", agencyWorkspaceId: AGENCY, name: "Corner Barber", idempotencyKey: KEY }, d);
    expect(d.seed).not.toHaveBeenCalled();
    expect(result.scan.status).toBe("not_requested");
    expect(d.rpc.mock.calls[1]![1]).toMatchObject({ p_input: { name: "Corner Barber", sourceUrl: null, facts: {} } });
  });

  it.each([
    ["agency_client_access_denied", 403],
    ["agency_client_daily_limit", 429],
    ["agency_client_waiting_limit", 429],
    ["agency_client_prospect_added", 409],
    ["agency_client_idempotency_conflict", 409],
    ["something else", 503],
  ])("maps the database refusal %s to %i", async (code, status) => {
    const d = deps({ agency_add_client: { error: { message: code } } });
    const error = await addAgencyClient(actor, { action: "add", agencyWorkspaceId: AGENCY, name: "X", idempotencyKey: KEY }, d).catch((cause) => cause);
    expect(error).toBeInstanceOf(AgencyClientError);
    expect(error.status).toBe(status);
  });

  it("on replay returns the saved client, seeds nothing new and issues no second link", async () => {
    const d = deps({ agency_add_client: { data: receipt({ replayed: true }) } });
    const result = await addAgencyClient(actor, { action: "add", agencyWorkspaceId: AGENCY, url: "northside-bakery.example", name: "Northside Bakery",
      ownerEmail: "pat@northside-bakery.example", idempotencyKey: KEY }, d);
    expect(result.client.replayed).toBe(true);
    expect(result.scan.seeded).toEqual([]);
    expect(result.ownerClaim).toBeNull();
    expect(d.rpc.mock.calls.map(([name]) => name)).toEqual(["authorize_agency_client_add", "agency_add_client"]);
  });

  it("keeps the added client when its owner link fails, and says so", async () => {
    const d = deps({ agency_add_client: { data: receipt() }, issue_agency_client_owner_claim: { error: { message: "agency_client_claim_invalid" } } });
    const result = await addAgencyClient(actor, { action: "add", agencyWorkspaceId: AGENCY, name: "Northside Bakery", ownerEmail: "pat@northside-bakery.example", idempotencyKey: KEY }, d);
    expect(result.client.customerWorkspaceId).toBe(CLIENT);
    expect(result.ownerClaim).toBeNull();
    expect(result.ownerClaimError).toBe("Check the owner's email address.");
  });

  it("rejects a malformed database answer instead of trusting it", async () => {
    const d = deps({ agency_add_client: { data: { customerWorkspaceId: CLIENT } } });
    await expect(addAgencyClient(actor, { action: "add", agencyWorkspaceId: AGENCY, name: "X", idempotencyKey: KEY }, d)).rejects.toMatchObject({ status: 503, code: "malformed" });
  });
});

describe("owner claim link", () => {
  it("is recorded not sent, and the send seam sends nothing", async () => {
    const d = deps({ issue_agency_client_owner_claim: { data: claim } });
    const issued = await issueAgencyClientOwnerClaim(actor, { action: "owner_link", agencyWorkspaceId: AGENCY, customerWorkspaceId: CLIENT, ownerEmail: "pat@northside-bakery.example" }, d);
    expect(deliverOwnerClaim(issued)).toEqual(claim.delivery);
    expect(d.rpc).toHaveBeenCalledTimes(1);
  });

  it("checks the token shape before asking the database", async () => {
    const d = deps();
    await expect(readOwnerClaim("short", d)).rejects.toMatchObject({ status: 404 });
    await expect(acceptOwnerClaim(actor, "../../etc", d)).rejects.toMatchObject({ status: 404 });
    expect(d.rpc).not.toHaveBeenCalled();
  });

  it("accepts with the hashed token and the verified identity, and maps a wrong account", async () => {
    const d = deps({ accept_agency_client_owner_claim: { data: { workspaceId: CLIENT, workspaceName: "Northside Bakery", status: "accepted", alreadyAccepted: false } } });
    await expect(acceptOwnerClaim(actor, TOKEN, d)).resolves.toMatchObject({ status: "accepted" });
    expect(d.rpc).toHaveBeenCalledWith("accept_agency_client_owner_claim", { p_token_hash: createHash("sha256").update(TOKEN).digest("hex"), p_actor_id: actor.userId, p_verified_email: "owner@agency.example.test" });
    const wrong = deps({ accept_agency_client_owner_claim: { error: { message: "agency_client_claim_recipient_mismatch" } } });
    await expect(acceptOwnerClaim(actor, TOKEN, wrong)).rejects.toMatchObject({ status: 403 });
    const sponsor = deps({ accept_agency_client_owner_claim: { error: { message: "agency_client_claim_sponsor_invalid" } } });
    await expect(acceptOwnerClaim(actor, TOKEN, sponsor)).rejects.toMatchObject({ status: 410 });
  });
});

describe("seedFromSite", () => {
  const page = { url: "https://northside-bakery.example/", sourceId: "s1", html: "", visibleText: "", title: "", headings: [], links: [], assets: [] };
  const crawl = vi.fn(async () => ({ pages: [page], skipped: [], assets: [], crawledAt: "", bytes: 0, elapsedMs: 0, limited: false }));
  const fact = (text: string, kind: string) => ({ text, kind, highRisk: false, origin: "source", sources: [] });

  it("keeps the first valid phone, email and address, all as suggestions", async () => {
    const extract = vi.fn(() => ({
      name: "Northside Bakery", nameFactId: "n", facts: {
        a: fact("mailto-nope", "contact"), b: fact("12", "contact"), c: fact("(716) 555-0142", "contact"), d: fact("Hello@Northside-Bakery.example", "contact"),
        e: fact("12 Elm St, Buffalo, NY 14201", "location"),
      }, services: [], people: [], contact: ["a", "b", "c", "d"], hours: [], locations: ["e"], reviews: [], claims: [], brandColors: [], oldPaths: [], sourcePages: [],
    }));
    const seed = await seedFromSite("https://northside-bakery.example/", { crawl: crawl as never, extract: extract as never });
    expect(crawl).toHaveBeenCalledWith("https://northside-bakery.example/", { maxPages: 3, timeoutMs: 12_000, maxBytes: 1_500_000 });
    expect(seed.facts).toEqual({ phone: { value: "(716) 555-0142" }, email: { value: "hello@northside-bakery.example" }, address: { value: { formatted: "12 Elm St, Buffalo, NY 14201" } } });
    expect(seed.scan).toEqual({ status: "scanned", seeded: ["phone", "email", "address"], name: "Northside Bakery", message: null });
  });

  it("reports an unreadable site without failing the add", async () => {
    const failing = vi.fn(async () => { throw new WebsiteCrawlError("robots_blocked", "This website's robots.txt blocks rebuilding. Describe your business instead."); });
    const seed = await seedFromSite("https://blocked.example/", { crawl: failing as never });
    expect(seed).toEqual({ scan: { status: "unreachable", seeded: [], name: null, message: "This website's robots.txt blocks rebuilding. Describe your business instead." }, facts: {} });
  });
});
