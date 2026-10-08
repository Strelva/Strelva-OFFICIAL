import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStripeAgentPaymentProvider, SPT_API_VERSION, qualifiedAgentMerchantProfile } from "@/platform/connect/stripe-agent-payments";
import { requestAgentPayment } from "@/platform/connect/agent-payments";
import { ingestConnectEvent } from "@/platform/connect";
import type Stripe from "stripe";
import { readAgentPaymentContext } from "@/platform/connect/agent-payment-context";
const workspaceId = "00000000-0000-4000-8000-000000000010";
const paymentId = "00000000-0000-4000-8000-000000000011";
const identity = { merchantAccountId: "acct_Merchant", paymentId, amountCents: 1000, currency: "usd" };
const input = { ...identity, sharedPaymentToken: "spt_Token", idempotencyKey: `payment:${paymentId}` };
const intent = { id: "pi_Agent", status: "processing", amount: 1000, amount_received: 0, currency: "usd", metadata: { businessPaymentId: paymentId } };
const token = { id: "spt_Token", deactivated_at: null, usage_limits: { max_amount: 1000, currency: "usd", expires_at: 1001 } };
const merchant = { workspace_id: workspaceId, stripe_account_id: identity.merchantAccountId, configurations: ["merchant"], profile_version: "approved", state: "ready", generation: 1, capabilities: {}, requirements: {} };
const rpcDb = (read: (name: string) => unknown) => ({ rpc: vi.fn(async (name: string) => ({ data: read(name), error: null })) });
beforeEach(() => {
  vi.stubEnv("STRELVA_CONNECT", "1"); vi.stubEnv("STRELVA_AGENT_PAYMENTS", "1");
  vi.stubEnv("STRELVA_AGENT_PAYMENT_PROTOCOL", SPT_API_VERSION);
  vi.stubEnv("STRELVA_AGENT_PAYMENT_SELLER_TERMS_APPROVED", "1");
  vi.stubEnv("STRELVA_AGENT_PAYMENT_MERCHANT_PROFILES", '{"acct_Merchant":"profile_Merchant"}');
});
afterEach(() => vi.unstubAllEnvs());
describe("documented Stripe direct-account shared payment token protocol", () => {
  it("discovers the actual merchant profile and immutable amount without accepting or charging", async () => {
    const database = rpcDb(name => name === "read_public_payment_request" ? { workspaceId, amountCents: 1000, currency: "usd", expiresAt: "2026-10-09T00:00:00Z", status: "unpaid", acceptedTerms: "Accepted source terms" } : merchant);
    expect(await readAgentPaymentContext({ paymentCapability: "f".repeat(64) }, database)).toMatchObject({ networkId: "profile_Merchant", chargeType: "direct", workspaceId, amountCents: 1000, currency: "usd" });
    expect(database.rpc.mock.calls.map(call => call[0])).toEqual(["read_public_payment_request", "read_connected_account"]);
  });
  it.each(["paid", "cancelled", "expired"])("does not issue seller credential context for a %s intent", async status => {
    const database = rpcDb(() => ({ workspaceId, amountCents: 1000, currency: "usd", expiresAt: "2026-10-09T00:00:00Z", status, acceptedTerms: "Accepted source terms" }));
    await expect(readAgentPaymentContext({ paymentCapability: "f".repeat(64) }, database)).rejects.toThrow();
    expect(database.rpc).toHaveBeenCalledTimes(1);
  });
  it("retrieves the bounded token then creates an account-scoped preview PaymentIntent", async () => {
    const rawRequest = vi.fn().mockResolvedValueOnce(token).mockResolvedValueOnce(intent);
    const provider = createStripeAgentPaymentProvider({ rawRequest }, () => 1000000);
    expect((await provider.chargeWithSharedPaymentToken(input)).status).toBe("processing");
    expect(rawRequest.mock.calls).toEqual([
      ["GET", "/v1/shared_payment/granted_tokens/spt_Token", {}, { stripeAccount: "acct_Merchant", apiVersion: SPT_API_VERSION, idempotencyKey: input.idempotencyKey }],
      ["POST", "/v1/payment_intents", { amount: 1000, currency: "usd", confirm: true, payment_method_data: { shared_payment_granted_token: "spt_Token" }, metadata: { businessPaymentId: paymentId } }, { stripeAccount: "acct_Merchant", apiVersion: SPT_API_VERSION, idempotencyKey: input.idempotencyKey }],
    ]);
  });
  it.each([
    { ...token, deactivated_at: 1 },
    { ...token, usage_limits: { ...token.usage_limits, max_amount: 999 } },
    { ...token, usage_limits: { ...token.usage_limits, currency: "cad" } },
    { ...token, usage_limits: { ...token.usage_limits, expires_at: 1000 } },
  ])("does not charge revoked, insufficient, wrong-currency or expired tokens", async bad => {
    const rawRequest = vi.fn().mockResolvedValue(bad);
    await expect(createStripeAgentPaymentProvider({ rawRequest }, () => 1000000).chargeWithSharedPaymentToken(input)).rejects.toThrow();
    expect(rawRequest).toHaveBeenCalledTimes(1);
  });
  it("refuses unqualified accounts before an SDK request", async () => {
    vi.stubEnv("STRELVA_AGENT_PAYMENT_MERCHANT_PROFILES", "{}");
    const rawRequest = vi.fn();
    await expect(createStripeAgentPaymentProvider({ rawRequest }).chargeWithSharedPaymentToken(input)).rejects.toThrow(/not qualified/);
    expect(rawRequest).not.toHaveBeenCalled();
    expect(() => qualifiedAgentMerchantProfile("acct_Merchant")).toThrow();
  });
  it("rechecks server approval after token retrieval before creating a charge", async () => {
    const rawRequest = vi.fn(async () => { vi.stubEnv("STRELVA_AGENT_PAYMENT_SELLER_TERMS_APPROVED", "0"); return { ...token, lastResponse: { headers: {}, requestId: "req_Fictional", statusCode: 200 } }; });
    await expect(createStripeAgentPaymentProvider({ rawRequest }, () => 1000000).chargeWithSharedPaymentToken(input)).rejects.toThrow(/not qualified/);
    expect(rawRequest).toHaveBeenCalledTimes(1);
  });
  it("readback never accepts another intent's metadata or amount", async () => {
    const rawRequest = vi.fn().mockResolvedValue({ ...intent, amount: 1001 });
    await expect(createStripeAgentPaymentProvider({ rawRequest }).retrievePayment!({ ...identity, providerObjectId: "pi_Agent" })).rejects.toThrow(/does not match/);
  });
  it("binds processing intents and recovers them without re-consuming a token", async () => {
    const database = rpcDb(name => name === "read_connected_account" ? merchant : name === "reserve_agent_payment_request" ? { paymentId, amountCents: 1000, currency: "usd", status: "unpaid" } : name === "prepare_agent_payment_attempt" ? { providerObjectId: "pi_Agent" } : null);
    const provider = { chargeWithSharedPaymentToken: vi.fn(), retrievePayment: vi.fn(async () => ({ id: "pi_Agent", status: "processing" as const, amountReceived: 0, currency: "usd", merchantAccountId: "acct_Merchant" })) };
    expect((await requestAgentPayment({ workspaceId }, { paymentCapability: "f".repeat(64), sharedPaymentToken: "spt_Token" }, { db: database, provider, previewApproved: true })).status).toBe("processing");
    expect(provider.chargeWithSharedPaymentToken).not.toHaveBeenCalled();
    expect(database.rpc.mock.calls.some(call => call[0] === "bind_business_payment_provider")).toBe(true);
    expect(database.rpc.mock.calls.some(call => call[0] === "record_business_payment_event")).toBe(false);
  });
  it("signed success recovers the SPT binding without inventing a hosted checkout", async () => {
    const database = rpcDb(name => name === "recover_agent_payment_provider" ? true : null);
    const list = vi.fn();
    const event = { id: "evt_Agent", account: "acct_Merchant", type: "payment_intent.succeeded", data: { object: { ...intent, status: "succeeded", amount_received: 1000 } } } as unknown as Stripe.Event;
    await ingestConnectEvent(event, { db: database, stripe: { checkout: { sessions: { list } } } as unknown as Stripe });
    expect(list).not.toHaveBeenCalled();
    expect(database.rpc.mock.calls.some(call => call[0] === "record_business_payment_event")).toBe(true);
  });
});
