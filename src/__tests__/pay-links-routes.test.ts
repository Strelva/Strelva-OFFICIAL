import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PayLinkConflictError, type PayLinkConfig } from "@/lib/pay-links";

const mockIsSuperAdmin = vi.hoisted(() => vi.fn());
const mockGetCurrentUserEmail = vi.hoisted(() => vi.fn());
const mockGetActorContext = vi.hoisted(() => vi.fn());
const mockLogAuditEvent = vi.hoisted(() => vi.fn());
const mockSavePayLink = vi.hoisted(() => vi.fn());
const mockGetPayLink = vi.hoisted(() => vi.fn());
const mockListPayLinks = vi.hoisted(() => vi.fn());
const mockIsRateLimitedAsync = vi.hoisted(() => vi.fn());
const mockCheckoutCreate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
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
  };
});

vi.mock("@/lib/rate-limit", () => ({
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
  it("mints a fixed-amount build link and persists it", async () => {
    const { POST } = await import("@/app/api/admin/pay-links/route");
    const res = await POST(
      adminReq({
        slug: "acme-coffee",
        clientName: "Acme Coffee",
        door: "build",
        tenantId: "acme",
        amountCents: 200_000,
      }),
    );

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload).toMatchObject({ success: true, slug: "acme-coffee", payUrl: "/pay/acme-coffee" });
    expect(mockSavePayLink).toHaveBeenCalledTimes(1);
    const [saved] = mockSavePayLink.mock.calls[0] as [PayLinkConfig];
    expect(saved).toMatchObject({
      slug: "acme-coffee",
      door: "build",
      amountCents: 200_000,
      createdBy: "jacob@strelva.com",
    });
  });

  it("rejects a non-super-admin with 403", async () => {
    mockIsSuperAdmin.mockResolvedValue(false);
    const { POST } = await import("@/app/api/admin/pay-links/route");
    const res = await POST(adminReq({ slug: "x", clientName: "X", door: "build", tenantId: "x", amountCents: 200_000 }));
    expect(res.status).toBe(403);
    expect(mockSavePayLink).not.toHaveBeenCalled();
  });

  it("rejects a malformed payload with 400", async () => {
    const { POST } = await import("@/app/api/admin/pay-links/route");
    const res = await POST(adminReq({ slug: "acme", clientName: "Acme", door: "donation", tenantId: "acme", amountCents: 200_000 }));
    expect(res.status).toBe(400);
    expect(mockSavePayLink).not.toHaveBeenCalled();
  });

  it("refuses to overwrite an existing slug with 409 unless overwrite is passed", async () => {
    mockSavePayLink.mockRejectedValueOnce(new PayLinkConflictError("acme-coffee"));
    const { POST } = await import("@/app/api/admin/pay-links/route");
    const res = await POST(
      adminReq({
        slug: "acme-coffee",
        clientName: "Acme Coffee",
        door: "build",
        tenantId: "acme",
        amountCents: 200_000,
      }),
    );
    expect(res.status).toBe(409);
    // Default save call passes overwrite:false.
    const [, opts] = mockSavePayLink.mock.calls[0] as [PayLinkConfig, { overwrite?: boolean }];
    expect(opts).toEqual({ overwrite: false });
  });

  it("passes overwrite:true through to savePayLink when requested", async () => {
    const { POST } = await import("@/app/api/admin/pay-links/route");
    const res = await POST(
      adminReq({
        slug: "acme-coffee",
        clientName: "Acme Coffee",
        door: "build",
        tenantId: "acme",
        amountCents: 200_000,
        overwrite: true,
      }),
    );
    expect(res.status).toBe(200);
    const [, opts] = mockSavePayLink.mock.calls[0] as [PayLinkConfig, { overwrite?: boolean }];
    expect(opts).toEqual({ overwrite: true });
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
    expect(lineItems[0].price_data.unit_amount).toBe(200_000);
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
    expect(lineItems[0].price_data.unit_amount).toBe(75_000);
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
    expect(lineItems[0].price_data.unit_amount).toBe(75_000);
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
    expect(lineItems[0].price_data.unit_amount).toBe(200_000);
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
