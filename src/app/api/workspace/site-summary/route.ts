import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson } from "@/platform/workspaces/http";
import { ownerEntryHomesOpen } from "@/platform/owner-entry/linked-sites";
import { readSiteSummaries } from "@/platform/owner-entry/site-summary";

export const dynamic = "force-dynamic";

/**
 * Home's "From your site": visits, customer actions, who reached out and what
 * Strelva did, for each site linked to this business. Direct members only
 * (the link read refuses anyone else), and each site also needs the same
 * tenant check `/dashboard` uses. 503 while owner entry is off for this
 * business, and Home shows nothing new.
 */
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspaces are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspaceId"));
    if (!(await ownerEntryHomesOpen(workspaceId, actor.userId))) return workspaceJson({ error: "Not open for this business yet." }, 503);
    return workspaceJson(await readSiteSummaries(actor, workspaceId));
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}
