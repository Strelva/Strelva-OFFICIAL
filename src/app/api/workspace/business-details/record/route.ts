import { z } from "zod";
import { businessRecordPatchSchema } from "@/platform/business-record/contracts";
import { readBusinessRecord } from "@/platform/business-record/service";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { changeRecordWithWebsiteReviews } from "@/app/workspace/business-details/record-effects";

export const dynamic = "force-dynamic";
const commandSchema = z.object({ workspaceId: z.string().uuid(), revision: z.number().int().nonnegative(), commandId: z.string().uuid(),
  patch: businessRecordPatchSchema, googleApprovalDisclosed: z.boolean().default(false) }).strict();

/** Business facts remain editable without buying or enabling Google publishing.
 * The source is server-chosen and only the current owner may write as owner. */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Business details are not enabled." }, 503);
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const command = commandSchema.parse(await readWorkspaceBody(request, 48000));
    const record = await readBusinessRecord(actor, command.workspaceId);
    if (record.access !== "owner") return workspaceJson({ error: "Only the owner can save these business facts." }, 403);
    if (await isRateLimitedWindowedAsync(`workspace:business-details-record:${actor.userId}`, 20, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    const result = await changeRecordWithWebsiteReviews(actor, command.workspaceId, command.revision, command.patch,
      { source: "owner", commandId: command.commandId, googleApprovalDisclosed: command.googleApprovalDisclosed });
    return workspaceJson({ result });
  } catch (error) { return workspaceHttpFailure(error); }
}
