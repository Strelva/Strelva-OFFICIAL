import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson } from "@/platform/workspaces/http";
import { ownerEntryHomesOpen, readLinkedSites } from "@/platform/owner-entry/linked-sites";
import { inquiryRecordsEnabled } from "@/platform/infra/inquiry-records";
import { inquiryReleaseEnabledForWorkspace, readSystemArrivals } from "@/products/inquiries";
import { systemsReleasedFor } from "@/platform/systems-release";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Customer activity is not open yet.", code: "not_released" }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in to open customer activity." }, 401);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspaceId"));
    if (!await systemsReleasedFor(actor, workspaceId)) {
      return workspaceJson({ error: "Customer activity is not open for this business.", code: "not_released" }, 503);
    }
    const ownerHomes = await ownerEntryHomesOpen(workspaceId, actor.userId);
    if (!ownerHomes) {
      // A direct business can use native Bookings without moving legacy owners
      // into the new workspace. Both allowed and denied links block this bypass.
      const links = await readLinkedSites(actor, workspaceId);
      if (links.sites.length || links.denied.length) return workspaceJson({ error: "Customer activity is not open for this business.", code: "not_released" }, 503);
    }
    const inquiryEnabled = ownerHomes && inquiryRecordsEnabled() && await inquiryReleaseEnabledForWorkspace(workspaceId, { userId: actor.userId, operator: false, tester: false });
    return workspaceJson(await readSystemArrivals(actor, workspaceId, new Date(), undefined, inquiryEnabled));
  } catch (error) { return workspaceHttpFailure(error); }
}
