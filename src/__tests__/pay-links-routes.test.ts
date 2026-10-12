import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/platform/operator-read-audit/admission", () => ({ authorizeAdminOperatorRead: vi.fn(async () => undefined) }));
import { NextRequest } from "next/server";
import { type PayLinkConfig } from "@/lib/pay-links";

const mockIsSuperAdmin = vi.hoisted(() => vi.fn());
const mockGetCurrentUserEmail = vi.hoisted(() => vi.fn());
const mockGetActorContext = vi.hoisted(() => vi.fn());
const mockLogAuditEvent = vi.hoisted(() => vi.fn());
const mockSavePayLink = vi.hoisted(() => vi.fn());
const mockGetPayLink = vi.hoisted(() => vi.fn());
const mockListPayLinks = vi.hoisted(() => vi.fn());
const mockDeletePayLink = vi.hoisted(() => vi.fn());
const mockListBuildPayments = vi.hoisted(() => vi.fn());
const mockIsRateLimitedAsync = vi.hoisted(() => vi.fn());
const mockCheckoutCreate = vi.hoisted(() => vi.fn());

vi.mock("@/platform/infra/auth", () => ({
  isSuperAdmin: mockIsSuperAdmin,
  getCurrentUserEmail: mockGetCurrentUserEmail,
  getActorContext: mockGetActorContext,
}));

vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");
  return { ...actual, logAuditEvent: mockLogAuditEvent };
});

// The admin route persists; the public route reads. Keep the pure helpers real
// (validation/format) and only stub the Redis-backed save/get.
vi.mock("@/lib/pay-links", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pay-links")>("@/lib/pay-links");
  return {
    ...actual,
    savePayLink: mockSavePayLink,
    getPayLink: mockGetPayLink,
    listPayLinks: mockListPayLinks,
    deletePayLink: mockDeletePayLink,
  };
});

vi.mock("@/lib/revenue", () => ({ listBuildPayments: mockListBuildPayments }));

vi.mock("@/platform/infra/rate-limit", () => ({
  isRateLimitedAsync: mockIsRateLimitedAsync,
  rateLimitKey: (_req: unknown, prefix: string) => `key:${prefix}`,
}));

vi.mock("stripe", () => {
  class FakeStripe {
    checkout = { sessions: { create: (...args: unknown[]) => mockCheckoutCreate(...args) } };
  }
  return { default: FakeStripe };
});

const ORIGINAL_SECRET = process.env.STRIPE_SECRET_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  mockIsSuperAdmin.mockResolvedValue(true);
  mockGetCurrentUserEmail.mockResolvedValue("jacob@strelva.com");
  mockGetActorContext.mockResolvedValue({
    userId: "u_test",
    email: "jacob@strelva.com",
    type: "super_admin",
    isSuperAdmin: true,
    isImpersonating: false,
  });
  mockLogAuditEvent.mockResolvedValue(undefined);
  mockSavePayLink.mockResolvedValue(undefined);
  mockListPayLinks.mockResolvedValue([]);
  mockDeletePayLink.mockResolvedValue(true);
  mockListBuildPayments.mockResolvedValue([]);
  mockIsRateLimitedAsync.mockResolvedValue(false);
  mockCheckoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/cs_test_123" });
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = ORIGINAL_SECRET;
});

function adminReq(body: unknown) {
  return new Request("http://localhost/api/admin/pay-links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function payReq(slug: string, body: unknown) {
  return new NextRequest(`http://localhost/api/pay/${slug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", host: "strelva.com" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/pay-links", () => {
  it("requires platform support even for the compatibility refusal", async () => {
    mockIsSuperAdmin.mockResolvedValue(false);
    const { POST } = await import("@/app/api/admin/pay-links/route");
    expect((await POST(adminReq({}))).status).toBe(403);
  });
  it.each(["0", "1"])("never sells client work under platform authority with billing flag %s", async flag => {
    vi.stubEnv("STRELVA_BUSINESS_BILLING", flag);
    const { POST } = await import("@/app/api/admin/pay-links/route");
    const res = await POST(adminReq({ slug: "acme", clientName: "Acme", amountCents: 200000, overwrite: true }));
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ agencyPath: "/api/agency/payment-links" });
    expect(mockSavePayLink).not.toHaveBeenCalled();
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});

describe("GET /api/admin/pay-links", () => {
  it("rejects a non-super-admin with 403", async () => {
    mockIsSuperAdmin.mockResolvedValue(false);
    const { GET } = await import("@/app/api/admin/pay-links/route");
    const res = await GET();
    expect(res.status).toBe(403);
    expect(mockListPayLinks).not.toHaveBeenCalled();
  });

  it("lists every minted pay link with createdAt/createdBy", async () => {
    const links: PayLinkConfig[] = [
      {
        slug: "acme-coffee",
        clientName: "Acme Coffee",
        door: "build",
        tenantId: "acme",
        amountCents: 200_000,
        createdAt: "2026-06-09T00:00:00.000Z",
        createdBy: "jacob@strelva.com",
      },
      {
        slug: "lead-bakery",
        clientName: "Lead Bakery",
        door: "managed_start",
        leadSlug: "lead-bakery",
        minCents: 49_900,
        maxCents: 99_900,
        createdAt: "2026-06-08T00:00:00.000Z",
        createdBy: "jacob@strelva.com",
      },
    ];
    mockListPayLinks.mockResolvedValue(links);
    const { GET } = await import("@/app/api/admin/pay-links/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.count).toBe(2);
    expect(payload.payLinks).toHaveLength(2);
    expect(payload.payLinks[0]).toMatchObject({
      slug: "acme-coffee",
      createdAt: "2026-06-09T00:00:00.000Z",
      createdBy: "jacob@strelva.com",
    });
  });

  it("marks links paid by cross-referencing the build-payment trail", async () => {
    mockListPayLinks.mockResolvedValue([
      { slug: "acme-coffee", clientName: "Acme", door: "build", amountCents: 200_000, createdAt: "2026-06-09T00:00:00.000Z" },
      { slug: "unpaid", clientName: "Nobody", door: "build", amountCents: 150_000, createdAt: "2026-06-08T00:00:00.000Z" },
    ] as PayLinkConfig[]);
    mockListBuildPayments.mockResolvedValue([
      { sessionId: "s1", paySlug: "acme-coffee", amountCents: 200_000, currency: "usd", createdAt: "2026-06-10T00:00:00.000Z" },
    ]);
    const { GET } = await import("@/app/api/admin/pay-links/route");
    const payload = await (await GET()).json();
    // The GET response now returns an enriched paidPayments map (amount/email/paidAt),
    // not a bare slug list, so the admin list can show what was actually paid.
    expect(Object.keys(payload.paidPayments)).toEqual(["acme-coffee"]);
    expect(payload.paidPayments["acme-coffee"]).toMatchObject({ amountCents: 200_000 });
    expect(payload.paidPayments.unpaid).toBeUndefined();
  });
});

describe("DELETE /api/admin/pay-links", () => {
  it("requires support and refuses changes to agency service invoices", async () => {
    const { DELETE } = await import("@/app/api/admin/pay-links/route");
    expect((await DELETE(new Request("http://localhost/api/admin/pay-links?slug=acme", { method: "DELETE" }))).status).toBe(410);
    expect(mockDeletePayLink).not.toHaveBeenCalled(); expect(mockLogAuditEvent).not.toHaveBeenCalled();
    mockIsSuperAdmin.mockResolvedValue(false);
    expect((await DELETE(new Request("http://localhost/api/admin/pay-links", { method: "DELETE" }))).status).toBe(403);
  });
});

describe("POST /api/pay/[slug]", () => {
  const fixedConfig: PayLinkConfig = {
    slug: "acme-coffee",
    clientName: "Acme Coffee",
    door: "build",
    tenantId: "acme",
    amountCents: 200_000,
    createdAt: "2026-06-09T00:00:00.000Z",
  };
  const leadRangeConfig: PayLinkConfig = {
    slug: "lead-bakery",
    clientName: "Lead Bakery",
    door: "managed_start",
    leadSlug: "lead-bakery",
    minCents: 49_900,
    maxCents: 99_900,
    createdAt: "2026-06-09T00:00:00.000Z",
  };

  it("creates a payment-mode checkout with the right metadata (fixed/build/tenant)", async () => {
    mockGetPayLink.mockResolvedValue(fixedConfig);
    const { POST } = await import("@/app/api/pay/[slug]/route");
    const res = await POST(payReq("acme-coffee", { customerEmail: "owner@acme.com" }), {
      params: Promise.resolve({ slug: "acme-coffee" }),
    });

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.checkoutUrl).toContain("checkout.stripe.com");

    const [args] = mockCheckoutCreate.mock.calls[0] as [Record<string, unknown>];
    expect(args.mode).toBe("payment");
    expect(args.client_reference_id).toBe("acme");
    expect(args.customer_email).toBe("owner@acme.com");
    expect(args.metadata).toMatchObject({
      paySlug: "acme-coffee",
      door: "build",
      paymentPurpose: "build_payment",
      tenantId: "acme",
      selectedAmountCents: "200000",
    });
    const lineItems = args.line_items as Array<{ price_data: { unit_amount: number } }>;
    expect(lineItems[0]!.price_data.unit_amount).toBe(200_000);
  });

  it("supports a pre-tenant lead range link without a tenantId", async () => {
    mockGetPayLink.mockResolvedValue(leadRangeConfig);
    const { POST } = await import("@/app/api/pay/[slug]/route");
    const res = await POST(payReq("lead-bakery", { amount: "699" }), {
      params: Promise.resolve({ slug: "lead-bakery" }),
    });

    expect(res.status).toBe(200);
    const [args] = mockCheckoutCreate.mock.calls[0] as [Record<string, unknown>];
    expect(args.client_reference_id).toBeUndefined();
    expect(args.metadata).toMatchObject({
      paySlug: "lead-bakery",
      door: "managed_start",
      paymentPurpose: "managed_start",
      leadSlug: "lead-bakery",
      selectedAmountCents: "69900",
    });
    expect((args.metadata as Record<string, string>).tenantId).toBeUndefined();
  });

  it("reads a numeric JSON amount as WHOLE DOLLARS (range link)", async () => {
    mockGetPayLink.mockResolvedValue(leadRangeConfig);
    const { POST } = await import("@/app/api/pay/[slug]/route");
    // {"amount": 750} -> $750 -> 75_000 cents, inside [$499, $999]. Prior bug
    // read the number as 750 cents ($7.50) and rejected it.
    const res = await POST(payReq("lead-bakery", { amount: 750 }), {
      params: Promise.resolve({ slug: "lead-bakery" }),
    });
    expect(res.status).toBe(200);
    const [args] = mockCheckoutCreate.mock.calls[0] as [Record<string, unknown>];
    const lineItems = args.line_items as Array<{ price_data: { unit_amount: number } }>;
    expect(lineItems[0]!.price_data.unit_amount).toBe(75_000);
    expect((args.metadata as Record<string, string>).selectedAmountCents).toBe("75000");
  });

  it("reads a numeric-string amount identically to the number (range link)", async () => {
    mockGetPayLink.mockResolvedValue(leadRangeConfig);
    const { POST } = await import("@/app/api/pay/[slug]/route");
    const res = await POST(payReq("lead-bakery", { amount: "750" }), {
      params: Promise.resolve({ slug: "lead-bakery" }),
    });
    expect(res.status).toBe(200);
    const [args] = mockCheckoutCreate.mock.calls[0] as [Record<string, unknown>];
    const lineItems = args.line_items as Array<{ price_data: { unit_amount: number } }>;
    expect(lineItems[0]!.price_data.unit_amount).toBe(75_000);
  });

  it("returns 404 for an unknown slug", async () => {
    mockGetPayLink.mockResolvedValue(null);
    const { POST } = await import("@/app/api/pay/[slug]/route");
    const res = await POST(payReq("nope", { amount: "2000" }), {
      params: Promise.resolve({ slug: "nope" }),
    });
    expect(res.status).toBe(404);
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
  });

  it("rejects a range amount outside the bounds with 400", async () => {
    mockGetPayLink.mockResolvedValue(leadRangeConfig);
    const { POST } = await import("@/app/api/pay/[slug]/route");
    const res = await POST(payReq("lead-bakery", { amount: "100" }), {
      params: Promise.resolve({ slug: "lead-bakery" }),
    });
    expect(res.status).toBe(400);
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
  });

  it("charges the configured amount for a fixed link regardless of submitted amount", async () => {
    mockGetPayLink.mockResolvedValue(fixedConfig);
    const { POST } = await import("@/app/api/pay/[slug]/route");
    // Attacker tries to pay $50 for a $2,000 build.
    const res = await POST(payReq("acme-coffee", { amount: "50" }), {
      params: Promise.resolve({ slug: "acme-coffee" }),
    });
    expect(res.status).toBe(200);
    const [args] = mockCheckoutCreate.mock.calls[0] as [Record<string, unknown>];
    const lineItems = args.line_items as Array<{ price_data: { unit_amount: number } }>;
    expect(lineItems[0]!.price_data.unit_amount).toBe(200_000);
  });

  it("returns 429 when rate limited", async () => {
    mockIsRateLimitedAsync.mockResolvedValue(true);
    const { POST } = await import("@/app/api/pay/[slug]/route");
    const res = await POST(payReq("acme-coffee", { amount: "2000" }), {
      params: Promise.resolve({ slug: "acme-coffee" }),
    });
    expect(res.status).toBe(429);
    expect(mockGetPayLink).not.toHaveBeenCalled();
  });
});

it("refuses expired checkout before parsing payment input or calling Stripe", async () => {
  mockGetPayLink.mockResolvedValue({ slug: "expired", clientName: "Acme", door: "build", amountCents: 50000, createdAt: "2026-10-12", revokedAt: "2026-10-12", revokedBy: "agency-owner" });
  const { POST } = await import("@/app/api/pay/[slug]/route");
  const response = await POST(new NextRequest("https://app.example.test/api/pay/expired", { method: "POST", body: "invalid json" }), { params: Promise.resolve({ slug: "expired" }) });
  expect(response.status).toBe(410); expect((await response.json()).error).toContain("expired"); expect(mockCheckoutCreate).not.toHaveBeenCalled();
});
it("keeps support GET read-only and operator-audited", async () => {
  const { GET, POST, DELETE } = await import("@/app/api/admin/pay-links/route");
  const { authorizeAdminOperatorRead } = await import("@/platform/operator-read-audit/admission");
  expect((await GET()).status).toBe(200);
  expect(mockListBuildPayments).toHaveBeenCalledWith(200, { readOnly: true, strict: true });
  expect(authorizeAdminOperatorRead).toHaveBeenCalledWith("admin.pay-links.read");
  expect((await POST(new Request("https://example.test"))).status).toBe(410);
  expect((await DELETE(new Request("https://example.test"))).status).toBe(410);
  expect(mockSavePayLink).not.toHaveBeenCalled(); expect(mockDeletePayLink).not.toHaveBeenCalled();
});

it("an existing unowned link still starts the identical one-off Stripe checkout", async () => {
  mockGetPayLink.mockResolvedValue({ slug: "legacy", clientName: "Coffee", door: "build", tenantId: "coffee", amountCents: 50000, createdAt: "2026-07-01", createdBy: "old@example.test" });
  const { POST } = await import("@/app/api/pay/[slug]/route");
  const response = await POST(payReq("legacy", {}), { params: Promise.resolve({ slug: "legacy" }) });
  expect(response.status).toBe(200);
  expect(mockCheckoutCreate).toHaveBeenCalledWith(expect.objectContaining({ mode: "payment", client_reference_id: "coffee", metadata: { paySlug: "legacy", door: "build", paymentPurpose: "build_payment", selectedAmountCents: "50000", tenantId: "coffee" } }));
});
