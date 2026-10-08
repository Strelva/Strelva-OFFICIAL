import Stripe from "stripe";
import { z } from "zod";
import { WorkspaceStoreError } from "@/platform/workspaces/types";
import type { AgentPaymentProvider } from "./agent-payments";
import { stripeClient } from "./index";

// Documented seller/Connect SPT protocol, inspected 2026-10-08. The installed
// Stripe SDK exposes rawRequest; its stable generated types omit preview fields.
export const SPT_API_VERSION = "2026-09-30.preview";
const intentSchema = z.object({
  id: z.string().regex(/^pi_[A-Za-z0-9]+$/), amount: z.number().int().positive(),
  amount_received: z.number().int().nonnegative(), currency: z.string(),
  status: z.enum(["succeeded", "requires_action", "processing", "requires_payment_method", "requires_confirmation", "requires_capture", "canceled"]),
  metadata: z.object({ businessPaymentId: z.string().uuid() }),
});
const tokenSchema = z.object({
  id: z.string(), deactivated_at: z.number().nullable(),
  usage_limits: z.object({ currency: z.string(), max_amount: z.number().int().positive(), expires_at: z.number().int().positive() }),
});
export function agentPaymentRuntimeApproved() {
  return process.env.STRELVA_CONNECT === "1" && process.env.STRELVA_AGENT_PAYMENTS === "1"
    && process.env.STRELVA_AGENT_PAYMENT_PROTOCOL === SPT_API_VERSION
    && process.env.STRELVA_AGENT_PAYMENT_SELLER_TERMS_APPROVED === "1";
}
/** Server-owned profile inventory, populated only after account qualification. */
export function qualifiedAgentMerchantProfile(accountId: string): string {
  const profiles = z.record(z.string().regex(/^acct_[A-Za-z0-9]+$/), z.string().regex(/^profile_[A-Za-z0-9]+$/))
    .safeParse(JSON.parse(process.env.STRELVA_AGENT_PAYMENT_MERCHANT_PROFILES || "{}"));
  if (!agentPaymentRuntimeApproved() || !profiles.success || !profiles.data[accountId])
    throw new WorkspaceStoreError("The merchant's agent payment profile is not qualified.");
  return profiles.data[accountId];
}
export function createStripeAgentPaymentProvider(stripe: Pick<Stripe, "rawRequest"> = stripeClient(), now = () => Date.now()): AgentPaymentProvider {
  const options = (account: string, key?: string) => {
    qualifiedAgentMerchantProfile(account);
    return { stripeAccount: account, apiVersion: SPT_API_VERSION, ...(key ? { idempotencyKey: key } : {}) };
  };
  const result = (raw: unknown, input: { merchantAccountId: string; paymentId: string; amountCents: number; currency: string }) => {
    const intent = intentSchema.parse(raw);
    if (intent.metadata.businessPaymentId !== input.paymentId || intent.amount !== input.amountCents || intent.currency !== input.currency)
      throw new WorkspaceStoreError("The provider payment does not match the accepted request.");
    return { id: intent.id, status: intent.status === "requires_payment_method" || intent.status === "canceled" ? "failed" as const
      : intent.status === "requires_confirmation" || intent.status === "requires_capture" ? "requires_action" as const : intent.status,
      amountReceived: intent.amount_received, currency: intent.currency, merchantAccountId: input.merchantAccountId };
  };
  return {
    async retrievePayment(input) {
      if (!/^pi_[A-Za-z0-9]+$/.test(input.providerObjectId)) throw new WorkspaceStoreError("Invalid payment binding.");
      return result(await stripe.rawRequest("GET", `/v1/payment_intents/${input.providerObjectId}`, {}, options(input.merchantAccountId)), input);
    },
    async chargeWithSharedPaymentToken(input) {
      const opts = options(input.merchantAccountId, input.idempotencyKey);
      if (!/^spt_[A-Za-z0-9]+$/.test(input.sharedPaymentToken)) throw new WorkspaceStoreError("Invalid shared payment token.");
      const token = tokenSchema.parse(await stripe.rawRequest("GET", `/v1/shared_payment/granted_tokens/${input.sharedPaymentToken}`, {}, opts));
      if (token.id !== input.sharedPaymentToken || token.deactivated_at !== null || token.usage_limits.currency !== input.currency
        || token.usage_limits.max_amount < input.amountCents || token.usage_limits.expires_at * 1000 <= now())
        throw new WorkspaceStoreError("The shared payment token is expired, revoked, or outside the accepted amount.");
      return result(await stripe.rawRequest("POST", "/v1/payment_intents", {
        amount: input.amountCents, currency: input.currency, confirm: true,
        payment_method_data: { shared_payment_granted_token: input.sharedPaymentToken },
        metadata: { businessPaymentId: input.paymentId },
      }, options(input.merchantAccountId, input.idempotencyKey)), input);
    },
  };
}
