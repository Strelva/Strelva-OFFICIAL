import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { agencyGoogleConnectLink } from "@/products/google-listing/connect";
import { z } from "zod";

export const dynamic = "force-dynamic";
/** The agency copies the link and sends it itself. Nothing is emailed. */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "The workspace release is not enabled." }, 503);
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const { workspaceId } = z.object({ workspaceId: z.string().uuid() }).strict().parse(await readWorkspaceBody(request, 1000));
    return workspaceJson(await agencyGoogleConnectLink(actor, workspaceId));
  } catch (error) { return workspaceHttpFailure(error); }
}
