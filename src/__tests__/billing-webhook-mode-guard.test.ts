import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Billing webhook: checkout.session.completed mode guard.
 *
 * The bug: the handler used to flip subscriptionStatus="active" for ANY
 * checkout.session.completed carrying tenantId metadata — including one-time
 * mode:"payment" sessions (the Rohlax build payment does exactly this).
 *
 * Fixed behavior:
 *  - mode:"subscription" -> updateTenant(..., subscriptionStatus:"active", ...)
 *  - mode:"payment"      -> NO subscription flip; record a build_payment event
 *
 * We mock stripe.webhooks.constructEvent so we don't need a real signature,
 * and mock Redis to null (non-prod => idempotency short-circuits to "claimed").
 */

const mockUpdateTenant = vi.fn();
const mockGetTenantConfig = vi.fn();
const mockAddEvent = vi.fn();
const mockConstructEvent = vi.fn();
const mockSubRetrieve = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisGet = vi.fn();

// A mutable handle so individual tests can opt into a fake Redis (to assert the
// durable build-payment record) while the default stays null (non-prod =>
// idempotency short-circuits to "claimed").
let redisHandle: unknown = null;

vi.mock("@/lib/tenants", () => ({
  updateTenant: (...args: unknown[]) => mockUpdateTenant(...args),
  getTenantConfig: (...args: unknown[]) => mockGetTenantConfig(...args),
}));

vi.mock("@/lib/events", () => ({
  addEvent: (...args: unknown[]) => mockAddEvent(...args),
}));

vi.mock("@/lib/redis", () => ({
  getRedis: () => redisHandle,
}));

vi.mock("@/lib/production-guard", () => ({
  isProductionEnv: vi.fn(() => false),
}));

const mockAlert = vi.fn();
vi.mock("@/lib/monitoring", () => ({
  alert: (...args: unknown[]) => mockAlert(...args),
}));

vi.mock("stripe", () => {
  class FakeStripe {
    webhooks = { constructEvent: (...args: unknown[]) => mockConstructEvent(...args) };
    subscriptions = { retrieve: (...args: unknown[]) => mockSubRetrieve(...args) };
  }
  return { default: FakeStripe };
});

const ORIGINAL_SECRET = process.env.STRIPE_SECRET_KEY;
const ORIGINAL_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_fake";
  mockUpdateTenant.mockResolvedValue({ id: "acme" });
  mockGetTenantConfig.mockResolvedValue(null);
  mockSubRetrieve.mockResolvedValue({ status: "active" });
  mockAddEvent.mockResolvedValue({ id: "evt_fake" });
  mockRedisSet.mockResolvedValue("OK");
  // Default: no Redis (matches non-prod idempotency short-circuit).
  redisHandle = null;
});

/** Opt a test into a fake Redis that records `.set` calls. `.get` returns null
 *  so the idempotency claim path short-circuits to "claimed". */
function useFakeRedis() {
  mockRedisGet.mockResolvedValue(null);
  redisHandle = {
    set: (...args: unknown[]) => mockRedisSet(...args),
    get: (...args: unknown[]) => mockRedisGet(...args),
  };
}

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = ORIGINAL_SECRET;
  if (ORIGINAL_WEBHOOK_SECRET === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = ORIGINAL_WEBHOOK_SECRET;
});

async function postEvent(event: Record<string, unknown>) {
  // Real Stripe events always carry `livemode`. The test secret is sk_test_fake,
  // so default to test-mode (livemode:false) unless a test overrides it.
  const withMode = { livemode: false, ...event };
  mockConstructEvent.mockReturnValue(withMode);
  const { POST } = await import("@/app/api/billing/webhook/route");
  const req = new Request("https://admin.strelva.com/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=fake" },
    body: JSON.stringify(event),
  });
  return POST(req);
}

describe("billing webhook checkout.session.completed mode guard", () => {
  it("ignores a live-mode event in a test-mode deploy without mutating tenant data", async () => {
    const res = await postEvent({
      id: "evt_livemode_mismatch",
      type: "checkout.session.completed",
      livemode: true, // live event, but STRIPE_SECRET_KEY is sk_test_fake
      created: 1_700_000_000,
      data: {
        object: {
          id: "cs_live_1",
          mode: "subscription",
          subscription: "sub_live",
          metadata: { tenantId: "acme" },
        },
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ignored).toBe("mode-mismatch");
    expect(mockUpdateTenant).not.toHaveBeenCalled();
  });

  it("subscription mode flips subscriptionStatus to active and records subscription id", async () => {
    const res = await postEvent({
      id: "evt_sub",
      type: "checkout.session.completed",
      created: 1_700_000_000,
      data: {
        object: {
          id: "cs_sub_1",
          mode: "subscription",
          subscription: "sub_123",
          metadata: { tenantId: "acme" },
        },
      },
    });

    expect(res.status).toBe(200);
    expect(mockUpdateTenant).toHaveBeenCalledTimes(1);
    expect(mockUpdateTenant).toHaveBeenCalledWith(
      "acme",
      expect.objectContaining({
        subscriptionStatus: "active",
        stripeSubscriptionId: "sub_123",
        subscriptionStartedAt: new Date(1_700_000_000 * 1000).toISOString(),
      })
    );
    expect(mockAddEvent).not.toHaveBeenCalled();
  });

  it("payment mode does NOT flip subscription status and records a build_payment event", async () => {
    const res = await postEvent({
      id: "evt_pay",
      type: "checkout.session.completed",
      created: 1_700_000_500,
      data: {
        object: {
          id: "cs_pay_1",
          mode: "payment",
          amount_total: 50000,
          currency: "usd",
          payment_intent: "pi_456",
          customer_details: { email: "chelsea@example.com" },
          metadata: { tenantId: "rohlax" },
        },
      },
    });

    expect(res.status).toBe(200);
    // The bug would have called updateTenant here — it must not.
    expect(mockUpdateTenant).not.toHaveBeenCalled();

    expect(mockAddEvent).toHaveBeenCalledTimes(1);
    const [eventArg] = mockAddEvent.mock.calls[0];
    expect(eventArg).toMatchObject({
      tenantId: "rohlax",
      source: "stripe",
      type: "build_payment",
      status: "auto_approved",
    });
    expect(eventArg.metadata).toMatchObject({
      stripeSessionId: "cs_pay_1",
      amountTotal: 50000,
      currency: "USD",
      paymentIntentId: "pi_456",
    });
  });

  it("payment mode without tenantId records no event and no tenant update (no throw)", async () => {
    const res = await postEvent({
      id: "evt_pay_no_tenant",
      type: "checkout.session.completed",
      created: 1_700_000_900,
      data: {
        object: {
          id: "cs_pay_2",
          mode: "payment",
          amount_total: 9900,
          currency: "usd",
          metadata: {},
        },
      },
    });

    expect(res.status).toBe(200);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
    expect(mockAddEvent).not.toHaveBeenCalled();
  });

  it("subscription event missing tenantId acks 200 + alerts (no 3-day retry storm)", async () => {
    // A signed subscription event with no tenantId metadata is non-retryable —
    // returning 500 would trigger a 3-day Stripe retry storm that fails the same
    // way every time. It must ack 200 and alert instead.
    const res = await postEvent({
      id: "evt_sub_no_tenant",
      type: "invoice.paid",
      created: 1_700_000_000,
      data: {
        object: {
          id: "in_no_tenant",
          metadata: {},
        },
      },
    });

    expect(res.status).toBe(200);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
    expect(mockAlert).toHaveBeenCalledWith(
      "billing_webhook_missing_tenant",
      "high",
      expect.objectContaining({ eventType: "invoice.paid" }),
    );
  });

  it("setup mode moves no money: no tenant update, no event, no durable record", async () => {
    useFakeRedis();
    const res = await postEvent({
      id: "evt_setup",
      type: "checkout.session.completed",
      created: 1_700_001_000,
      data: {
        object: {
          id: "cs_setup_1",
          mode: "setup",
          // setup sessions carry no amount_total — they collect a payment
          // method, they don't charge. Must never be logged as a payment.
          amount_total: null,
          currency: "usd",
          metadata: { tenantId: "rohlax" },
        },
      },
    });

    expect(res.status).toBe(200);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
    expect(mockAddEvent).not.toHaveBeenCalled();
    // No build-payment durable record should be written for a setup session.
    const buildPaymentWrites = mockRedisSet.mock.calls.filter(
      ([key]) => typeof key === "string" && key.startsWith("reb:build-payment:")
    );
    expect(buildPaymentWrites).toHaveLength(0);
  });

  it("payment mode with tenantId writes a durable, never-expiring Redis record", async () => {
    useFakeRedis();
    const res = await postEvent({
      id: "evt_pay_durable",
      type: "checkout.session.completed",
      created: 1_700_002_000,
      data: {
        object: {
          id: "cs_pay_durable",
          mode: "payment",
          amount_total: 50000,
          currency: "usd",
          payment_intent: "pi_dur",
          customer_details: { email: "chelsea@example.com" },
          metadata: { tenantId: "rohlax", paySlug: "rohlax" },
        },
      },
    });

    expect(res.status).toBe(200);

    const buildPaymentWrites = mockRedisSet.mock.calls.filter(
      ([key]) => typeof key === "string" && key.startsWith("reb:build-payment:")
    );
    expect(buildPaymentWrites).toHaveLength(1);
    const [key, value, opts] = buildPaymentWrites[0];
    expect(key).toBe("reb:build-payment:cs_pay_durable");
    // No TTL: the durable record must outlive the 90-day event prune.
    expect(opts).toBeUndefined();
    expect(value).toMatchObject({
      sessionId: "cs_pay_durable",
      paySlug: "rohlax",
      tenantId: "rohlax",
      amountCents: 50000,
      currency: "USD",
      paymentIntentId: "pi_dur",
    });
    // Tenant event still written for tenant-scoped payments.
    expect(mockAddEvent).toHaveBeenCalledTimes(1);
  });

  it("pre-tenant lead-slug-only payment still leaves a durable money trail", async () => {
    useFakeRedis();
    const res = await postEvent({
      id: "evt_pay_lead",
      type: "checkout.session.completed",
      created: 1_700_003_000,
      data: {
        object: {
          id: "cs_pay_lead",
          mode: "payment",
          amount_total: 75000,
          currency: "usd",
          // No tenantId yet — only a lead slug. The old code left NO trail here.
          metadata: { leadSlug: "new-lead", paySlug: "rohlax" },
        },
      },
    });

    expect(res.status).toBe(200);
    // No tenant => no tenant event, but the durable record must exist.
    expect(mockAddEvent).not.toHaveBeenCalled();

    const buildPaymentWrites = mockRedisSet.mock.calls.filter(
      ([key]) => typeof key === "string" && key.startsWith("reb:build-payment:")
    );
    expect(buildPaymentWrites).toHaveLength(1);
    const [key, value] = buildPaymentWrites[0];
    expect(key).toBe("reb:build-payment:cs_pay_lead");
    expect(value).toMatchObject({
      sessionId: "cs_pay_lead",
      leadSlug: "new-lead",
      paySlug: "rohlax",
      tenantId: null,
      amountCents: 75000,
      currency: "USD",
    });
  });

  it("stores a trial subscription as 'trialing' (not active) so it isn't counted as MRR", async () => {
    mockSubRetrieve.mockResolvedValue({ status: "trialing" });
    const res = await postEvent({
      id: "evt_trial",
      type: "checkout.session.completed",
      created: 1_700_000_000,
      data: { object: { id: "cs_trial", mode: "subscription", subscription: "sub_trial", metadata: { tenantId: "acme" } } },
    });
    expect(res.status).toBe(200);
    expect(mockSubRetrieve).toHaveBeenCalledWith("sub_trial");
    expect(mockUpdateTenant).toHaveBeenCalledWith("acme", expect.objectContaining({ subscriptionStatus: "trialing" }));
  });

  it("preserves the first failure's past-due timestamp instead of resetting it each failure", async () => {
    const firstFailure = "2026-06-01T00:00:00.000Z";
    mockGetTenantConfig.mockResolvedValue({ subscriptionPastDueSince: firstFailure });
    const res = await postEvent({
      id: "evt_fail2",
      type: "invoice.payment_failed",
      created: 1_700_500_000,
      data: { object: { id: "in_fail2", metadata: { tenantId: "acme" } } },
    });
    expect(res.status).toBe(200);
    expect(mockUpdateTenant).toHaveBeenCalledWith(
      "acme",
      expect.objectContaining({ subscriptionStatus: "past_due", subscriptionPastDueSince: firstFailure }),
    );
  });
});
