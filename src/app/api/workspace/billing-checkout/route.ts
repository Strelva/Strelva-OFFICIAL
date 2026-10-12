import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { selfServeBillingConfig } from "@/platform/business-billing/workspace-checkout";
import { openWorkspaceSubscriptionCheckout } from "@/platform/business-billing/workspace-checkout-session";
import { appOrigin } from "@/products/connected-sites/server";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";

/**
 * POST { workspaceId }: the business's owner starts its own workspace plan
 * (ADR 0015). Returns a Stripe Checkout URL; nothing is charged until the
 * owner completes it there. Off until the price and flag are configured.
 */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Business workspaces are not enabled." }, 503);
  const denied = workspaceWriteGuard(request);
  if (denied) return denied;
  const config = selfServeBillingConfig();
  if (!config.enabled || !config.priceId) return workspaceJson({ error: "Paid plans open soon. Nothing was charged." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email." }, 401);
    if (await isRateLimitedWindowedAsync(`workspace:billing-checkout:${actor.userId}`, 5, 60_000)) return workspaceJson({ error: "Please wait a minute before trying again." }, 429);
    const { workspaceId } = z.object({ workspaceId: z.string().uuid() }).strict().parse(await readWorkspaceBody(request, 2_000));
    const back = `${appOrigin()}/workspace/billing?${new URLSearchParams({ workspaceId })}`;
    const checkoutUrl = await openWorkspaceSubscriptionCheckout(actor, workspaceId, config, back);
    return workspaceJson({ checkoutUrl });
  } catch (error) { return workspaceHttpFailure(error); }
}
