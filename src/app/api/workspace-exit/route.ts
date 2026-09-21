import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { completeWorkspaceExit, readWorkspaceExit } from "@/platform/workspace-exit";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspace exit is not available." }, 503);
  const actor = await workspaceHttpActor();
  if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to review workspace exit." }, 401);
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspaceId") || "";
    return workspaceJson(await readWorkspaceExit(actor, workspaceId));
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspace exit is not available." }, 503);
  const guard = workspaceWriteGuard(request);
  if (guard) return guard;
  const actor = await workspaceHttpActor();
  if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to stop future workspace work." }, 401);
  try {
    const body = await readWorkspaceBody(request, 20_000);
    return workspaceJson(await completeWorkspaceExit(actor, body));
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}
