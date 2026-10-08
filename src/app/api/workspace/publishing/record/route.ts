import { z } from "zod";
import { businessRecordPatchSchema } from "@/platform/business-record/contracts";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { publishingEnabledForWorkspace } from "@/products/publishing/server";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";

import { changeRecordWithWebsiteReviews } from "@/app/workspace/business-details/record-effects";

export const dynamic = "force-dynamic";
const commandSchema = z.object({ workspaceId: z.string().uuid(), revision: z.number().int().nonnegative(), commandId: z.string().uuid(),
  patch: businessRecordPatchSchema, googleApprovalDisclosed: z.boolean().default(false) }).strict();

/** One owner-approved record edit, with individually governed Google effects.
 * Saving the record is permanent even when one outside effect fails. */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Publishing is not enabled." }, 503);
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const command = commandSchema.parse(await readWorkspaceBody(request, 48000));
    if (!(await publishingEnabledForWorkspace(command.workspaceId, actor))) return workspaceJson({ error: "Publishing is not enabled for this business." }, 503);
    if (await isRateLimitedWindowedAsync(`workspace:publishing-record:${actor.userId}`, 20, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    const result = await changeRecordWithWebsiteReviews(actor, command.workspaceId, command.revision, command.patch,
      { source: "owner", commandId: command.commandId, googleApprovalDisclosed: command.googleApprovalDisclosed });
    return workspaceJson({ result });
  } catch (error) { return workspaceHttpFailure(error); }
}
