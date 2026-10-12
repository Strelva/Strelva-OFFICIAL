import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workPlanFundingWorkspace } from "@/products/work-plans/server";
import { MAKE_SYSTEMS_REQUIRED_MESSAGE, WorkspaceAccessError, WorkspaceMakeSystemsError } from "@/platform/workspaces/types";

export const dynamic = "force-dynamic";
function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
}

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "The workspace release is not enabled." }, 503);
  try {
    const user = await getSessionUser();
    if (!user?.email || !user.email_confirmed_at) return json({ error: "Sign in with a confirmed email to prepare a plan." }, 401);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspaceId"));
    const fundingWorkspaceId = await workPlanFundingWorkspace({ userId: user.id, verifiedEmail: user.email.trim().toLowerCase() }, workspaceId);
    return json({ fundingWorkspaceId });
  } catch (error) {
    if (error instanceof WorkspaceMakeSystemsError) return json({ error: MAKE_SYSTEMS_REQUIRED_MESSAGE, code: "make_systems_required" }, 403);
    if (error instanceof WorkspaceAccessError) return json({ error: "This workspace is unavailable to your account." }, 403);
    if (error instanceof z.ZodError) return json({ error: "Check the workspace and try again." }, 400);
    return json({ error: "Planning authority could not be checked." }, 503);
  }
}
