import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { recordWorkspaceExitHandoff } from "@/platform/workspace-exit/repository";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled() || process.env.STRELVA_EXIT_HANDOFF !== "1") return workspaceJson({ error: "Site handoff is unavailable." }, 503);
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email." }, 401);
    return workspaceJson(await recordWorkspaceExitHandoff(actor, await readWorkspaceBody(request, 4000)));
  } catch (error) { return workspaceHttpFailure(error); }
}
