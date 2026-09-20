import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard, readWorkspaceBody } from "@/platform/workspaces/http";
import { calendarProviderSchema } from "@/products/scheduling/contracts";
import { calendarSchedulingService, readCalendarEventReceipt } from "@/products/scheduling/server";

export const dynamic = "force-dynamic";

const querySchema = z.object({ workspaceId: z.string().uuid(), workId: z.string().uuid(), requestId: z.string().min(1).max(100), provider: calendarProviderSchema }).strict();

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspaces are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in to inspect calendar sync." }, 401);
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const [schedule, receipt] = await Promise.all([
      calendarSchedulingService.read(actor, query.workId),
      readCalendarEventReceipt(actor, query.workspaceId, query.workId, query.requestId, query.provider),
    ]);
    return workspaceJson({ schedule, receipt });
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
    if (!actor) return workspaceJson({ error: "Sign in to change calendar sync." }, 401);
    const input = z.discriminatedUnion("action", [
      z.object({ action: z.literal("create"), workId: z.string().uuid(), requestId: z.string().min(1).max(100), provider: calendarProviderSchema }).strict(),
      z.object({ action: z.literal("reschedule"), workId: z.string().uuid(), requestId: z.string().min(1).max(100), provider: calendarProviderSchema, expectedRevision: z.number().int().nonnegative(), start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }) }).strict(),
      z.object({ action: z.literal("cancel"), workId: z.string().uuid(), requestId: z.string().min(1).max(100), provider: calendarProviderSchema, expectedRevision: z.number().int().nonnegative() }).strict(),
      z.object({ action: z.literal("recover"), workId: z.string().uuid(), requestId: z.string().min(1).max(100), provider: calendarProviderSchema }).strict(),
    ]).parse(await readWorkspaceBody(request, 30_000));
    if (input.action === "create") return workspaceJson(await calendarSchedulingService.create(actor, input.workId, input.requestId, input.provider));
    if (input.action === "reschedule") return workspaceJson(await calendarSchedulingService.reschedule(actor, input.workId, input.requestId, input));
    if (input.action === "cancel") return workspaceJson(await calendarSchedulingService.cancel(actor, input.workId, input.requestId, input));
    return workspaceJson(await calendarSchedulingService.recover(actor, input.workId, input.requestId, input.provider));
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}
