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
const mockGetTenantBySubId = vi.fn();
const mockGetTenantByCustomerId = vi.fn();
const mockAddEvent = vi.fn();
const mockConstructEvent = vi.fn();
const mockSubRetrieve = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisGet = vi.fn();
const mockIsProductionEnv = vi.fn(() => false);

// A mutable handle so individual tests can opt into a fake Redis (to assert the
// durable build-payment record) while the default stays null (non-prod =>
// idempotency short-circuits to "claimed").
let redisHandle: unknown = null;

vi.mock("@/lib/tenants", () => ({
  updateTenant: (...args: unknown[]) => mockUpdateTenant(...args),
  getTenantConfig: (...args: unknown[]) => mockGetTenantConfig(...args),
  getTenantByStripeSubscriptionId: (...args: unknown[]) => mockGetTenantBySubId(...args),
  getTenantByStripeCustomerId: (...args: unknown[]) => mockGetTenantByCustomerId(...args),
}));

vi.mock("@/lib/events", () => ({
  addEvent: (...args: unknown[]) => mockAddEvent(...args),
}));

vi.mock("@/lib/redis", () => ({
  getRedis: () => redisHandle,
}));

vi.mock("@/lib/production-guard", () => ({
  isProductionEnv: () => mockIsProductionEnv(),
}));

const mockAlert = vi.fn();
vi.mock("@/lib/monitoring", () => ({
  alert: (...args: unknown[]) => mockAlert(...args),
}));

const mockSendNewSignupEmail = vi.fn();
const mockSendPaymentFailedEmail = vi.fn();
const mockSendPaymentPastDueEmail = vi.fn();
vi.mock("@/lib/delivery-email", () => ({
  sendNewSignupEmail: (...args: unknown[]) => mockSendNewSignupEmail(...args),
  sendPaymentFailedEmail: (...args: unknown[]) => mockSendPaymentFailedEmail(...args),
  sendPaymentPastDueEmail: (...args: unknown[]) => mockSendPaymentPastDueEmail(...args),
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
  // Default: no stored-id match. Tests that exercise the fallback opt in.
  mockGetTenantBySubId.mockResolvedValue(undefined);
  mockGetTenantByCustomerId.mockResolvedValue(undefined);
  mockSubRetrieve.mockResolvedValue({ status: "active" });
  mockAddEvent.mockResolvedValue({ id: "evt_fake" });
  mockRedisSet.mockResolvedValue("OK");
  mockSendNewSignupEmail.mockResolvedValue(true);
  mockSendPaymentFailedEmail.mockResolvedValue(true);
  mockSendPaymentPastDueEmail.mockResolvedValue(true);
  // Default: non-production (idempotency short-circuits to "claimed" without Redis).
  mockIsProductionEnv.mockReturnValue(false);
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

  it("falls back to client_reference_id when a reusable Payment Link has no tenantId metadata", async () => {
    const res = await postEvent({
      id: "evt_sub_cref",
      type: "checkout.session.completed",
      created: 1_700_000_000,
      data: {
        object: {
          id: "cs_sub_cref",
          mode: "subscription",
          subscription: "sub_cref",
          // No metadata.tenantId — an emailed reusable link binds the tenant via
          // ?client_reference_id=<tenant> instead.
          client_reference_id: "cocard-anderson",
        },
      },
    });

    expect(res.status).toBe(200);
    expect(mockUpdateTenant).toHaveBeenCalledWith(
      "cocard-anderson",
      expect.objectContaining({
        subscriptionStatus: "active",
        stripeSubscriptionId: "sub_cref",
      })
    );
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
    const [eventArg] = mockAddEvent.mock.calls[0]!;
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
    const [key, value, opts] = buildPaymentWrites[0]!;
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
    const [key, value] = buildPaymentWrites[0]!;
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

  // --- Basil (2025-03-31) invoice shape: subscription_details live under
  // `invoice.parent`, NOT at the top level. These are the REAL money events. If
  // the tenant can't be resolved from `parent`, a failed renewal never sets
  // past_due (client keeps free access) and a converted trial never flips to
  // active MRR. metadata:{} at the top level mirrors what Stripe actually sends.
  it("Basil invoice.payment_failed (subscription_details under parent) resolves tenant and sets past_due", async () => {
    const res = await postEvent({
      id: "evt_basil_fail",
      type: "invoice.payment_failed",
      created: 1_700_600_000,
      data: {
        object: {
          id: "in_basil_fail",
          metadata: {}, // Basil: nothing at the top level
          parent: {
            subscription_details: { subscription: "sub_basil", metadata: { tenantId: "acme" } },
          },
        },
      },
    });

    expect(res.status).toBe(200);
    expect(mockUpdateTenant).toHaveBeenCalledWith(
      "acme",
      expect.objectContaining({ subscriptionStatus: "past_due" }),
    );
    // The stored-id fallback isn't needed — parent metadata resolved it.
    expect(mockGetTenantBySubId).not.toHaveBeenCalled();
    expect(mockAlert).toHaveBeenCalledWith(
      "billing_payment_failed",
      "critical",
      expect.objectContaining({ tenantId: "acme" }),
    );
  });

  it("Basil invoice.paid (parent metadata) flips a converted trial to active", async () => {
    const res = await postEvent({
      id: "evt_basil_paid",
      type: "invoice.paid",
      created: 1_700_600_500,
      data: {
        object: {
          id: "in_basil_paid",
          metadata: {},
          parent: {
            subscription_details: { subscription: "sub_basil", metadata: { tenantId: "acme" } },
          },
        },
      },
    });

    expect(res.status).toBe(200);
    expect(mockUpdateTenant).toHaveBeenCalledWith(
      "acme",
      expect.objectContaining({
        subscriptionStatus: "active",
        // Clear the past-due streak with an explicit null (not undefined) so the
        // mapper actually writes the clear to Postgres.
        subscriptionPastDueSince: null,
        stripeSubscriptionId: "sub_basil",
      }),
    );
  });

  it("stripe-id fallback: invoice with NO tenantId metadata anywhere resolves via the stored subscription id", async () => {
    // No metadata on the invoice OR its parent — only the subscription id. The
    // tenant was stored with this stripeSubscriptionId at checkout, so a
    // metadata gap must NOT drop the money event.
    mockGetTenantBySubId.mockResolvedValue({ id: "acme" });
    const res = await postEvent({
      id: "evt_id_fallback",
      type: "invoice.paid",
      created: 1_700_601_000,
      data: {
        object: {
          id: "in_no_meta",
          metadata: {},
          parent: { subscription_details: { subscription: "sub_stored" } },
        },
      },
    });

    expect(res.status).toBe(200);
    expect(mockGetTenantBySubId).toHaveBeenCalledWith("sub_stored");
    expect(mockUpdateTenant).toHaveBeenCalledWith(
      "acme",
      expect.objectContaining({ subscriptionStatus: "active", stripeSubscriptionId: "sub_stored" }),
    );
  });

  it("fires the operator new-signup email on a new subscription (checkout.session.completed)", async () => {
    mockGetTenantConfig.mockResolvedValue({ siteName: "Acme Co", ownerEmail: "owner@acme.com" });
    const res = await postEvent({
      id: "evt_signup_email",
      type: "checkout.session.completed",
      created: 1_700_000_000,
      data: {
        object: {
          id: "cs_signup",
          mode: "subscription",
          subscription: "sub_new",
          metadata: { tenantId: "acme" },
        },
      },
    });
    expect(res.status).toBe(200);
    expect(mockSendNewSignupEmail).toHaveBeenCalledTimes(1);
    expect(mockSendNewSignupEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        businessName: "Acme Co",
        ownerEmail: "owner@acme.com",
        tenantUrl: "https://admin.strelva.com/admin/clients/acme",
      }),
    );
    // Renewal safety: nothing here should fire the payment-failed alert.
    expect(mockSendPaymentFailedEmail).not.toHaveBeenCalled();
  });

  it("does NOT fire the signup email on a subscription renewal (invoice.paid)", async () => {
    // Renewals arrive as invoice.paid, never checkout.session.completed — so the
    // signup email must not fire here. This is the double-fire guard.
    const res = await postEvent({
      id: "evt_renewal",
      type: "invoice.paid",
      created: 1_700_700_000,
      data: {
        object: {
          id: "in_renewal",
          parent: { subscription_details: { subscription: "sub_new", metadata: { tenantId: "acme" } } },
        },
      },
    });
    expect(res.status).toBe(200);
    expect(mockSendNewSignupEmail).not.toHaveBeenCalled();
  });

  it("fires the operator payment-failed email on invoice.payment_failed", async () => {
    mockGetTenantConfig.mockResolvedValue({ siteName: "Acme Co", ownerEmail: "owner@acme.com" });
    const res = await postEvent({
      id: "evt_fail_email",
      type: "invoice.payment_failed",
      created: 1_700_800_000,
      data: { object: { id: "in_fail_email", metadata: { tenantId: "acme" } } },
    });
    expect(res.status).toBe(200);
    expect(mockSendPaymentFailedEmail).toHaveBeenCalledTimes(1);
    expect(mockSendPaymentFailedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        businessName: "Acme Co",
        ownerEmail: "owner@acme.com",
        tenantUrl: "https://admin.strelva.com/admin/clients/acme",
      }),
    );
    expect(mockSendPaymentPastDueEmail).toHaveBeenCalledTimes(1);
    expect(mockSendPaymentPastDueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owner@acme.com",
        businessName: "Acme Co",
        dashboardUrl: "https://admin.strelva.com/admin/clients/acme",
        tenantId: "acme",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// customer.subscription.deleted — three-level tenant-resolution fallback
// ---------------------------------------------------------------------------
describe("billing webhook customer.subscription.deleted", () => {
  it("metadata tenantId present → subscriptionStatus set to cancelled + alert fires", async () => {
    const res = await postEvent({
      id: "evt_deleted_meta",
      type: "customer.subscription.deleted",
      created: 1_701_000_000,
      data: {
        object: {
          id: "sub_del_1",
          customer: "cus_del_1",
          metadata: { tenantId: "acme" },
        },
      },
    });

    expect(res.status).toBe(200);
    expect(mockUpdateTenant).toHaveBeenCalledWith(
      "acme",
      expect.objectContaining({ subscriptionStatus: "cancelled" }),
    );
    expect(mockAlert).toHaveBeenCalledWith(
      "billing_subscription_cancelled",
      "high",
      expect.objectContaining({ tenantId: "acme" }),
    );
    // stored-id lookups must NOT be called when metadata already resolves it
    expect(mockGetTenantBySubId).not.toHaveBeenCalled();
    expect(mockGetTenantByCustomerId).not.toHaveBeenCalled();
  });

  it("no metadata → falls back to stored subscription id", async () => {
    mockGetTenantBySubId.mockResolvedValue({ id: "acme" });
    const res = await postEvent({
      id: "evt_deleted_subid",
      type: "customer.subscription.deleted",
      created: 1_701_000_100,
      data: {
        object: {
          id: "sub_del_stored",
          customer: "cus_del_stored",
          // No metadata at all
          metadata: {},
        },
      },
    });

    expect(res.status).toBe(200);
    expect(mockGetTenantBySubId).toHaveBeenCalledWith("sub_del_stored");
    expect(mockUpdateTenant).toHaveBeenCalledWith(
      "acme",
      expect.objectContaining({ subscriptionStatus: "cancelled" }),
    );
    expect(mockAlert).toHaveBeenCalledWith(
      "billing_subscription_cancelled",
      "high",
      expect.objectContaining({ tenantId: "acme" }),
    );
  });

  it("no metadata, no matching sub-id → customer-id fallback resolves tenant", async () => {
    // sub-id lookup misses; customer-id lookup finds the tenant
    mockGetTenantBySubId.mockResolvedValue(undefined);
    mockGetTenantByCustomerId.mockResolvedValue({ id: "acme" });
    const res = await postEvent({
      id: "evt_deleted_custid",
      type: "customer.subscription.deleted",
      created: 1_701_000_200,
      data: {
        object: {
          id: "sub_del_cust",
          customer: "cus_del_fallback",
          metadata: {},
        },
      },
    });

    expect(res.status).toBe(200);
    expect(mockGetTenantBySubId).toHaveBeenCalledWith("sub_del_cust");
    expect(mockGetTenantByCustomerId).toHaveBeenCalledWith("cus_del_fallback");
    expect(mockUpdateTenant).toHaveBeenCalledWith(
      "acme",
      expect.objectContaining({ subscriptionStatus: "cancelled" }),
    );
    expect(mockAlert).toHaveBeenCalledWith(
      "billing_subscription_cancelled",
      "high",
      expect.objectContaining({ tenantId: "acme" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Stripe idempotency branches (duplicate / retry / Redis-throws)
// ---------------------------------------------------------------------------

/** Build a fake Redis that returns the given record on .get() for any key. */
function useFakeRedisWithRecord(record: unknown) {
  mockRedisGet.mockResolvedValue(record);
  redisHandle = {
    set: (...args: unknown[]) => mockRedisSet(...args),
    get: (...args: unknown[]) => mockRedisGet(...args),
  };
}

/** Build a fake Redis whose .set() and .get() both throw. */
function useBrokenRedis() {
  redisHandle = {
    set: () => Promise.reject(new Error("Redis unavailable")),
    get: () => Promise.reject(new Error("Redis unavailable")),
  };
}

describe("billing webhook idempotency (claimStripeEvent branches)", () => {
  it("duplicate event (key already processed) → 200 { duplicate: true }, no updateTenant", async () => {
    // Stripe already has the event keyed with status:"processed" → it was
    // handled by a previous delivery. The duplicate branch must ack 200 and
    // skip all side-effects so a retried payment does not double-update status.
    useFakeRedisWithRecord({ status: "processed" });
    // The NX set fails because the key already exists → return null (not "OK").
    mockRedisSet.mockResolvedValue(null);

    const res = await postEvent({
      id: "evt_dup",
      type: "invoice.paid",
      created: 1_702_000_000,
      data: {
        object: {
          id: "in_dup",
          metadata: { tenantId: "acme" },
        },
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.duplicate).toBe(true);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
  });

  it("in-flight event (status processing, recent startedAt) → 503", async () => {
    // Another worker is currently processing this event. Returning 200 would
    // tell Stripe "done" and it would never redeliver — so a crashed first
    // attempt would silently drop the event. Return 503 so Stripe retries.
    const recentStartedAt = Date.now() - 30_000; // 30 s ago, well within 5 min stale window
    useFakeRedisWithRecord({ status: "processing", startedAt: recentStartedAt });
    mockRedisSet.mockResolvedValue(null); // NX fails — key exists

    const res = await postEvent({
      id: "evt_inflight",
      type: "invoice.paid",
      created: 1_702_001_000,
      data: {
        object: {
          id: "in_inflight",
          metadata: { tenantId: "acme" },
        },
      },
    });

    expect(res.status).toBe(503);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
  });

  it("claimStripeEvent throws (Redis down in prod) → 503 + billing_webhook_idempotency_unavailable alert", async () => {
    // In production, claimStripeEvent throws when Redis is unavailable (it
    // can't guarantee idempotency). The route must catch this and return 503
    // (telling Stripe to retry when Redis recovers), not 500 + stack leak.
    // Simulate production so the throw path is taken.
    mockIsProductionEnv.mockReturnValue(true);
    useBrokenRedis();

    const res = await postEvent({
      id: "evt_redis_down",
      type: "invoice.paid",
      created: 1_702_002_000,
      data: {
        object: {
          id: "in_redis_down",
          metadata: { tenantId: "acme" },
        },
      },
    });

    expect(res.status).toBe(503);
    expect(mockAlert).toHaveBeenCalledWith(
      "billing_webhook_idempotency_unavailable",
      "critical",
      expect.objectContaining({ eventType: "invoice.paid" }),
    );
    expect(mockUpdateTenant).not.toHaveBeenCalled();

    // Restore non-prod default for subsequent tests.
    mockIsProductionEnv.mockReturnValue(false);
  });
});

// ---------------------------------------------------------------------------
// isTrialCreateInvoice guard — zero-dollar subscription_create invoice
// ---------------------------------------------------------------------------
describe("billing webhook isTrialCreateInvoice guard", () => {
  it("$0 subscription_create invoice does NOT flip subscriptionStatus to active", async () => {
    // Stripe fires invoice.paid for a $0 trial-creation invoice the instant a
    // trial subscription is created. Promoting trialing → active on that would
    // erase the trial state and count an unpaid trial as active MRR.
    const res = await postEvent({
      id: "evt_trial_invoice",
      type: "invoice.paid",
      created: 1_703_000_000,
      data: {
        object: {
          id: "in_trial_create",
          billing_reason: "subscription_create",
          amount_paid: 0,
          metadata: { tenantId: "acme" },
          parent: {
            subscription_details: { subscription: "sub_trial_create", metadata: { tenantId: "acme" } },
          },
        },
      },
    });

    expect(res.status).toBe(200);
    // Must NOT promote to active — the trial state must be preserved.
    const calls = mockUpdateTenant.mock.calls;
    for (const [, patch] of calls) {
      expect((patch as Record<string, unknown>).subscriptionStatus).not.toBe("active");
    }
  });

  it("$0 subscription_create invoice DOES still stamp stripeSubscriptionId and clear past-due", async () => {
    const res = await postEvent({
      id: "evt_trial_invoice_stamp",
      type: "invoice.paid",
      created: 1_703_000_100,
      data: {
        object: {
          id: "in_trial_create_stamp",
          billing_reason: "subscription_create",
          amount_paid: 0,
          metadata: { tenantId: "acme" },
          parent: {
            subscription_details: { subscription: "sub_trial_stamp", metadata: { tenantId: "acme" } },
          },
        },
      },
    });

    expect(res.status).toBe(200);
    // The sub id and past-due clear must still be applied even though status is skipped.
    expect(mockUpdateTenant).toHaveBeenCalledWith(
      "acme",
      expect.objectContaining({
        subscriptionPastDueSince: null,
        stripeSubscriptionId: "sub_trial_stamp",
      }),
    );
  });

  it("non-zero invoice.paid with billing_reason subscription_create DOES flip to active (real first payment)", async () => {
    // A subscription with no trial where the first invoice is paid immediately —
    // billing_reason is still 'subscription_create' but amount_paid > 0 (real money).
    // This must still promote to active.
    const res = await postEvent({
      id: "evt_paid_create",
      type: "invoice.paid",
      created: 1_703_000_200,
      data: {
        object: {
          id: "in_paid_create",
          billing_reason: "subscription_create",
          amount_paid: 9900,
          metadata: { tenantId: "acme" },
          parent: {
            subscription_details: { subscription: "sub_paid_create", metadata: { tenantId: "acme" } },
          },
        },
      },
    });

    expect(res.status).toBe(200);
    expect(mockUpdateTenant).toHaveBeenCalledWith(
      "acme",
      expect.objectContaining({ subscriptionStatus: "active" }),
    );
  });
});
