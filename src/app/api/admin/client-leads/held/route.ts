import { z } from "zod";
import { isSuperAdmin } from "@/platform/infra/auth";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { inquiryRecordsEnabled, InquiryRecordsError } from "@/platform/infra/inquiry-records";
import { decideOperatorHeldInquiry } from "@/platform/operator-queue";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";
const input = z.object({ rowId: z.string().uuid(), decision: z.enum(["release", "confirm_spam", "hold"]) }).strict();
export async function POST(request: Request) {
  if (!inquiryRecordsEnabled()) return workspaceJson({ error: "Held inquiries are not enabled. Nothing changed." }, 503);
  const guarded = workspaceWriteGuard(request); if (guarded) return guarded;
  try {
    if (!(await isSuperAdmin())) return workspaceJson({ error: "Only Strelva operators can review these messages." }, 403);
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const body = input.parse(await readWorkspaceBody(request, 2_000));
    if (await isRateLimitedWindowedAsync(`operator:held-inquiry:${actor.userId}`, 60, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    return workspaceJson(await decideOperatorHeldInquiry(actor, body.rowId, body.decision));
  } catch (error) {
    if (error instanceof InquiryRecordsError) {
      if (error.code === "not_found") return workspaceJson({ error: "This message is no longer here." }, 404);
      if (error.code === "not_held") return workspaceJson({ error: "This message is not held for review." }, 409);
    }
    return workspaceHttpFailure(error);
  }
}
