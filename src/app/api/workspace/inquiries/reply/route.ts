import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { ownerEntryHomesOpen } from "@/platform/owner-entry/linked-sites";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { inquiryReleaseEnabledForWorkspace } from "@/products/inquiries";
import { replyFromWorkspace, workspaceInquiryRepliesEnabled, workspaceReplyInput } from "@/products/inquiries";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled() || !workspaceInquiryRepliesEnabled()) return workspaceJson({ error: "Workspace replies aren't open yet. Nothing sent." }, 503);
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to reply." }, 401);
    const input = workspaceReplyInput.parse(await readWorkspaceBody(request, 25_000));
    if (!(await ownerEntryHomesOpen(input.workspaceId, actor.userId)) || !(await inquiryReleaseEnabledForWorkspace(input.workspaceId, { userId: actor.userId, operator: false, tester: false }))) {
      return workspaceJson({ error: "Workspace replies aren't open for this business yet. Nothing sent." }, 503);
    }
    if (await isRateLimitedWindowedAsync(`workspace:inquiry-reply:${actor.userId}`, 30, 60_000)) return workspaceJson({ error: "Please wait before replying again." }, 429);
    // SQL owns scope and owner-only approval. Managed-site access is checked
    // there and by the app's linked-site boundary before any external send.
    const outcome = await replyFromWorkspace(actor, input);
    return workspaceJson({ outcome });
  } catch (error) { return workspaceHttpFailure(error); }
}
