import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { inquiryRecordsEnabled, InquiryRecordsError } from "@/lib/inquiry-records";
import { decideHeldInquiry } from "@/products/inquiries/server";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { ownerEntryHomesOpen } from "@/platform/owner-entry/linked-sites";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";

const input = z.object({
  workspaceId: z.string().uuid(),
  rowId: z.string().uuid(),
  decision: z.enum(["release", "confirm_spam", "hold"]),
}).strict();

/**
 * Review one message held as spam (inquiry 1.0 delta, sections 4 and 7):
 * release it as a normal inquiry, confirm it is spam, or put a released one
 * back. Only the business owner (or Strelva, with a receipt) may decide; the
 * database refuses members and admins and anything of another business.
 * Release never emails the customer.
 */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspaces are not enabled. Nothing changed." }, 503);
  if (!inquiryRecordsEnabled()) return workspaceJson({ error: "Held messages aren't open yet. Nothing changed." }, 503);
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const body = input.parse(await readWorkspaceBody(request, 2_000));
    if (!(await ownerEntryHomesOpen(body.workspaceId, actor.userId))) return workspaceJson({ error: "Inquiries in the workspace aren't open for this business yet." }, 503);
    if (await isRateLimitedWindowedAsync(`workspace:held-inquiry:${actor.userId}`, 60, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    const result = await decideHeldInquiry(actor, body.workspaceId, body.rowId, body.decision);
    return workspaceJson({ status: result.status, state: result.lead.intakeState });
  } catch (error) {
    if (error instanceof WorkspaceAccessError) return workspaceJson({ error: "Only the business owner can decide on held messages." }, 403);
    if (error instanceof InquiryRecordsError) {
      if (error.code === "not_found") return workspaceJson({ error: "This message is no longer here." }, 404);
      if (error.code === "not_held") return workspaceJson({ error: "This message isn't held for review." }, 409);
      if (error.code === "invalid") return workspaceJson({ error: "Check the request." }, 400);
      return workspaceJson({ error: "The decision couldn't be saved. Nothing changed." }, 503);
    }
    return workspaceHttpFailure(error);
  }
}
