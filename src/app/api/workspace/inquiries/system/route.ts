import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { inquiryRecordsEnabled } from "@/platform/infra/inquiry-records";
import { ownerEntryHomesOpen } from "@/platform/owner-entry/linked-sites";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson } from "@/platform/workspaces/http";
import { inquiryReleaseEnabledForWorkspace, readInquirySystemDetails } from "@/products/inquiries";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled() || !inquiryRecordsEnabled()) return workspaceJson({ error: "Inquiries aren't open yet." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in to open this business's inquiries." }, 401);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspaceId"));
    if (!await ownerEntryHomesOpen(workspaceId, actor.userId) || !await inquiryReleaseEnabledForWorkspace(workspaceId, { userId: actor.userId, operator: false, tester: false })) return workspaceJson({ error: "Inquiries aren't open for this business." }, 503);
    return workspaceJson({ details: await readInquirySystemDetails(actor, workspaceId) });
  } catch (error) { return workspaceHttpFailure(error); }
}
