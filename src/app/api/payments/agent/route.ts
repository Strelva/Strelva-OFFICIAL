import { z } from "zod";
import { agentPaymentInputSchema, requestAgentPayment } from "@/platform/connect/agent-payments";
import { agentPaymentRuntimeApproved, createStripeAgentPaymentProvider } from "@/platform/connect/stripe-agent-payments";
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";
import { readWorkspaceBody, workspaceJson } from "@/platform/workspaces/http";
export const dynamic = "force-dynamic";
/** Possession of a bounded payment capability, never an owner OAuth token, is
 * payment authority. Amount, expiry, policy and merchant come from durable state. */
export async function POST(request: Request) {
  if (!agentPaymentRuntimeApproved()) return workspaceJson({ error: "agent_payment_unavailable" }, 503);
  if (await isRateLimitedAsync(rateLimitKey(request, "agent-payment"), 10)) return workspaceJson({ error: "rate_limited" }, 429);
  try {
    const input = agentPaymentInputSchema.extend({ workspaceId: z.string().uuid() }).parse(await readWorkspaceBody(request, 4096));
    const { workspaceId, ...payment } = input;
    const result = await requestAgentPayment({ workspaceId }, payment, { previewApproved: true, provider: createStripeAgentPaymentProvider() });
    return workspaceJson(result, result.status === "failed" ? 402 : result.status === "processing" || result.status === "requires_action" ? 202 : 200);
  } catch {
    // No token, SDK error payload or provider credentials leave this endpoint.
    // An unknown effect must be retried with the same capability, never a new intent.
    return workspaceJson({ error: "payment_not_confirmed", recovery: "Retry the same payment capability or ask the business to reconcile it. Do not start a second payment." }, 409);
  }
}
