import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { createAgencyApplicationDraftAccessService } from "@/platform/offerings";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspaces are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to open assigned application drafts." }, 401);
    const agencyWorkspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("agencyWorkspaceId"));
    return workspaceJson({ applications: await createAgencyApplicationDraftAccessService().list(actor, agencyWorkspaceId) });
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}
