import { z } from "zod";
import { getAuthUserId, isSuperAdmin } from "@/platform/infra/auth";
import { getLeadById } from "@/lib/leads";
import { repairInquiryOwnerNotice } from "@/products/inquiries";
import { readWorkspaceBody, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";
const input = z.object({ tenantId: z.string().min(1).max(120).regex(/^[a-z0-9][a-z0-9_-]*$/), inquiryId: z.string().regex(/^lead_[A-Za-z0-9_-]{1,100}$/) }).strict();

/** Explicit operator repair after changing the business's owner recipient.
 * Neither GET nor default capture can invoke a notice resend. */
export async function POST(request: Request) {
  if (process.env.STRELVA_INQUIRY_OWNER_NOTICES !== "1") return workspaceJson({ error: "Owner notice repair is not enabled." }, 503);
  const guarded = workspaceWriteGuard(request); if (guarded) return guarded;
  try {
    if (!(await isSuperAdmin())) return workspaceJson({ error: "Forbidden" }, 403);
    const actorId = await getAuthUserId(); if (!actorId) return workspaceJson({ error: "Forbidden" }, 403);
    const body = input.parse(await readWorkspaceBody(request, 2_000));
    const lead = await getLeadById(body.tenantId, body.inquiryId);
    if (!lead) return workspaceJson({ error: "Inquiry not found." }, 404);
    const result = await repairInquiryOwnerNotice({ ...body, lead, actorId });
    return workspaceJson(result);
  } catch (error) { return workspaceHttpFailure(error); }
}
