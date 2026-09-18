import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { exportWorkspace } from "@/platform/workspace-exports/repository";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspace export is not available." }, 503);
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  const actor = await workspaceHttpActor();
  if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to export this workspace." }, 401);
  try {
    const body = await readWorkspaceBody(request, 1_000) as { workspaceId?: unknown };
    const snapshot = await exportWorkspace(actor, typeof body.workspaceId === "string" ? body.workspaceId : "");
    const workspace = snapshot.workspace as { name?: unknown } | undefined;
    const name = typeof workspace?.name === "string" ? workspace.name : "workspace";
    const filename = `${name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "workspace"}-export.json`;
    return new Response(JSON.stringify(snapshot), { status: 200, headers: {
      "Content-Type":"application/json; charset=utf-8",
      "Content-Disposition":`attachment; filename="${filename}"`,
      "Cache-Control":"private, no-store",
      "X-Content-Type-Options":"nosniff",
      "Referrer-Policy":"no-referrer",
    } });
  } catch (error) { return workspaceHttpFailure(error); }
}
