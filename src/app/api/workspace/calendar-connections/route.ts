import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard, readWorkspaceBody } from "@/platform/workspaces/http";
import { calendarConnectionInputSchema, calendarProviderSchema } from "@/products/scheduling/contracts";
import { configureWorkspaceCalendarConnection, listWorkspaceCalendarConnections, listWorkspaceProviderCalendars, revokeWorkspaceCalendarConnection } from "@/products/scheduling/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspaces are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in to manage calendar connections." }, 401);
    const query = new URL(request.url).searchParams;
    const workspaceId = z.string().uuid().parse(query.get("workspaceId"));
    const provider = query.get("provider");
    if (query.get("list") === "1" && provider) return workspaceJson({ calendars: await listWorkspaceProviderCalendars(actor, workspaceId, provider) });
    return workspaceJson({ connections: await listWorkspaceCalendarConnections(actor, workspaceId) });
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspaces are not enabled." }, 503);
  const denied = workspaceWriteGuard(request);
  if (denied) return denied;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in to change calendar connections." }, 401);
    const input = z.discriminatedUnion("action", [
      z.object({ action: z.literal("configure"), workspaceId: z.string().uuid(), connection: calendarConnectionInputSchema }).strict(),
      z.object({ action: z.literal("disconnect"), workspaceId: z.string().uuid(), provider: calendarProviderSchema }).strict(),
    ]).parse(await readWorkspaceBody(request, 30_000));
    if (input.action === "configure") {
      return workspaceJson({ connection: await configureWorkspaceCalendarConnection(actor, input.workspaceId, input.connection) });
    }
    await revokeWorkspaceCalendarConnection(actor, input.workspaceId, input.provider);
    return workspaceJson({ disconnected: true });
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}
