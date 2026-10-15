import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { expireOpenAgencyPayLinkCheckouts, startAgencyPayLinkCheckout } from "@/platform/agency-pay-links/checkout";

const agency = "a2830000-0000-4000-8000-000000000010";
const paymentId = "a2830000-0000-4000-8000-000000000011";
const linkId = "a2830000-0000-4000-8000-000000000012";
const merchant = { workspace_id: agency, stripe_account_id: "acct_Agency", configurations: ["merchant"], profile_version: "v1", state: "ready", generation: 2, capabilities: {}, requirements: {} };
const link = (over: Record<string, unknown> = {}) => ({
  id: linkId, slug: "harbor-site", rail: "connected_account", agencyWorkspaceId: agency, businessWorkspaceId: null, clientName: "Harbor Dental", description: "Website setup", door: null,
  amountCents: 50000, minCents: null, maxCents: null, currency: "usd", agencyDisplayName: "North Studio", createdBy: null, createdAt: "2026-10-15T12:00:00Z", revokedAt: null, revokedBy: null,
  checkoutGeneration: 0, legacyTenantId: null, leadSlug: null, returnUrl: null, status: "open", paidAt: null, paidAmountCents: null, invoiceNumber: 1, receiptNumber: null, ...over,
});
function begun(amount = 50000, generation = 0) {
  return { linkId, workspaceId: agency, slug: "harbor-site", description: "Website setup", currency: "usd", amountCents: amount, generation, referenceId: `agency_pay_link:${linkId}`, idempotencyKey: `agency-pay-link:${linkId}:g${generation}:${amount}` };
}
function fixture(over: { link?: unknown; prepared?: Array<{ sessionId?: string }>; openError?: string } = {}) {
  const prepared = [...(over.prepared ?? [{}])];
  let generation = 0;
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    switch (name) {
      case "read_public_agency_pay_link": return { data: over.link === undefined ? link() : over.link, error: null };
      case "begin_agency_pay_link_checkout": return { data: begun(Number(args.p_amount_cents), generation), error: null };
      case "advance_agency_pay_link_checkout": generation += 1; return { data: generation, error: null };
      case "assert_agency_pay_link_checkout_open": return over.openError ? { data: null, error: { message: over.openError } } : { data: true, error: null };
      case "read_connected_account": return { data: merchant, error: null };
      case "reserve_business_payment": return { data: { id: paymentId }, error: null };
      case "prepare_business_checkout": return { data: prepared.shift() ?? {}, error: null };
      case "assert_business_checkout_admission": return { data: true, error: null };
      default: return { data: null, error: null };
    }
  });
  const create = vi.fn(async () => ({ id: "cs_New", url: "https://checkout.stripe.com/pay/new" }));
  const retrieve = vi.fn(async () => ({ id: "cs_Old", url: null, status: "expired" }));
  const expire = vi.fn(async () => ({}));
  const stripe = { checkout: { sessions: { create, retrieve, expire } } } as unknown as Stripe;
  return { db: { rpc }, stripe, rpc, create, retrieve, expire };
}
const names = (f: ReturnType<typeof fixture>) => f.rpc.mock.calls.map(call => call[0]);
const input = { slug: "harbor-site", submittedAmount: 500, origin: "https://app.example" };

beforeEach(() => {
  vi.stubEnv("STRELVA_CONNECT", "1");
  vi.stubEnv("STRELVA_AGENCY_PAY_LINKS", "1");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
});
afterEach(() => vi.unstubAllEnvs());

describe("agency pay-link checkout", () => {
  it("touches nothing when the switch is off", async () => {
    vi.stubEnv("STRELVA_AGENCY_PAY_LINKS", "");
    const f = fixture();
    await expect(startAgencyPayLinkCheckout(input, { db: f.db, stripe: f.stripe })).rejects.toMatchObject({ status: 404 });
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
  });

  it("opens Checkout on the agency account with the open-check before Stripe and no fee", async () => {
    const f = fixture();
    const result = await startAgencyPayLinkCheckout(input, { db: f.db, stripe: f.stripe });
    expect(result).toEqual({ checkoutUrl: "https://checkout.stripe.com/pay/new" });
    expect(names(f)).toEqual(["read_public_agency_pay_link", "begin_agency_pay_link_checkout", "read_connected_account", "reserve_business_payment", "claim_business_payment_channel", "prepare_business_checkout", "assert_agency_pay_link_checkout_open", "assert_business_checkout_admission", "record_business_payment_event"]);
    expect(f.rpc.mock.calls.find(call => call[0] === "assert_agency_pay_link_checkout_open")?.[1]).toEqual({ p_link_id: linkId, p_payment_id: paymentId });
    expect(f.create).toHaveBeenCalledWith(
      expect.objectContaining({ success_url: "https://app.example/pay/harbor-site?payment=success", payment_intent_data: { application_fee_amount: 0, metadata: { businessPaymentId: paymentId } }, line_items: [expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 50000, product_data: { name: "Website setup" } }) })] }),
      { stripeAccount: "acct_Agency", idempotencyKey: `payment:${paymentId}` },
    );
  });

  it("never creates a session when the link closed after the payment was reserved", async () => {
    const f = fixture({ openError: "agency_pay_link_closed" });
    await expect(startAgencyPayLinkCheckout(input, { db: f.db, stripe: f.stripe })).rejects.toMatchObject({ status: 410 });
    expect(f.create).not.toHaveBeenCalled();
  });

  it("moves to the next generation when a reused session has expired", async () => {
    const f = fixture({ prepared: [{ sessionId: "cs_Old" }, {}] });
    const result = await startAgencyPayLinkCheckout(input, { db: f.db, stripe: f.stripe });
    expect(result.checkoutUrl).toContain("checkout.stripe.com");
    expect(names(f)).toContain("advance_agency_pay_link_checkout");
    const keys = f.rpc.mock.calls.filter(call => call[0] === "reserve_business_payment").map(call => (call[1] as { p_key: string }).p_key);
    expect(keys[1]).toContain(":g1:");
  });

  it("never opens a second charge when the reused session already completed", async () => {
    const f = fixture({ prepared: [{ sessionId: "cs_Old" }, {}] });
    f.retrieve.mockResolvedValueOnce({ id: "cs_Old", url: null, status: "complete" });
    await expect(startAgencyPayLinkCheckout(input, { db: f.db, stripe: f.stripe })).rejects.toMatchObject({ status: 409 });
    expect(names(f)).not.toContain("advance_agency_pay_link_checkout");
    expect(f.create).not.toHaveBeenCalled();
  });

  it("refuses a range amount outside the link before reserving anything", async () => {
    const f = fixture({ link: link({ amountCents: null, minCents: 5000, maxCents: 20000 }) });
    await expect(startAgencyPayLinkCheckout({ ...input, submittedAmount: 5000 }, { db: f.db, stripe: f.stripe })).rejects.toMatchObject({ status: 400 });
    expect(names(f)).toEqual(["read_public_agency_pay_link"]);
  });

  it("uses a whole-dollar range amount", async () => {
    const f = fixture({ link: link({ amountCents: null, minCents: 5000, maxCents: 20000 }) });
    await startAgencyPayLinkCheckout({ ...input, submittedAmount: "100" }, { db: f.db, stripe: f.stripe });
    expect(f.rpc.mock.calls.find(call => call[0] === "begin_agency_pay_link_checkout")?.[1]).toEqual({ p_slug: "harbor-site", p_amount_cents: 10000 });
  });
});

describe("expiring open sessions", () => {
  it("makes no call when the switch is off", async () => {
    vi.stubEnv("STRELVA_AGENCY_PAY_LINKS", "");
    const f = fixture();
    expect(await expireOpenAgencyPayLinkCheckouts(linkId, { db: f.db, stripe: f.stripe })).toEqual({ closed: 0, unconfirmed: 0 });
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("counts failures instead of throwing", async () => {
    const f = fixture();
    f.rpc.mockImplementation(async () => ({ data: [{ paymentId, accountId: "acct_Agency", sessionId: "cs_1" }, { paymentId, accountId: "acct_Agency", sessionId: "cs_2" }], error: null }));
    f.expire.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("no"));
    expect(await expireOpenAgencyPayLinkCheckouts(linkId, { db: f.db, stripe: f.stripe })).toEqual({ closed: 1, unconfirmed: 1 });
    expect(f.expire).toHaveBeenCalledWith("cs_1", { stripeAccount: "acct_Agency" });
  });
});
