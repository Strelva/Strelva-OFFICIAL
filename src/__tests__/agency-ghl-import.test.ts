import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clientImportRowSchema } from "@/products/agency-clients/import-contract";
import { createGoHighLevelImportAdapter, ghlLocationToRow, listGhlSubAccounts } from "@/products/agency-clients/gohighlevel/adapter";
import { GhlApiError, GhlClient, GhlPacer, type GhlTokenSource } from "@/products/agency-clients/gohighlevel/client";
import { ghlImportReleaseEnabled, GHL_SCOPES } from "@/products/agency-clients/gohighlevel/config";
import { consumeGhlOAuthState, createGhlOAuthState, exchangeGhlCode, ghlAuthorizationUrl } from "@/products/agency-clients/gohighlevel/oauth";
import type { GhlConnectionStore, GhlConnectionWithSecrets, GhlStoredEvent } from "@/products/agency-clients/gohighlevel/repository";
import { supabaseGhlConnectionStore } from "@/products/agency-clients/gohighlevel/repository";
import { newGhlSubAccounts, readGhlImportRows, receiveGhlWebhook, type GhlServiceDeps } from "@/products/agency-clients/gohighlevel/service";
import { GHL_WEBHOOK_ED25519_PUBLIC_KEY, GHL_WEBHOOK_RSA_PUBLIC_KEY, parseGhlWebhook, verifyGhlWebhookSignature } from "@/products/agency-clients/gohighlevel/webhook";
import { createPublicKey } from "node:crypto";
import { GHL_COMPANY_ID, ghlCompanyTokenResponse, ghlLocation, ghlUser, jsonResponse } from "./fixtures/gohighlevel";

const AGENCY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = { userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", verifiedEmail: "owner@agency.example.test" };

afterEach(() => {
  vi.unstubAllEnvs();
});

function fakeClock(start = 1_000_000) {
  const clock = { t: start, sleeps: [] as number[], now: () => clock.t, sleep: async (ms: number) => { clock.sleeps.push(ms); clock.t += ms; } };
  return clock;
}

const staticTokens = (token = "fixture-agency-access"): GhlTokenSource => ({ accessToken: async () => token, refresh: async () => token });

type Route = (url: URL, init?: RequestInit) => Response | Promise<Response>;
function router(route: Route) {
  const calls: URL[] = [];
  const fetcher = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    calls.push(url);
    return route(url, init);
  });
  return { fetcher, calls };
}

function bookOf(count: number) {
  return Array.from({ length: count }, (_, index) => ghlLocation(index + 1));
}

/** A HighLevel that pages /locations/search by skip/limit, capping limit at `cap`. */
function highLevel(locations: ReturnType<typeof ghlLocation>[], users: ReturnType<typeof ghlUser>[], cap = 100) {
  return (url: URL) => {
    const skip = Number(url.searchParams.get("skip") ?? 0);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), cap);
    if (url.pathname === "/locations/search") return jsonResponse({ locations: locations.slice(skip, skip + limit) });
    if (url.pathname === "/users/search") {
      const locationId = url.searchParams.get("locationId");
      const scoped = locationId ? users.filter((user) => user.roles.locationIds.includes(locationId)) : users;
      return jsonResponse({ users: scoped.slice(skip, skip + limit), count: scoped.length });
    }
    return jsonResponse({ message: "not found" }, 404);
  };
}

describe("GoHighLevel import flag", () => {
  it("is off by default and needs the workspace release too", () => {
    expect(ghlImportReleaseEnabled({})).toBe(false);
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    expect(ghlImportReleaseEnabled({})).toBe(false);
    expect(ghlImportReleaseEnabled({ STRELVA_GHL_IMPORT_RELEASE: "1" })).toBe(true);
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0");
    expect(ghlImportReleaseEnabled({ STRELVA_GHL_IMPORT_RELEASE: "1" })).toBe(false);
  });
});

describe("listing an agency's sub-accounts", () => {
  it("pages through 237 sub-accounts with the agency token and the 2021-07-28 Version header", async () => {
    const { fetcher, calls } = router(highLevel(bookOf(237), []));
    const client = new GhlClient({ tokens: staticTokens(), fetcher, clock: fakeClock() });
    const locations = await listGhlSubAccounts(client, GHL_COMPANY_ID);
    expect(locations).toHaveLength(237);
    expect(new Set(locations.map((location) => location.id)).size).toBe(237);
    expect(calls.map((url) => url.searchParams.get("skip"))).toEqual(["0", "100", "200", "237"]);
    expect(calls.every((url) => url.searchParams.get("companyId") === GHL_COMPANY_ID)).toBe(true);
    const init = fetcher.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toMatchObject({ Authorization: "Bearer fixture-agency-access", Version: "2021-07-28" });
  });

  it("still reads every sub-account when HighLevel returns smaller pages than asked", async () => {
    const { fetcher, calls } = router(highLevel(bookOf(25), [], 10));
    const locations = await listGhlSubAccounts(new GhlClient({ tokens: staticTokens(), fetcher, clock: fakeClock() }), GHL_COMPANY_ID);
    expect(locations).toHaveLength(25);
    expect(calls.map((url) => url.searchParams.get("skip"))).toEqual(["0", "10", "20", "25"]);
  });

  it("stops when a page repeats instead of looping", async () => {
    const { fetcher, calls } = router(() => jsonResponse({ locations: [ghlLocation(1), ghlLocation(2)] }));
    const locations = await listGhlSubAccounts(new GhlClient({ tokens: staticTokens(), fetcher, clock: fakeClock() }), GHL_COMPANY_ID);
    expect(locations).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });
});

describe("mapping a sub-account to an Import clients row", () => {
  it("maps name, website, phone and address; sourceRef is the location id", () => {
    const row = ghlLocationToRow(ghlLocation(7), []);
    expect(row).toEqual({
      sourceRef: "loc00007",
      name: "Fixture Client 007",
      url: "https://client7.example.test",
      phone: "+1 716-555-0100",
      address: "1 Main St, Buffalo, NY 14202, US",
      ownerEmailCandidates: [{ email: "front-desk-7@client.example.test", basis: "business_email" }],
    });
    expect(clientImportRowSchema.safeParse(row).success).toBe(true);
  });

  it("keeps a sub-account with no website or address as a row the preview can mark incomplete", () => {
    const row = ghlLocationToRow(ghlLocation(8, { website: "", address: null, city: null, state: null, postalCode: null, country: null, email: "not-an-email", phone: null }), []);
    expect(row).toEqual({ sourceRef: "loc00008", name: "Fixture Client 008" });
  });

  it("keeps https websites as given and drops values that aren't addresses", () => {
    expect(ghlLocationToRow(ghlLocation(9, { website: "https://www.client9.example.test/" }), []).url).toBe("https://www.client9.example.test/");
    expect(ghlLocationToRow(ghlLocation(9, { website: "n/a" }), []).url).toBeUndefined();
  });

  it("fills ownerEmail only when the sub-account has exactly one admin", () => {
    const location = ghlLocation(1);
    const admin = ghlUser("u1", "Owner@Client1.example.test", { type: "account", role: "admin", locationIds: [location.id] });
    const staff = ghlUser("u2", "staff@client1.example.test", { type: "account", role: "user", locationIds: [location.id] });
    const row = ghlLocationToRow(location, [admin, staff]);
    expect(row.ownerEmail).toBe("owner@client1.example.test");
    expect(row.ownerEmailCandidates?.map((candidate) => [candidate.email, candidate.basis])).toEqual([
      ["owner@client1.example.test", "account_admin"],
      ["staff@client1.example.test", "account_user"],
      ["front-desk-1@client.example.test", "business_email"],
    ]);
  });

  it("leaves ownerEmail empty with several admins and offers them all to pick from", () => {
    const location = ghlLocation(2);
    const row = ghlLocationToRow(location, [
      ghlUser("u1", "pat@client2.example.test", { type: "account", role: "admin", locationIds: [location.id] }),
      ghlUser("u2", "sam@client2.example.test", { type: "account", role: "admin", locationIds: [location.id] }),
    ]);
    expect(row.ownerEmail).toBeUndefined();
    expect(row.ownerEmailCandidates?.filter((candidate) => candidate.basis === "account_admin").map((candidate) => candidate.email)).toEqual(["pat@client2.example.test", "sam@client2.example.test"]);
  });

  it("never fills ownerEmail from a non-admin or the business's contact address", () => {
    const location = ghlLocation(3);
    const row = ghlLocationToRow(location, [ghlUser("u1", "solo@client3.example.test", { type: "account", role: "user", locationIds: [location.id] })]);
    expect(row.ownerEmail).toBeUndefined();
    expect(row.ownerEmailCandidates?.[0]).toMatchObject({ email: "solo@client3.example.test", basis: "account_user" });
  });
});

describe("the GoHighLevel source adapter", () => {
  it("reads rows with owner candidates from one company-wide user search, excluding agency staff and deleted users", async () => {
    const locations = bookOf(3);
    const users = [
      ghlUser("agency1", "va@agency.example.test", { type: "agency", role: "admin", locationIds: locations.map((location) => location.id) }),
      ghlUser("a1", "owner1@client1.example.test", { type: "account", role: "admin", locationIds: ["loc00001"] }),
      ghlUser("a2", "pat@client2.example.test", { type: "account", role: "admin", locationIds: ["loc00002"] }),
      ghlUser("a3", "sam@client2.example.test", { type: "account", role: "admin", locationIds: ["loc00002"] }),
      ghlUser("gone", "gone@client3.example.test", { type: "account", role: "admin", locationIds: ["loc00003"] }, { deleted: true }),
    ];
    const { fetcher, calls } = router(highLevel(locations, users));
    const adapter = createGoHighLevelImportAdapter(async () => ({ client: new GhlClient({ tokens: staticTokens(), fetcher, clock: fakeClock() }), companyId: GHL_COMPANY_ID }));
    expect(adapter.source).toBe("gohighlevel");
    const rows = await adapter.readRows({ agencyWorkspaceId: AGENCY });
    expect(rows.map((row) => [row.sourceRef, row.ownerEmail ?? null])).toEqual([
      ["loc00001", "owner1@client1.example.test"],
      ["loc00002", null],
      ["loc00003", null],
    ]);
    expect(rows.flatMap((row) => row.ownerEmailCandidates ?? []).some((candidate) => candidate.email.includes("agency.example.test") || candidate.email.startsWith("gone@"))).toBe(false);
    expect(calls.filter((url) => url.pathname === "/users/search").every((url) => !url.searchParams.has("locationId"))).toBe(true);
    for (const row of rows) expect(clientImportRowSchema.safeParse(row).success).toBe(true);
  });

  it("falls back to one user search per sub-account when the company-wide search has no sub-account users", async () => {
    const locations = bookOf(2);
    const users = [ghlUser("a1", "owner1@client1.example.test", { type: "account", role: "admin", locationIds: ["loc00001"] })];
    const { fetcher, calls } = router((url) => {
      if (url.pathname === "/users/search" && !url.searchParams.get("locationId")) return jsonResponse({ users: [], count: 0 });
      return highLevel(locations, users)(url);
    });
    const adapter = createGoHighLevelImportAdapter(async () => ({ client: new GhlClient({ tokens: staticTokens(), fetcher, clock: fakeClock() }), companyId: GHL_COMPANY_ID }));
    const rows = await adapter.readRows({ agencyWorkspaceId: AGENCY });
    expect(rows[0]!.ownerEmail).toBe("owner1@client1.example.test");
    expect(calls.filter((url) => url.searchParams.get("locationId")).map((url) => url.searchParams.get("locationId"))).toEqual(["loc00001", "loc00002"]);
  });

  it("refuses input that doesn't name an agency workspace", async () => {
    const adapter = createGoHighLevelImportAdapter(async () => { throw new Error("unreachable"); });
    await expect(adapter.readRows({ agencyWorkspaceId: "nope" })).rejects.toThrow();
  });
});

describe("rate limits and retries", () => {
  it("paces under 100 requests per 10 seconds per resource", async () => {
    const clock = fakeClock();
    const pacer = new GhlPacer(clock);
    for (let index = 0; index < 200; index += 1) await pacer.acquire(GHL_COMPANY_ID);
    // 90 per window: the 91st and 181st waits roll into the next windows.
    expect(clock.t - 1_000_000).toBeGreaterThanOrEqual(20_000);
    await new GhlPacer(clock).acquire("another-resource");
  });

  it("waits out X-RateLimit-Remaining: 0 before the next call", async () => {
    const clock = fakeClock();
    const pacer = new GhlPacer(clock);
    pacer.observe(GHL_COMPANY_ID, new Headers({ "x-ratelimit-remaining": "0", "x-ratelimit-interval-milliseconds": "10000" }));
    await pacer.acquire(GHL_COMPANY_ID);
    expect(clock.sleeps).toEqual([10_000]);
  });

  it("retries a 429 after Retry-After, then succeeds", async () => {
    const clock = fakeClock();
    let calls = 0;
    const { fetcher } = router(() => (calls += 1) === 1 ? jsonResponse({ message: "Too many requests" }, 429, { "retry-after": "2" }) : jsonResponse({ locations: [] }));
    const client = new GhlClient({ tokens: staticTokens(), fetcher, clock });
    await expect(client.get("/locations/search", { companyId: GHL_COMPANY_ID }, GHL_COMPANY_ID)).resolves.toEqual({ locations: [] });
    expect(clock.sleeps).toContain(2_000);
  });

  it("gives up after repeated 429s with a rate_limited error", async () => {
    const { fetcher } = router(() => jsonResponse({ message: "Too many requests" }, 429));
    const client = new GhlClient({ tokens: staticTokens(), fetcher, clock: fakeClock(), maxAttempts: 3 });
    await expect(client.get("/locations/search", {}, GHL_COMPANY_ID)).rejects.toMatchObject({ code: "rate_limited" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("retries 5xx and network failures with backoff", async () => {
    const clock = fakeClock();
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("fetch failed");
      if (calls === 2) return jsonResponse({}, 502);
      return jsonResponse({ ok: true });
    });
    await expect(new GhlClient({ tokens: staticTokens(), fetcher, clock }).get("/x", {}, "r")).resolves.toEqual({ ok: true });
    expect(clock.sleeps).toEqual([500, 1_000]);
  });
});

describe("revoked and insufficient access", () => {
  it("refreshes once after a 401, then reports revoked when the refresh token is refused", async () => {
    const tokens = { accessToken: vi.fn(async () => "old"), refresh: vi.fn(async () => { throw new GhlApiError("gone", "revoked", 401); }) };
    const { fetcher } = router(() => jsonResponse({ statusCode: 401, message: "Invalid JWT" }, 401));
    await expect(new GhlClient({ tokens, fetcher, clock: fakeClock() }).get("/locations/search", {}, GHL_COMPANY_ID)).rejects.toMatchObject({ code: "revoked" });
    expect(tokens.refresh).toHaveBeenCalledTimes(1);
  });

  it("retries with the refreshed token when the refresh works", async () => {
    const tokens = { accessToken: vi.fn(async () => "old"), refresh: vi.fn(async () => "new") };
    const { fetcher } = router((_url, init) => (init?.headers as Record<string, string>).Authorization === "Bearer new" ? jsonResponse({ locations: [] }) : jsonResponse({ message: "Invalid JWT" }, 401));
    await expect(new GhlClient({ tokens, fetcher, clock: fakeClock() }).get("/locations/search", {}, GHL_COMPANY_ID)).resolves.toEqual({ locations: [] });
  });

  it("treats a scope refusal or 403 as insufficient access, without refreshing", async () => {
    const tokens = { accessToken: vi.fn(async () => "t"), refresh: vi.fn(async () => "t2") };
    const scope = router(() => jsonResponse({ statusCode: 401, message: "The token is not authorized for this scope." }, 401));
    await expect(new GhlClient({ tokens, fetcher: scope.fetcher, clock: fakeClock() }).get("/users/search", {}, GHL_COMPANY_ID)).rejects.toMatchObject({ code: "insufficient_access" });
    const forbidden = router(() => jsonResponse({ statusCode: 403, message: "Forbidden" }, 403));
    await expect(new GhlClient({ tokens, fetcher: forbidden.fetcher, clock: fakeClock() }).get("/users/search", {}, GHL_COMPANY_ID)).rejects.toMatchObject({ code: "insufficient_access" });
    expect(tokens.refresh).not.toHaveBeenCalled();
  });
});

describe("agency OAuth", () => {
  it("binds state to the agency and the person, refuses tampering and expiry", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", "ghl-oauth-test-secret");
    const state = createGhlOAuthState({ workspaceId: AGENCY, userId: ACTOR.userId }, 1_000);
    expect(await consumeGhlOAuthState(state, 2_000)).toMatchObject({ workspaceId: AGENCY, userId: ACTOR.userId });
    expect(await consumeGhlOAuthState(`${state.split(".")[0]}.tampered`, 2_000)).toBeNull();
    expect(await consumeGhlOAuthState(state, 11 * 60 * 1000 + 1_000)).toBeNull();
  });

  it("asks only for read scopes on the agency consent page", () => {
    expect(ghlAuthorizationUrl("https://app.example.test/cb", "s")).toBeNull();
    vi.stubEnv("HIGHLEVEL_CLIENT_ID", "fixture-client");
    vi.stubEnv("HIGHLEVEL_CLIENT_SECRET", "fixture-secret");
    const url = new URL(ghlAuthorizationUrl("https://app.example.test/cb", "s")!);
    expect(url.origin + url.pathname).toBe("https://marketplace.gohighlevel.com/v2/oauth/chooselocation");
    expect(url.searchParams.get("scope")).toBe(GHL_SCOPES.join(" "));
    expect(url.searchParams.get("scope")).not.toMatch(/write/);
    expect(url.searchParams.get("state")).toBe("s");
  });

  it("exchanges the code for a Company token and refuses a single sub-account token", async () => {
    vi.stubEnv("HIGHLEVEL_CLIENT_ID", "fixture-client");
    vi.stubEnv("HIGHLEVEL_CLIENT_SECRET", "fixture-secret");
    const company = router(() => jsonResponse(ghlCompanyTokenResponse));
    const tokens = await exchangeGhlCode("fixture-code", "https://app.example.test/cb", company.fetcher, 0);
    expect(tokens).toMatchObject({ companyId: GHL_COMPANY_ID, accessToken: "fixture-agency-access", refreshToken: "fixture-agency-refresh", expiresAt: new Date(86_399_000).toISOString() });
    const body = new URLSearchParams(String((company.fetcher.mock.calls[0]![1] as RequestInit).body));
    expect(body.get("user_type")).toBe("Company");
    expect(body.get("grant_type")).toBe("authorization_code");
    const location = router(() => jsonResponse({ ...ghlCompanyTokenResponse, userType: "Location", locationId: "loc00001" }));
    await expect(exchangeGhlCode("fixture-code", "https://app.example.test/cb", location.fetcher)).rejects.toMatchObject({ code: "not_company" });
  });
});

function signedDelivery(body: string, privateKey: Parameters<typeof sign>[2], scheme: "ed25519" | "rsa") {
  const signature = scheme === "ed25519" ? sign(null, Buffer.from(body), privateKey) : sign("sha256", Buffer.from(body), privateKey);
  return new Headers({ [scheme === "ed25519" ? "x-ghl-signature" : "x-wh-signature"]: signature.toString("base64") });
}

describe("webhook signatures", () => {
  const ed = generateKeyPairSync("ed25519");
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const keys = { ed25519: ed.publicKey, rsa: rsa.publicKey };
  const body = JSON.stringify({ type: "INSTALL", appId: "app1", companyId: GHL_COMPANY_ID, locationId: "loc00042", webhookId: "wh-1", timestamp: "2026-10-12T12:00:00Z" });

  it("accepts a valid X-GHL-Signature (Ed25519) over the raw body", () => {
    expect(verifyGhlWebhookSignature(body, signedDelivery(body, ed.privateKey, "ed25519"), keys)).toEqual({ ok: true, scheme: "ed25519" });
  });

  it("rejects a changed body, a foreign key and a garbled signature", () => {
    const headers = signedDelivery(body, ed.privateKey, "ed25519");
    expect(verifyGhlWebhookSignature(body.replace("loc00042", "loc00043"), headers, keys)).toEqual({ ok: false, reason: "invalid" });
    const stranger = generateKeyPairSync("ed25519");
    expect(verifyGhlWebhookSignature(body, signedDelivery(body, stranger.privateKey, "ed25519"), keys)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyGhlWebhookSignature(body, new Headers({ "x-ghl-signature": "N/A" }), keys)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyGhlWebhookSignature(body, new Headers(), keys)).toEqual({ ok: false, reason: "missing" });
  });

  it("accepts the legacy RSA header only when X-GHL-Signature is absent", () => {
    const legacy = signedDelivery(body, rsa.privateKey, "rsa");
    expect(verifyGhlWebhookSignature(body, legacy, keys)).toEqual({ ok: true, scheme: "rsa" });
    legacy.set("x-ghl-signature", "AAAA");
    expect(verifyGhlWebhookSignature(body, legacy, keys)).toEqual({ ok: false, reason: "invalid" });
  });

  it("ships HighLevel's published keys in a form node can load", () => {
    expect(createPublicKey(GHL_WEBHOOK_ED25519_PUBLIC_KEY).asymmetricKeyType).toBe("ed25519");
    expect(createPublicKey(GHL_WEBHOOK_RSA_PUBLIC_KEY).asymmetricKeyType).toBe("rsa");
    // A fixture signature can never pass against HighLevel's real key.
    expect(verifyGhlWebhookSignature(body, signedDelivery(body, ed.privateKey, "ed25519")).ok).toBe(false);
  });

  it("reads install, uninstall and location-created deliveries", () => {
    expect(parseGhlWebhook(body)).toEqual({ deliveryId: "wh-1", appId: "app1", event: { kind: "location_installed", companyId: GHL_COMPANY_ID, locationId: "loc00042" } });
    expect(parseGhlWebhook(JSON.stringify({ type: "INSTALL", appId: "app1", companyId: GHL_COMPANY_ID }))?.event).toEqual({ kind: "agency_installed", companyId: GHL_COMPANY_ID });
    expect(parseGhlWebhook(JSON.stringify({ type: "UNINSTALL", appId: "app1", companyId: GHL_COMPANY_ID }))?.event).toEqual({ kind: "agency_uninstalled", companyId: GHL_COMPANY_ID });
    expect(parseGhlWebhook(JSON.stringify({ type: "LocationCreate", id: "loc00099", companyId: GHL_COMPANY_ID, name: "New" }))?.event).toEqual({ kind: "location_created", companyId: GHL_COMPANY_ID, locationId: "loc00099" });
    expect(parseGhlWebhook(JSON.stringify({ type: "ContactCreate" }))?.event.kind).toBe("ignored");
    expect(parseGhlWebhook("{not json")).toBeNull();
    const noId = parseGhlWebhook(JSON.stringify({ type: "INSTALL", locationId: "loc1" }))!;
    expect(noId.deliveryId).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

function memoryStore(initial: GhlConnectionWithSecrets | null = null) {
  const state = { connection: initial, events: [] as GhlStoredEvent[], statuses: [] as string[], tokenWrites: 0 };
  const store: GhlConnectionStore = {
    read: async (workspaceId) => state.connection?.workspaceId === workspaceId ? state.connection : null,
    readByCompany: async (companyId) => state.connection?.companyId === companyId ? state.connection : null,
    save: async () => { throw new Error("not used"); },
    updateTokens: async (_id, tokens) => {
      state.tokenWrites += 1;
      if (state.connection) Object.assign(state.connection, { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, tokenExpiresAt: tokens.expiresAt });
    },
    markStatus: async (_id, status, lastError) => {
      state.statuses.push(status);
      if (state.connection) Object.assign(state.connection, { status, lastError });
    },
    recordEvent: async (event) => {
      if (state.events.some((known) => known.deliveryId === event.deliveryId)) return false;
      state.events.push({ ...event, receivedAt: new Date(0).toISOString() });
      return true;
    },
    eventsSince: async () => state.events,
  };
  return { store, state };
}

function connection(overrides: Partial<GhlConnectionWithSecrets> = {}): GhlConnectionWithSecrets {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", workspaceId: AGENCY, companyId: GHL_COMPANY_ID, scopes: [...GHL_SCOPES], status: "connected",
    tokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(), lastError: null, connectedBy: ACTOR.userId,
    createdAt: "2026-10-12T00:00:00Z", updatedAt: "2026-10-12T00:00:00Z", accessToken: "stored-access", refreshToken: "stored-refresh",
    ...overrides,
  };
}

describe("the import service", () => {
  const deps = (store: GhlConnectionStore, fetcher: GhlServiceDeps["fetcher"], role: "owner" | "member" = "owner"): GhlServiceDeps => ({
    store, fetcher, now: () => Date.now(), agencyRole: async () => role, clock: fakeClock(),
  });

  it("returns rows for an agency owner and nothing for a member", async () => {
    const { store } = memoryStore(connection());
    const { fetcher } = router(highLevel(bookOf(2), []));
    expect(await readGhlImportRows(ACTOR, AGENCY, deps(store, fetcher))).toHaveLength(2);
    await expect(readGhlImportRows(ACTOR, AGENCY, deps(store, fetcher, "member"))).rejects.toMatchObject({ status: 403 });
  });

  it("marks the connection for reconnect when HighLevel refuses the token and the refresh", async () => {
    vi.stubEnv("HIGHLEVEL_CLIENT_ID", "fixture-client");
    vi.stubEnv("HIGHLEVEL_CLIENT_SECRET", "fixture-secret");
    const { store, state } = memoryStore(connection());
    const { fetcher } = router((url) => url.pathname === "/oauth/token"
      ? jsonResponse({ error: "invalid_grant", error_description: "refresh token revoked" }, 400)
      : jsonResponse({ statusCode: 401, message: "Invalid JWT" }, 401));
    await expect(readGhlImportRows(ACTOR, AGENCY, deps(store, fetcher))).rejects.toMatchObject({ status: 409, code: "ghl_revoked" });
    expect(state.connection?.status).toBe("needs_reauth");
    await expect(readGhlImportRows(ACTOR, AGENCY, deps(store, fetcher))).rejects.toMatchObject({ code: "ghl_revoked" });
  });

  it("refreshes an expired token, stores the rotated refresh token, then reads", async () => {
    vi.stubEnv("HIGHLEVEL_CLIENT_ID", "fixture-client");
    vi.stubEnv("HIGHLEVEL_CLIENT_SECRET", "fixture-secret");
    const { store, state } = memoryStore(connection({ tokenExpiresAt: new Date(Date.now() - 1_000).toISOString() }));
    const { fetcher } = router((url, init) => {
      if (url.pathname === "/oauth/token") return jsonResponse({ ...ghlCompanyTokenResponse, access_token: "fresh", refresh_token: "rotated" });
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer fresh");
      return highLevel(bookOf(1), [])(url);
    });
    expect(await readGhlImportRows(ACTOR, AGENCY, deps(store, fetcher))).toHaveLength(1);
    expect(state.connection).toMatchObject({ accessToken: "fresh", refreshToken: "rotated" });
  });

  it("says plainly when HighLevel isn't connected", async () => {
    const { store } = memoryStore(null);
    await expect(readGhlImportRows(ACTOR, AGENCY, deps(store, vi.fn()))).rejects.toMatchObject({ code: "ghl_not_connected" });
  });
});

describe("receiving deliveries and reconciling", () => {
  const ed = generateKeyPairSync("ed25519");
  const keys = { ed25519: ed.publicKey, rsa: generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey };

  it("records a signed install once, ignores a retry and refuses an unsigned delivery", async () => {
    const { store, state } = memoryStore(connection());
    const body = JSON.stringify({ type: "INSTALL", appId: "app1", companyId: GHL_COMPANY_ID, locationId: "loc00042", webhookId: "wh-7" });
    const headers = signedDelivery(body, ed.privateKey, "ed25519");
    expect(await receiveGhlWebhook(body, headers, { store, keys, appId: "app1" })).toEqual({ status: 200, result: "recorded" });
    expect(await receiveGhlWebhook(body, headers, { store, keys, appId: "app1" })).toEqual({ status: 200, result: "duplicate" });
    expect(await receiveGhlWebhook(body, new Headers(), { store, keys, appId: "app1" })).toEqual({ status: 401, result: "signature_invalid" });
    expect(state.events).toHaveLength(1);
    expect(state.connection?.status).toBe("connected");
  });

  it("ignores another app's delivery and marks the connection revoked on an agency uninstall", async () => {
    const { store, state } = memoryStore(connection());
    const other = JSON.stringify({ type: "UNINSTALL", appId: "someone-else", companyId: GHL_COMPANY_ID });
    expect(await receiveGhlWebhook(other, signedDelivery(other, ed.privateKey, "ed25519"), { store, keys, appId: "app1" })).toEqual({ status: 200, result: "ignored" });
    const uninstall = JSON.stringify({ type: "UNINSTALL", appId: "app1", companyId: GHL_COMPANY_ID, webhookId: "wh-9" });
    expect(await receiveGhlWebhook(uninstall, signedDelivery(uninstall, ed.privateKey, "ed25519"), { store, keys, appId: "app1" })).toEqual({ status: 200, result: "recorded" });
    expect(state.statuses).toEqual(["revoked"]);
  });

  it("lists sub-accounts not yet imported, without adding anything", () => {
    const waiting = newGhlSubAccounts([{ id: "loc3", name: "Zed Dental" }, { id: "loc1", name: "Alpha" }, { id: "loc2", name: " " }], ["loc1"]);
    expect(waiting).toEqual([{ sourceRef: "loc2", name: null }, { sourceRef: "loc3", name: "Zed Dental" }]);
  });
});

describe("token storage", () => {
  it("refuses to store a HighLevel token in plaintext when encryption isn't configured", async () => {
    vi.stubEnv("SECRETS_ENC_KEY", "");
    const insert = vi.fn();
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "maybeSingle", "insert", "update", "single", "or", "gte", "order", "limit", "delete"]) builder[method] = (...args: unknown[]) => { if (method === "insert") insert(...args); return builder; };
    builder.then = (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null });
    const store = supabaseGhlConnectionStore({ from: () => builder as never });
    await expect(store.save({ workspaceId: AGENCY, companyId: GHL_COMPANY_ID, connectedBy: ACTOR.userId, tokens: { accessToken: "a", refreshToken: "r", expiresAt: null, scopes: [] } }))
      .rejects.toMatchObject({ code: "not_encrypted" });
    expect(insert).not.toHaveBeenCalled();
  });
});
