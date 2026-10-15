import { z } from "zod";
import { appEventsCommandSchema } from "@/platform/app-events/contracts";
import { appEventsMayBeOn, appEventsReleased, appEventWebhooksEnabled } from "@/platform/app-events/release";
import { readAppEventDeliveries, runAppEventCommand, WebhooksOffError } from "@/platform/app-events/service";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
export const dynamic = "force-dynamic";

const off = () => workspaceJson({ error: "Events aren't turned on." }, 503);
const webhooksOff = () => workspaceJson({ error: "Webhooks aren't turned on." }, 503);
const SIGN_IN = "Sign in with a confirmed email to continue.";

const scopeSchema = z.object({ workspaceId: z.string().uuid(), agencyWorkspaceId: z.string().uuid().nullish() }).strict();

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled() || !appEventsMayBeOn()) return off();
  try {
    const p = new URL(request.url).searchParams;
    const scope = scopeSchema.parse({ workspaceId: p.get("workspaceId"), agencyWorkspaceId: p.get("agencyWorkspaceId") });
    if (!(await appEventsReleased(scope.workspaceId))) return off();
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: SIGN_IN }, 401);
    return workspaceJson({ ...(await readAppEventDeliveries(actor, scope)), webhooksOn: appEventWebhooksEnabled() });
  } catch (error) { return workspaceHttpFailure(error); }
}

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled() || !appEventsMayBeOn()) return off();
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: SIGN_IN }, 401);
    const command = appEventsCommandSchema.parse(await readWorkspaceBody(request, 4000));
    if (!(await appEventsReleased(command.workspaceId))) return off();
    // A new secret is shown once, so it is never cached (workspaceJson sets private, no-store).
    return workspaceJson(await runAppEventCommand(actor, command));
  } catch (error) {
    if (error instanceof WebhooksOffError) return webhooksOff();
    // A specific refusal (the agency's access doesn't cover those events) keeps its words.
    if (error instanceof WorkspaceAccessError && error.message !== new WorkspaceAccessError().message && error.constructor === WorkspaceAccessError) {
      return workspaceJson({ error: error.message }, 403);
    }
    return workspaceHttpFailure(error);
  }
}
