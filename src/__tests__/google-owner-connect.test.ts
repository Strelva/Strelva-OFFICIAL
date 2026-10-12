import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  record: vi.fn(), patch: vi.fn(), publishing: vi.fn(), bindings: vi.fn(), encryption: vi.fn(),
  readLink: vi.fn(),
}));
vi.mock("@/platform/business-record/service", () => ({ readBusinessRecord: f.record, patchBusinessRecord: f.patch }));
vi.mock("@/products/publishing/server", () => ({
  publishingEnabledForWorkspace: f.publishing,
  reconnectAppOrigin: () => "https://app.example.test",
  reconnectUrl: (target: { id: string }) => `https://app.example.test/api/publishing/google/reconnect?token=signed-${target.id}`,
  reconnectTargetSchema: { parse: (value: unknown) => value },
}));
vi.mock("@/platform/account-bindings/store", () => ({ googleBindingsEnabled: f.bindings, bindingEncryptionReady: f.encryption, readGoogleBindingForTenant: vi.fn() }));
vi.mock("@/products/google-listing/connect/store", async (original) => ({ ...(await original<object>()), readAgencyGoogleConnectLink: f.readLink }));

import { confirmationPatch, googleHoursToWeekly, googleLocationToFoundFacts, readGoogleFoundFacts } from "@/products/google-listing/found-facts";
import { decideFoundFact, importGoogleFoundFacts } from "@/products/google-listing/connect/service";
import { beginGoogleDiscovery, chosenTarget, finishGoogleDiscovery, readDiscoveryChoices } from "@/products/google-listing/connect/discover";
import { agencyGoogleConnectLink } from "@/products/google-listing/connect/agency-link";
import { admitOwnerConnect } from "@/products/google-listing/connect/service";

const WS = "11111111-1111-4111-8111-111111111111";
const FACT = "22222222-2222-4222-8222-222222222222";
const owner = { userId: "10000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const other = { userId: "10000000-0000-4000-8000-000000000009", verifiedEmail: "staff@example.test" };
const location = { accountId: "accounts/123", locationId: "456" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const quotaZero = () => new Response(JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded for quota metric 'Requests' ... limit of 0" } }), { status: 429 });
const forbidden = () => new Response(JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: "The caller does not have permission" } }), { status: 403 });
const googleLocation = {
  title: "Synthetic Bakery", phoneNumbers: { primaryPhone: "(716) 555-0100" }, websiteUri: "https://bakery.example/",
  profile: { description: "Bread and cakes in Buffalo." },
  categories: { primaryCategory: { displayName: "Bakery" }, additionalCategories: [{ displayName: "Cake shop" }] },
  regularHours: { periods: [
    { openDay: "MONDAY", openTime: { hours: 7 }, closeDay: "MONDAY", closeTime: { hours: 15, minutes: 30 } },
    { openDay: "FRIDAY", openTime: { hours: 18 }, closeDay: "SATURDAY", closeTime: { hours: 2 } },
  ] },
};

beforeEach(() => {
  for (const mock of Object.values(f)) mock.mockReset();
  f.record.mockResolvedValue({ access: "owner", revision: 4, facts: {} });
  f.publishing.mockResolvedValue(true); f.bindings.mockReturnValue(true); f.encryption.mockReturnValue(true);
  vi.stubEnv("STRELVA_GOOGLE_OWNER_CONNECT", "1");
  vi.stubEnv("OAUTH_STATE_SECRET", "fixture-private-secret");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
  vi.stubEnv("GOOGLE_CLIENT_ID", "fixture-client"); vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture-secret");
});
afterEach(() => vi.unstubAllEnvs());

describe("found facts from a Google listing", () => {
  it("maps hours, phone, website, description and categories, splitting overnight hours at midnight", () => {
    const facts = googleLocationToFoundFacts(googleLocation, location);
    expect(facts.map(fact => fact.key)).toEqual(["hours", "phone", "website", "description", "categories"]);
    expect(facts.every(fact => fact.source === "google_listing" && fact.sourceRef === "accounts/123/locations/456")).toBe(true);
    expect(facts[0]!.value).toEqual({ weekly: [{ day: 1, opens: "07:00", closes: "15:30" }, { day: 5, opens: "18:00", closes: "24:00" }, { day: 6, opens: "00:00", closes: "02:00" }] });
    expect(facts[4]!.value).toEqual(["Bakery", "Cake shop"]);
    expect(googleHoursToWeekly([{ openDay: "SUNDAY", openTime: {}, closeDay: "MONDAY", closeTime: {} }])).toEqual([{ day: 0, opens: "00:00", closes: "24:00" }]);
  });
  it("leaves out what doesn't fit the record instead of repairing it", () => {
    const facts = googleLocationToFoundFacts({ phoneNumbers: { primaryPhone: "12" }, websiteUri: "javascript:alert(1)", profile: { description: "" } }, location);
    expect(facts).toEqual([]);
    expect(googleLocationToFoundFacts("not a location", location)).toEqual([]);
  });
  it("reads only, and degrades to access pending on quota 0 and to refused on 403", async () => {
    const getLocation = vi.fn().mockResolvedValue({ ok: true, data: googleLocation });
    expect((await readGoogleFoundFacts({ getLocation: getLocation as never }, location)).status).toBe("found");
    expect(getLocation.mock.calls[0]![1]).toEqual(["title", "phoneNumbers", "websiteUri", "profile", "categories", "regularHours"]);
    getLocation.mockResolvedValueOnce({ ok: false, kind: "setup_pending", status: 429, detail: "limit of 0" });
    expect(await readGoogleFoundFacts({ getLocation: getLocation as never }, location)).toEqual({ status: "access_pending" });
    getLocation.mockResolvedValueOnce({ ok: false, kind: "auth", status: 403, detail: "denied" });
    expect(await readGoogleFoundFacts({ getLocation: getLocation as never }, location)).toEqual({ status: "refused" });
    getLocation.mockResolvedValueOnce({ ok: false, kind: "error", status: 500, detail: "boom" });
    expect(await readGoogleFoundFacts({ getLocation: getLocation as never }, location)).toMatchObject({ status: "unavailable" });
  });
  it("confirms into the record as the owner's fact, keeping the record's time zone and other links", () => {
    const record = { facts: { hours: { value: { timezone: "America/New_York", weekly: [] }, source: "owner", verified: true, updatedAt: "x", updatedBy: owner.userId }, links: { value: [{ kind: "instagram", url: "https://instagram.com/bakery" }, { kind: "website", url: "https://old.example/" }], source: "owner", verified: true, updatedAt: "x", updatedBy: owner.userId } } } as never;
    expect(confirmationPatch({ key: "hours", value: { weekly: [{ day: 1, opens: "07:00", closes: "15:00" }] } }, record)).toEqual({ ok: true, patch: { facts: { hours: { value: { timezone: "America/New_York", weekly: [{ day: 1, opens: "07:00", closes: "15:00" }] }, verified: true } } } });
    expect(confirmationPatch({ key: "website", value: "https://bakery.example/" }, record)).toEqual({ ok: true, patch: { facts: { links: { value: [{ kind: "website", url: "https://bakery.example/" }, { kind: "instagram", url: "https://instagram.com/bakery" }], verified: true } } } });
    expect(confirmationPatch({ key: "hours", value: { weekly: [] } }, { facts: {} } as never)).toEqual({ ok: false, reason: "needs_timezone" });
    expect(confirmationPatch({ key: "categories", value: ["Bakery"] }, record)).toEqual({ ok: false, reason: "no_record_fact" });
  });
});

describe("importing found facts never confirms them", () => {
  const listing = (getLocation: ReturnType<typeof vi.fn>) => ({ listing: async () => ({ client: { getLocation: getLocation as never }, location }), record: vi.fn().mockResolvedValue([]) });
  it("records open found facts for the owner and writes nothing to the business record", async () => {
    const deps = listing(vi.fn().mockResolvedValue({ ok: true, data: googleLocation }));
    expect(await importGoogleFoundFacts(owner, WS, deps)).toEqual({ status: "found", count: 5 });
    expect(deps.record).toHaveBeenCalledWith(owner, WS, "accounts/123/locations/456", expect.any(Array));
    expect(f.patch).not.toHaveBeenCalled();
  });
  it("keeps the connection and records nothing when Google's quota is 0", async () => {
    const deps = listing(vi.fn().mockResolvedValue({ ok: false, kind: "setup_pending", status: 429, detail: "limit of 0" }));
    expect(await importGoogleFoundFacts(owner, WS, deps)).toEqual({ status: "access_pending", count: 0 });
    expect(deps.record).not.toHaveBeenCalled();
  });
  it("refuses with the flag off, for a non-owner, and with publishing off", async () => {
    const deps = listing(vi.fn());
    vi.stubEnv("STRELVA_GOOGLE_OWNER_CONNECT", "0");
    await expect(importGoogleFoundFacts(owner, WS, deps)).rejects.toThrow("isn't open");
    vi.stubEnv("STRELVA_GOOGLE_OWNER_CONNECT", "1");
    f.record.mockResolvedValue({ access: "agency", revision: 1, facts: {} });
    await expect(importGoogleFoundFacts(other, WS, deps)).rejects.toThrow("Only the business owner");
    f.publishing.mockResolvedValue(false);
    await expect(admitOwnerConnect(owner, WS)).rejects.toThrow("isn't open");
    expect(deps.record).not.toHaveBeenCalled();
  });
  it("owner confirm writes the record as owner, verified, then settles; dismiss never writes", async () => {
    const stored = [{ id: FACT, source: "google_listing", sourceRef: "accounts/123/locations/456", key: "phone", value: "(716) 555-0100", foundAt: "2026-10-12" }];
    const deps = { read: vi.fn().mockResolvedValue(stored), settle: vi.fn(), record: f.record, patch: f.patch };
    const commandId = "33333333-3333-4333-8333-333333333333";
    expect(await decideFoundFact(owner, WS, { factId: FACT, decision: "confirm", commandId }, deps as never)).toBe("confirmed");
    expect(f.patch).toHaveBeenCalledWith(owner, WS, 4, { facts: { phone: { value: "(716) 555-0100", verified: true } } }, { source: "owner", commandId });
    expect(deps.settle).toHaveBeenCalledWith(owner, WS, FACT, "confirmed");
    f.patch.mockClear(); deps.settle.mockClear();
    expect(await decideFoundFact(owner, WS, { factId: FACT, decision: "dismiss", commandId }, deps as never)).toBe("dismissed");
    expect(f.patch).not.toHaveBeenCalled(); expect(deps.settle).toHaveBeenCalledWith(owner, WS, FACT, "dismissed");
    f.record.mockResolvedValue({ access: "member", revision: 4, facts: {} });
    await expect(decideFoundFact(other, WS, { factId: FACT, decision: "confirm", commandId }, deps as never)).rejects.toThrow("Only the business owner");
  });
});

describe("Connect Google step one: find your listing", () => {
  const deps = (fetcher?: typeof fetch) => ({ admit: admitOwnerConnect, fetcher });
  async function started() {
    const begun = await beginGoogleDiscovery(owner, WS, "https://app.example.test", deps());
    return { ...begun, state: new URL(begun.url).searchParams.get("state")! };
  }
  it("asks only for identity and listing access, online, with no refresh token", async () => {
    const url = new URL((await started()).url);
    expect(url.searchParams.get("scope")).toBe("openid email https://www.googleapis.com/auth/business.manage");
    expect(url.searchParams.get("access_type")).toBe("online");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.test/api/workspace/publishing/google/discover/callback");
    expect(url.searchParams.get("scope")).not.toContain("webmasters");
    f.record.mockResolvedValue({ access: "agency", revision: 1, facts: {} });
    await expect(beginGoogleDiscovery(other, WS, "https://app.example.test", deps())).rejects.toThrow("Only the business owner");
  });
  it("lists the account's listings into a signed choice bound to this owner and business", async () => {
    const { state, nonce } = await started();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ access_token: "short-lived", scope: "openid email https://www.googleapis.com/auth/business.manage", expires_in: 3599 }))
      .mockResolvedValueOnce(json({ sub: "g-1", email: "Owner@Gmail.test", email_verified: true }))
      .mockResolvedValueOnce(json({ accounts: [{ name: "accounts/123" }] }))
      .mockResolvedValueOnce(json({ locations: [{ name: "locations/456", title: "Synthetic Bakery", storefrontAddress: { addressLines: ["1 Main St"], locality: "Buffalo" } }] }));
    const result = await finishGoogleDiscovery(owner, state, nonce, "code", "https://app.example.test", deps(fetcher as unknown as typeof fetch));
    expect(result.status).toBe("chosen");
    if (result.status !== "chosen") return;
    expect(result.choices).toMatchObject({ googleEmail: "owner@gmail.test", listings: [{ accountId: "accounts/123", locationId: "456", title: "Synthetic Bakery", address: "1 Main St, Buffalo" }], more: false });
    expect(result.cookie.length).toBeLessThan(4000);
    expect(String(fetcher.mock.calls[0]![1].body)).not.toContain("refresh_token");
    const choices = readDiscoveryChoices(owner, WS, result.cookie)!;
    expect(chosenTarget(choices, "accounts/123", "456")).toEqual({ workspaceId: WS, googlePrincipalEmail: "owner@gmail.test", accountId: "accounts/123", locationId: "456" });
    expect(() => chosenTarget(choices, "accounts/123", "999")).toThrow("Choose one of the listings");
    expect(readDiscoveryChoices(other, WS, result.cookie)).toBeNull();
    expect(readDiscoveryChoices(owner, "44444444-4444-4444-8444-444444444444", result.cookie)).toBeNull();
    expect(readDiscoveryChoices(owner, WS, `${result.cookie}x`)).toBeNull();
  });
  it("reports access pending when Google's Business Profile quota is 0, refused on a plain 403", async () => {
    const run = async (accounts: Response) => {
      const { state, nonce } = await started();
      const fetcher = vi.fn().mockResolvedValueOnce(json({ access_token: "t", scope: "openid email https://www.googleapis.com/auth/business.manage" })).mockResolvedValueOnce(json({ email: "o@gmail.test", email_verified: true })).mockResolvedValueOnce(accounts);
      return finishGoogleDiscovery(owner, state, nonce, "code", "https://app.example.test", deps(fetcher as unknown as typeof fetch));
    };
    expect(await run(quotaZero())).toEqual({ status: "access_pending", workspaceId: WS });
    expect(await run(forbidden())).toEqual({ status: "refused", workspaceId: WS });
  });
  it("refuses a state from another session before any Google call", async () => {
    const { state, nonce } = await started();
    const fetcher = vi.fn();
    await expect(finishGoogleDiscovery(owner, state, "wrong-nonce", "code", "https://app.example.test", deps(fetcher as unknown as typeof fetch))).rejects.toThrow("expired");
    await expect(finishGoogleDiscovery(other, state, nonce, "code", "https://app.example.test", deps(fetcher as unknown as typeof fetch))).rejects.toThrow("expired");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("refuses a grant without listing access", async () => {
    const { state, nonce } = await started();
    const fetcher = vi.fn().mockResolvedValueOnce(json({ access_token: "t", scope: "openid email" }));
    expect((await finishGoogleDiscovery(owner, state, nonce, "code", "https://app.example.test", deps(fetcher as unknown as typeof fetch))).status).toBe("refused");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("an agency holding the Google area copies a connect link", () => {
  it("links a first connect to the owner's own Connect Google and sends nothing", async () => {
    f.readLink.mockResolvedValue({ kind: "first_connect", agencyWorkspaceId: WS });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await agencyGoogleConnectLink(other, WS);
    expect(result).toMatchObject({ kind: "first_connect", link: `https://app.example.test/workspace/google?workspaceId=${WS}&connect=start` });
    expect(result.message).toContain("nothing changes on Google until you approve it");
    expect(result.message).not.toMatch(/Strelva Agency/);
    expect(fetchSpy).not.toHaveBeenCalled(); fetchSpy.mockRestore();
  });
  it("uses the existing confirm-then-consent reconnect link for a disconnected grant", async () => {
    f.readLink.mockResolvedValue({ kind: "reconnect", agencyWorkspaceId: WS, target: { id: "outage-1" } });
    expect(await agencyGoogleConnectLink(other, WS)).toMatchObject({ kind: "reconnect", link: "https://app.example.test/api/publishing/google/reconnect?token=signed-outage-1" });
    f.readLink.mockResolvedValue({ kind: "connected", agencyWorkspaceId: WS });
    expect(await agencyGoogleConnectLink(other, WS)).not.toHaveProperty("link");
  });
  it("is closed with the flag off, before asking SQL", async () => {
    vi.stubEnv("STRELVA_GOOGLE_OWNER_CONNECT", "");
    await expect(agencyGoogleConnectLink(other, WS)).rejects.toThrow("aren't open");
    expect(f.readLink).not.toHaveBeenCalled();
  });
});
