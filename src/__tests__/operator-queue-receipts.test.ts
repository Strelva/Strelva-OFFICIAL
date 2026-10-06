import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantConfig } from "../lib/types";

/**
 * Receipts on the real write paths: Google review replies and domain add /
 * claim removal. The write itself is unchanged; each sent write leaves one
 * receipt; a failed read-back is recorded, never retried; a claim removal
 * never calls Vercel.
 *
 * Review replies here are the legacy publisher, which the approve path still
 * uses for a tenant not linked to a business (or with the publishing release
 * off). A linked tenant's reply records in google_listing_receipts instead:
 * see review-reply-listing-path.test.ts.
 */

const receipts: Record<string, unknown>[] = [];
let tenants: TenantConfig[] = [];

vi.mock("../lib/redis", () => ({
  getRedis: vi.fn(() => ({ get: vi.fn(async () => ({ accountId: "accounts/1", locationId: "locations/2" })), set: vi.fn(), del: vi.fn(), hset: vi.fn(), hdel: vi.fn() })),
}));
vi.mock("../lib/connections", () => ({
  getConnection: vi.fn(async () => ({ status: "connected", accessToken: "token", scopes: undefined })),
  saveConnection: vi.fn(),
}));
vi.mock("../lib/events", () => ({ addEvent: vi.fn(async () => undefined) }));
vi.mock("../lib/slack", () => ({ sendSlackNotification: vi.fn(async () => undefined) }));
vi.mock("../lib/google-token", () => ({ refreshAccessToken: vi.fn() }));
vi.mock("../lib/tenants", () => ({
  getAllTenants: vi.fn(() => Promise.resolve(tenants)),
  getTenantConfig: vi.fn((tenantId: string) => Promise.resolve(tenants.find((tenant) => tenant.id === tenantId))),
  isActiveTenant: (tenant: Pick<TenantConfig, "active">) => tenant.active !== false,
  invalidateDomainMapCache: vi.fn(),
  updateTenant: vi.fn((tenantId: string, updates: Partial<TenantConfig>) => {
    const index = tenants.findIndex((tenant) => tenant.id === tenantId);
    if (index === -1) return Promise.resolve(null);
    tenants[index] = { ...tenants[index]!, ...updates, id: tenantId };
    return Promise.resolve(tenants[index] ?? null);
  }),
}));

function tenant(id: string, overrides: Partial<TenantConfig> = {}): TenantConfig {
  return { id, subdomain: id, siteName: id, ownerName: id, industry: "wellness", active: true, createdAt: "2026-01-01", template: "wellness", subscriptionStatus: "active", ...overrides };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(async () => {
  receipts.length = 0;
  vi.restoreAllMocks();
  const { setReceiptWriter } = await import("../platform/operator-queue/receipts");
  setReceiptWriter(async (receipt) => {
    receipts.push(receipt);
    return { id: "99999999-9999-4999-8999-999999999999", ...receipt } as never;
  });
  tenants = [tenant("alpha", { productionDomain: "alpha.com", customDomains: ["alpha.com", "shop.alpha.com"] }), tenant("beta")];
  delete process.env.VERCEL_API_TOKEN;
  delete process.env.VERCEL_PROJECT_ID;
});

afterEach(async () => {
  const { setReceiptWriter } = await import("../platform/operator-queue/receipts");
  setReceiptWriter(null);
});

describe("review reply receipts", () => {
  it("accepted and read back matched: one receipt with the plain no-undo label", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(json({ reviewReply: { comment: "Thank you!" } }));
    const { publishReviewReply } = await import("../lib/gbp-replies");
    const result = await publishReviewReply("alpha", "rev_1", "Thank you!", { actor: "approved event evt_1" });
    expect(result).toMatchObject({ published: true, verified: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      provider: "google_business", writeKind: "review_reply", tenantId: "alpha", acceptance: "accepted", readback: "matched",
      undo: "not_available", undoLabel: "Google review replies can't be undone from Strelva. You can edit or delete the reply in Google.",
      actor: "approved event evt_1", request: { reviewId: "rev_1", reply: "Thank you!" },
    });
  });

  it("accepted but read-back failed: recorded as failed and the reply is not re-sent", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("nope", { status: 503 }));
    const { publishReviewReply } = await import("../lib/gbp-replies");
    const result = await publishReviewReply("alpha", "rev_2", "Thanks!");
    expect(result).toMatchObject({ published: true, verified: false });
    const puts = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PUT");
    expect(puts).toHaveLength(1);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({ acceptance: "accepted", readback: "failed" });
  });

  it("accepted but the live reply differs: recorded as differs", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(json({ reviewReply: { comment: "Something else" } }));
    const { publishReviewReply } = await import("../lib/gbp-replies");
    await publishReviewReply("alpha", "rev_3", "Thanks!");
    expect(receipts[0]).toMatchObject({ acceptance: "accepted", readback: "differs" });
  });

  it("rejected by Google: a rejected receipt, nothing to read back", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
    const { publishReviewReply } = await import("../lib/gbp-replies");
    const result = await publishReviewReply("alpha", "rev_4", "Thanks!");
    expect(result.published).toBe(false);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({ acceptance: "rejected", readback: "not_possible", acceptanceDetail: "Google answered 403." });
  });

  it("a network error is unknown acceptance, not rejected", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("socket hang up"));
    const { publishReviewReply } = await import("../lib/gbp-replies");
    await publishReviewReply("alpha", "rev_5", "Thanks!");
    expect(receipts[0]).toMatchObject({ acceptance: "unknown", readback: "not_possible" });
  });

  it("a receipt that can't be saved never changes the result or re-sends", async () => {
    const { setReceiptWriter } = await import("../platform/operator-queue/receipts");
    setReceiptWriter(async () => { throw new Error("Queue storage is unavailable."); });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(json({ reviewReply: { comment: "Thanks!" } }));
    const { publishReviewReply } = await import("../lib/gbp-replies");
    const result = await publishReviewReply("alpha", "rev_6", "Thanks!");
    expect(result).toMatchObject({ published: true, verified: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(errors).toHaveBeenCalledWith("[outside-write-receipt] not recorded", expect.objectContaining({ writeKind: "review_reply" }));
  });
});

describe("domain receipts", () => {
  it("a Vercel add records acceptance and a GET read-back; undo is the claim only", async () => {
    process.env.VERCEL_API_TOKEN = "token";
    process.env.VERCEL_PROJECT_ID = "project_123";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => json({ name: "beta.com", verified: false }));
    const { addCustomDomain } = await import("../lib/domains");
    const result = await addCustomDomain("beta", "beta.com", "production", { actor: "operator console" });
    expect(result.ok).toBe(true);
    const methods = fetchMock.mock.calls.map(([, init]) => (init as RequestInit | undefined)?.method ?? "GET");
    expect(methods).toEqual(["POST", "GET"]);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      provider: "vercel", writeKind: "domain_add", subject: "beta.com", acceptance: "accepted", readback: "matched",
      undo: "claim_only", actor: "operator console",
    });
  });

  it("a Vercel rejection records a rejected receipt and no read-back call", async () => {
    process.env.VERCEL_API_TOKEN = "token";
    process.env.VERCEL_PROJECT_ID = "project_123";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: { message: "Domain is invalid" } }, 400));
    const { addCustomDomain } = await import("../lib/domains");
    await addCustomDomain("beta", "beta.com", "production");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(receipts[0]).toMatchObject({ acceptance: "rejected", readback: "not_possible", acceptanceDetail: "Domain is invalid" });
  });

  it("without Vercel configured nothing left Strelva, so there is no receipt", async () => {
    const { addCustomDomain } = await import("../lib/domains");
    await addCustomDomain("beta", "beta.com", "production");
    expect(receipts).toHaveLength(0);
  });

  it("removing a claim never calls Vercel, reads the tenant back, and has no undo", async () => {
    process.env.VERCEL_API_TOKEN = "token";
    process.env.VERCEL_PROJECT_ID = "project_123";
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { removeCustomDomain } = await import("../lib/domains");
    const result = await removeCustomDomain("alpha", "shop.alpha.com", { actor: "owner dashboard" });
    expect(result.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      provider: "strelva_routing", writeKind: "domain_claim_removal", subject: "shop.alpha.com", acceptance: "accepted",
      readback: "matched", undo: "not_available", undoLabel: "No undo. Add the domain again to reconnect it.",
    });
  });

  it("the last domain is still refused, with no receipt", async () => {
    tenants = [tenant("solo", { customDomains: ["solo.com"] })];
    const { removeCustomDomain } = await import("../lib/domains");
    const result = await removeCustomDomain("solo", "solo.com");
    expect(result.ok).toBe(false);
    expect(receipts).toHaveLength(0);
  });
});
