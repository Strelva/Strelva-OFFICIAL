import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson } from "@/platform/workspaces/http";
import { calendarProviderSchema } from "@/products/scheduling/contracts";
import { readWorkspaceProviderAvailability } from "@/products/scheduling/server";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  provider: calendarProviderSchema,
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  timeZone: z.string().min(1).max(128).optional(),
}).refine(value => Date.parse(value.end) > Date.parse(value.start), "End must follow start");

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspaces are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in to inspect calendar availability." }, 401);
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return workspaceJson(await readWorkspaceProviderAvailability(actor, query.workspaceId, query.provider, query));
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

