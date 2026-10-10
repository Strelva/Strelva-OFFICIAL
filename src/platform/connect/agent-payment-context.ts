import { createHash } from "node:crypto";
import { z } from "zod";
import { connectDb, getConnectedMerchant, moneyRpc, type RpcDb } from "./index";
import { qualifiedAgentMerchantProfile, SPT_API_VERSION } from "./stripe-agent-payments";
import { WorkspaceStoreError } from "@/platform/workspaces/types";
export const agentPaymentContextInput = z.object({ paymentCapability: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
/** Read-only credential discovery: the seller profile matches the connected
 * account that will create this exact immutable direct-charge payment. */
export async function readAgentPaymentContext(raw: unknown, db: RpcDb | null = connectDb()) {
  const { paymentCapability } = agentPaymentContextInput.parse(raw);
  const request = z.object({ workspaceId: z.string().uuid(), amountCents: z.number().int().positive(), currency: z.string().regex(/^[a-z]{3}$/), expiresAt: z.string(), status: z.enum(["paid", "cancelled", "expired", "unpaid"]), acceptedTerms: z.unknown() })
    .parse(await moneyRpc("read_public_payment_request", { p_hash: createHash("sha256").update(paymentCapability).digest("hex") }, db));
  if (request.status !== "unpaid") throw new WorkspaceStoreError("This request does not need a new payment credential.");
  const merchant = await getConnectedMerchant(request.workspaceId, db);
  return { ...request, protocol: SPT_API_VERSION, networkId: qualifiedAgentMerchantProfile(merchant.stripe_account_id!), chargeType: "direct",
    paymentEndpoint: "/api/payments/agent", credentialType: "shared_payment_token",
    instructions: "Ask the customer to approve a one-time token for this seller profile, amount and currency, expiring no later than the request. Send workspaceId, paymentCapability and sharedPaymentToken to the payment endpoint. An owner assistant grant does not authorize customer spending." };
}
