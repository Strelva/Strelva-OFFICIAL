import { z } from "zod";
import { readWorkspaceBody, workspaceHttpActor, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { websiteRebuildReleaseEnabled } from "@/products/websites/index";
import { readWebsiteRebuild } from "@/products/websites/index";

export function rebuildHttpFailure(error: unknown) {
  if (error instanceof WorkspaceAccessError) return workspaceJson({ error: "This rebuild is unavailable to your account." },403);
  if (error instanceof WorkspaceConflictError) return workspaceJson({ error: error.message },409);
  if (error instanceof z.ZodError) return workspaceJson({ error: "Check the request, website revision, and content hash." },400);
  if (error instanceof WorkspaceStoreError) return workspaceJson({ error: error.message },503);
  return workspaceJson({ error: "The rebuild operation could not be confirmed. Reopen its saved status before retrying." },503);
}
export async function rebuildHttp(request: Request, params: Promise<{ workId: string }>, write: boolean, action: (actor: WorkspaceActor, workId: string, input: unknown) => Promise<Response>) {
  if (!websiteRebuildReleaseEnabled()) return workspaceJson({ error: "Website rebuilds are not enabled." },503);
  if (write) { const denied = workspaceWriteGuard(request); if (denied) return denied; }
  const actor = await workspaceHttpActor();
  if (!actor) return workspaceJson({ error: "Sign in to open this website rebuild." },401);
  try {
    const workId = z.string().uuid().parse((await params).workId);
    const body = write ? await readWorkspaceBody(request) : undefined;
    const record = await readWebsiteRebuild(actor,workId);
    const queryWorkspace = new URL(request.url).searchParams.get("workspaceId");
    const bodyRecord = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string,unknown> : null;
    const workspaceId = queryWorkspace ?? bodyRecord?.workspaceId;
    if (workspaceId !== undefined && workspaceId !== null && z.string().uuid().parse(workspaceId) !== record.workspaceId) throw new WorkspaceAccessError();
    const input = bodyRecord ? Object.fromEntries(Object.entries(bodyRecord).filter(([key]) => key !== "workspaceId")) : body;
    return await action(actor,workId,input);
  } catch (error) { return rebuildHttpFailure(error); }
}
