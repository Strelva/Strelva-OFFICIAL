import { websiteRebuildReleaseMayBeOn, websiteRebuildReleasedFor, readWebsiteSharingContext } from "@/products/websites/index";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson } from "@/platform/workspaces/http";

/** Existing agency client owner claims and artifact transfers remain separate. */
export async function GET(_request: Request, context: { params: Promise<{ workId: string }> }) {
  if (!websiteRebuildReleaseMayBeOn()) return workspaceJson({ error: "Website rebuilds are unavailable." }, 404);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in to read the owner claim." }, 401);
    const { workId } = await context.params;
    const sharing = await readWebsiteSharingContext(actor, workId);
    if (!(await websiteRebuildReleasedFor(actor, sharing.workspaceId))) return workspaceJson({ error: "Website rebuilds are unavailable." }, 404);
    return workspaceJson(sharing);
  } catch (error) { return workspaceHttpFailure(error); }
}
