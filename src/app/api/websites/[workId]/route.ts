import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";
import { approveWebsite, prepareWebsiteLaunch, readWebsite, reviseWebsite, WebsiteConflictError, WebsiteUnavailableError } from "@/products/websites/server";
import { approveWebsiteInputSchema, prepareWebsiteLaunchInputSchema, reviseWebsiteInputSchema } from "@/products/websites/contracts";

export const dynamic = "force-dynamic";

function failure(error: unknown) {
  if (error instanceof WorkspaceAccessError) return workspaceJson({ error: "This website work is unavailable to your account." }, 403);
  if (error instanceof WebsiteConflictError || error instanceof WorkspaceConflictError) return workspaceJson({ error: error.message }, 409);
  if (error instanceof z.ZodError) return workspaceJson({ error: "Check the website action and revision details." }, 400);
  if (error instanceof WebsiteUnavailableError || error instanceof WorkspaceStoreError) return workspaceJson({ error: error.message }, 503);
  return workspaceJson({ error: "The website operation could not be confirmed. Reload and try again." }, 503);
}

function workIdFrom(params: { workId: string }): string {
  return z.string().uuid().parse(params.workId);
}

export async function GET(request: Request, context: { params: Promise<{ workId: string }> }) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspaces are not enabled." }, 503);
  const current = await workspaceHttpActor();
  if (!current) return workspaceJson({ error: "Sign in to open website work." }, 401);
  try {
    const workId = workIdFrom(await context.params);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspaceId"));
    const record = await readWebsite(current, workId);
    if (record.workspaceId !== workspaceId) throw new WorkspaceAccessError();
    return workspaceJson(record);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ workId: string }> }) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspaces are not enabled." }, 503);
  const guard = workspaceWriteGuard(request);
  if (guard) return guard;
  const current = await workspaceHttpActor();
  if (!current) return workspaceJson({ error: "Sign in to change website work." }, 401);
  try {
    const workId = workIdFrom(await context.params);
    const body = z.discriminatedUnion("action", [
      z.object({ action: z.literal("revise"), expectedRevision: z.number().int().nonnegative(), brief: z.unknown() }).strict(),
      z.object({ action: z.literal("approve"), expectedRevision: z.number().int().nonnegative(), candidateRevision: z.number().int().positive(), candidateContentHash: z.string() }).strict(),
      z.object({ action: z.literal("prepareLaunch"), expectedRevision: z.number().int().nonnegative(), candidateRevision: z.number().int().positive(), candidateContentHash: z.string() }).strict(),
    ]).parse(await readWorkspaceBody(request));
    if (body.action === "revise") {
      const { action: _action, ...input } = body;
      return workspaceJson(await reviseWebsite(current, workId, reviseWebsiteInputSchema.parse(input)));
    }
    if (body.action === "approve") {
      const { action: _action, ...input } = body;
      return workspaceJson(await approveWebsite(current, workId, approveWebsiteInputSchema.parse(input)));
    }
    const { action: _action, ...input } = body;
    return workspaceJson(await prepareWebsiteLaunch(current, workId, prepareWebsiteLaunchInputSchema.parse(input)));
  } catch (error) {
    return failure(error);
  }
}
