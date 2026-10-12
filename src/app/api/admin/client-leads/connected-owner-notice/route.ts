import { z } from "zod";
import { isSuperAdmin } from "@/platform/infra/auth";
import { inquiryRecordsEnabled } from "@/platform/infra/inquiry-records";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { repairConnectedInquiryOwnerNotice } from "@/products/connected-sites/server";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
export const dynamic = "force-dynamic";
const input = z.object({ rowId: z.string().uuid() }).strict();
export async function POST(request: Request) {
  if (!inquiryRecordsEnabled() || process.env.STRELVA_INQUIRY_OWNER_NOTICES !== "1") return workspaceJson({ error: "Owner notice repair is not enabled." }, 503);
  const guarded = workspaceWriteGuard(request); if (guarded) return guarded;
  try {
    if (!(await isSuperAdmin())) return workspaceJson({ error: "Forbidden" }, 403);
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const body = input.parse(await readWorkspaceBody(request, 2_000));
    if (await isRateLimitedWindowedAsync(`operator:notice-repair:${actor.userId}`, 30, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    return workspaceJson(await repairConnectedInquiryOwnerNotice(actor, body.rowId));
  } catch (error) { return workspaceHttpFailure(error); }
}
