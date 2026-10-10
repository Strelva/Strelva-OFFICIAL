import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor, workspaceWriteGuard, readWorkspaceBody, workspaceJson, workspaceHttpFailure } from "@/platform/workspaces/http";
import { readBusinessAttributions, recordBusinessAttribution, recordBusinessAttributionSchema } from "@/platform/connect/attributions";
const released = () => workspaceReleaseEnabled() && process.env.STRELVA_PROVIDER_CHANGE === "1";
export async function GET(request: Request) {
  if (!released()) return workspaceJson({ error: "Attribution evidence is not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in." }, 401);
    const workspaceId = z.uuid().parse(new URL(request.url).searchParams.get("workspaceId"));
    return workspaceJson(await readBusinessAttributions(actor, workspaceId));
  } catch (error) { return workspaceHttpFailure(error); }
}
export async function POST(request: Request) {
  if (!released()) return workspaceJson({ error: "Attribution evidence is not enabled." }, 503);
  const guard = workspaceWriteGuard(request);
  if (guard) return guard;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in." }, 401);
    if (await isRateLimitedWindowedAsync(`business-attribution:${actor.userId}`, 20, 60000))
      return workspaceJson({ error: "Please wait." }, 429);
    const input = recordBusinessAttributionSchema.parse(await readWorkspaceBody(request, 8000));
    return workspaceJson(await recordBusinessAttribution(actor, input));
  } catch (error) { return workspaceHttpFailure(error); }
}
