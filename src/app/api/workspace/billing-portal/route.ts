import { z } from "zod";
import { businessBillingEnabled } from "@/platform/business-billing";
import { openWorkspaceBillingPortal } from "@/platform/business-billing/workspace-portal";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { appOrigin } from "@/products/connected-sites/server";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled() || !businessBillingEnabled()) return workspaceJson({ error: "Workspace billing is not enabled." }, 503);
  const guard = workspaceWriteGuard(request);
  if (guard) return guard;
  if (!process.env.STRIPE_SECRET_KEY) return workspaceJson({ error: "Payment management is unavailable. No billing change was made." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email." }, 401);
    if (await isRateLimitedWindowedAsync(`workspace:billing-portal:${actor.userId}`, 10, 60_000)) return workspaceJson({ error: "Please wait a minute before opening billing again." }, 429);
    const { workspaceId, action } = z.object({ workspaceId: z.string().uuid(), action: z.enum(["manage", "cancel"]).default("manage") }).strict().parse(await readWorkspaceBody(request, 2_000));
    const returnUrl = `${appOrigin()}/workspace/billing?${new URLSearchParams({ workspaceId })}`;
    const portalUrl = await openWorkspaceBillingPortal(actor, workspaceId, action, returnUrl);
    return workspaceJson({ portalUrl });
  } catch (error) { return workspaceHttpFailure(error); }
}
