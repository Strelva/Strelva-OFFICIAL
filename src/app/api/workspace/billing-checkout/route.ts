import { z } from "zod";
import { getStripe } from "@/lib/billing";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { selfServeBillingConfig, workspaceCheckoutMetadata } from "@/platform/business-billing/workspace-checkout";
import { appOrigin } from "@/products/connected-sites/server";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { listWorkspaces } from "@/platform/workspaces";
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
    const business = (await listWorkspaces(actor)).find(item => item.id === workspaceId && item.kind === "customer" && item.access === "member");
    if (!business || business.role !== "owner") return workspaceJson({ error: "Only the business's owner can start its plan. Nothing was charged." }, 403);
    const metadata = workspaceCheckoutMetadata({ workspaceId, payerUserId: actor.userId, allowanceConfigKey: config.allowanceConfigKey });
    const back = `${appOrigin()}/workspace/billing?${new URLSearchParams({ workspaceId })}`;
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: config.priceId, quantity: 1 }],
      customer_email: actor.verifiedEmail,
      client_reference_id: workspaceId,
      metadata,
      subscription_data: { metadata },
      success_url: `${back}&checkout=success`,
      cancel_url: `${back}&checkout=cancelled`,
    }, { idempotencyKey: `workspace-checkout:${workspaceId}:${actor.userId}:${new Date().toISOString().slice(0, 13)}` });
    if (!session.url) return workspaceJson({ error: "Checkout couldn't be opened. Nothing was charged." }, 503);
    return workspaceJson({ checkoutUrl: session.url });
  } catch (error) { return workspaceHttpFailure(error); }
}
