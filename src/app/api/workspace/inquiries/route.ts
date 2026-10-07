import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { inquiryRecordsEnabled } from "@/platform/infra/inquiry-records";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson } from "@/platform/workspaces/http";
import { ownerEntryHomesOpen } from "@/platform/owner-entry/linked-sites";
import { inquiryReleaseEnabledForWorkspace } from "@/products/inquiries";
import { readWorkspaceInquiryInbox } from "@/products/inquiries";
export const dynamic = "force-dynamic";
const query = z.object({ workspaceId: z.string().uuid(), before: z.iso.datetime({ offset: true }).optional(), beforeId: z.string().uuid().optional() });
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled() || !inquiryRecordsEnabled()) return workspaceJson({ error: "The inquiry inbox isn't open yet." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in to open this business's inquiries." }, 401);
    const input = query.parse(Object.fromEntries(new URL(request.url).searchParams));
    if (!await ownerEntryHomesOpen(input.workspaceId, actor.userId) || !await inquiryReleaseEnabledForWorkspace(input.workspaceId, { userId: actor.userId, operator: false, tester: false })) return workspaceJson({ error: "The inquiry inbox isn't open for this business." }, 503);
    if (Boolean(input.before) !== Boolean(input.beforeId)) return workspaceJson({ error: "Reload the inquiry page." }, 400);
    const data = await readWorkspaceInquiryInbox(actor, input.workspaceId, input.before && input.beforeId ? { before: input.before, beforeId: input.beforeId } : undefined);
    return workspaceJson({ data });
  } catch (error) { return workspaceHttpFailure(error); }
}
