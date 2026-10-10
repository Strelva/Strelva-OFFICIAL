import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson } from "@/platform/workspaces/http";
import { readProviderClientQueue } from "@/platform/provider-client-queue/server";
import { providerQueueCursorSchema } from "@/platform/provider-client-queue/contracts";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspaces are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to open the client queue." }, 401);
    const url = new URL(request.url);
    const workspaceId = z.string().uuid().parse(url.searchParams.get("workspaceId"));
    const rawCursor = url.searchParams.get("cursor");
    if (rawCursor && rawCursor.length > 300) return workspaceJson({ error: "The queue cursor is invalid." }, 400);
    let cursor = null;
    if (rawCursor) {
      try { cursor = providerQueueCursorSchema.parse(JSON.parse(rawCursor)); }
      catch { return workspaceJson({ error: "The queue cursor is invalid." }, 400); }
    }
    if (await isRateLimitedWindowedAsync(`workspace:provider-client-queue:${actor.userId}`, 60, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    return workspaceJson(await readProviderClientQueue(actor, workspaceId, cursor));
  } catch (error) { return workspaceHttpFailure(error); }
}
