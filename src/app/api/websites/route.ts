import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";
import { createWebsite, listWebsites, WebsiteConflictError, WebsiteUnavailableError } from "@/products/websites/server";
import { approveWebsiteInputSchema, createWebsiteInputSchema, prepareWebsiteLaunchInputSchema, reviseWebsiteInputSchema } from "@/products/websites/contracts";
import { approveWebsite, prepareWebsiteLaunch, readWebsite, reviseWebsite } from "@/products/websites/server";

export const dynamic = "force-dynamic";

function failure(error: unknown) {
  if (error instanceof WorkspaceAccessError) return workspaceJson({ error: "This website work is unavailable to your account." }, 403);
  if (error instanceof WebsiteConflictError || error instanceof WorkspaceConflictError) return workspaceJson({ error: error.message }, 409);
  if (error instanceof z.ZodError) return workspaceJson({ error: "Check the website brief and request details." }, 400);
  if (error instanceof WebsiteUnavailableError || error instanceof WorkspaceStoreError) return workspaceJson({ error: error.message }, 503);
  return workspaceJson({ error: "The website operation could not be confirmed. Reload and try again." }, 503);
}

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspaces are not enabled." }, 503);
  const current = await workspaceHttpActor();
  if (!current) return workspaceJson({ error: "Sign in to open website work." }, 401);
  try {
    const query = new URL(request.url).searchParams;
    const workspaceId = z.string().uuid().parse(query.get("workspaceId"));
    const workId = query.get("workId");
    if (workId) {
      const record = await readWebsite(current, z.string().uuid().parse(workId));
      if (record.workspaceId !== workspaceId) throw new WorkspaceAccessError();
      return workspaceJson(record);
    }
    return workspaceJson({ workspaceId, websites: await listWebsites(current, workspaceId) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspaces are not enabled." }, 503);
  const guard = workspaceWriteGuard(request);
  if (guard) return guard;
  const current = await workspaceHttpActor();
  if (!current) return workspaceJson({ error: "Sign in to create a website." }, 401);
  try {
    const body = z.discriminatedUnion("action", [
      z.object({ action: z.literal("create"), workspaceId: z.string().uuid(), requestId: z.string(), brief: z.unknown() }).strict(),
      z.object({ action: z.literal("revise"), workId: z.string().uuid(), expectedRevision: z.number().int().nonnegative(), brief: z.unknown() }).strict(),
      z.object({ action: z.literal("approve"), workId: z.string().uuid(), expectedRevision: z.number().int().nonnegative(), candidateRevision: z.number().int().positive(), candidateContentHash: z.string() }).strict(),
      z.object({ action: z.enum(["prepareLaunch", "prepare_launch"]), workId: z.string().uuid(), expectedRevision: z.number().int().nonnegative(), candidateRevision: z.number().int().positive(), candidateContentHash: z.string() }).strict(),
    ]).parse(await readWorkspaceBody(request));
    if (body.action === "create") return workspaceJson(await createWebsite(current, body.workspaceId, createWebsiteInputSchema.parse({ requestId: body.requestId, brief: body.brief })), 201);
    if (body.action === "revise") {
      const { action: _action, workId: _workId, ...input } = body;
      return workspaceJson(await reviseWebsite(current, body.workId, reviseWebsiteInputSchema.parse(input)));
    }
    if (body.action === "approve") {
      const { action: _action, workId: _workId, ...input } = body;
      return workspaceJson(await approveWebsite(current, body.workId, approveWebsiteInputSchema.parse(input)));
    }
    const { action: _action, workId: _workId, ...input } = body;
    return workspaceJson(await prepareWebsiteLaunch(current, body.workId, prepareWebsiteLaunchInputSchema.parse(input)));
  } catch (error) {
    return failure(error);
  }
}
