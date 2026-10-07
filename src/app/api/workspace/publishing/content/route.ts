import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { systemsReleaseEnabledForWorkspace } from "@/platform/systems-release";
import { publishingEnabledForWorkspace } from "@/products/publishing/release";
import { contentTarget } from "@/products/publishing/content-server";
import { prepareContentDraft, readContentWorkspace } from "@/products/publishing/content-service";
import { getEventRaw } from "@/lib/events";
import { resolveEventAction } from "@/lib/event-actions";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard, readWorkspaceBody } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";
const scopeSchema = z.object({ workspaceId: z.string().uuid(), systemId: z.string().uuid() });
const commandSchema = scopeSchema.extend({ action: z.enum(["compose", "approve", "not_yet"]), draft: z.unknown().optional(), eventId: z.string().max(120).optional() }).strict();
async function context(scope: z.infer<typeof scopeSchema>, write = false) {
  const actor = await workspaceHttpActor();
  if (!actor) return { error: workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401) } as const;
  if (!(await publishingEnabledForWorkspace(scope.workspaceId, actor)) || !(await systemsReleaseEnabledForWorkspace(scope.workspaceId, { operator: false, tester: false, userId: actor.userId }))) return { error: workspaceJson({ error: "Publishing is not enabled for this business." }, 503) } as const;
  if (await isRateLimitedWindowedAsync(`workspace:publishing-content:${actor.userId}`, 40, 60_000)) return { error: workspaceJson({ error: "Please wait before trying again." }, 429) } as const;
  return { actor, target: await contentTarget(actor, scope.workspaceId, scope.systemId, write) } as const;
}
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "The workspace release is not enabled." }, 503);
  try {
    const params = new URL(request.url).searchParams;
    const ctx = await context(scopeSchema.parse({ workspaceId: params.get("workspaceId"), systemId: params.get("systemId") }));
    if (ctx.error) return ctx.error;
    return workspaceJson({ content: await readContentWorkspace(ctx.target), permissions: { canCompose: ctx.target.canCompose, canApprove: ctx.target.canApprove } });
  } catch (error) { return workspaceHttpFailure(error); }
}
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "The workspace release is not enabled." }, 503);
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const command = commandSchema.parse(await readWorkspaceBody(request, 24000));
    const ctx = await context(command, true); if (ctx.error) return ctx.error;
    if (command.action === "compose") return workspaceJson({ draft: await prepareContentDraft(ctx.target, command.draft) }, 201);
    if (!ctx.target.canApprove) return workspaceJson({ error: "This issue needs the business owner's approval." }, 403);
    const event = command.eventId ? await getEventRaw(command.eventId) : null;
    if (!event || event.tenantId !== ctx.target.tenantId || event.metadata?.businessId !== command.workspaceId || event.metadata?.systemId !== command.systemId) return workspaceJson({ error: "This draft is unavailable here." }, 404);
    const result = await resolveEventAction(ctx.target.tenantId, event.id, command.action === "approve" ? "approved" : "dismissed", ctx.actor.userId);
    return workspaceJson({ result }, result.changed ? 200 : 409);
  } catch (error) { return workspaceHttpFailure(error); }
}
