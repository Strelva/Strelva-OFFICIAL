import { readAgentPaymentContext } from "@/platform/connect/agent-payment-context";
import { agentPaymentRuntimeApproved } from "@/platform/connect/stripe-agent-payments";
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";
import { readWorkspaceBody, workspaceJson } from "@/platform/workspaces/http";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!agentPaymentRuntimeApproved()) return workspaceJson({ error: "agent_payment_unavailable" }, 503);
  if (await isRateLimitedAsync(rateLimitKey(request, "agent-payment-context"), 30)) return workspaceJson({ error: "rate_limited" }, 429);
  try { return workspaceJson(await readAgentPaymentContext(await readWorkspaceBody(request, 1024))); }
  catch { return workspaceJson({ error: "payment_context_unavailable" }, 409); }
}
