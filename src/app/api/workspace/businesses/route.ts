import { NextResponse } from "next/server";
import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/lib/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor, workspaceWriteGuard, readWorkspaceBody } from "@/platform/workspaces/http";
import { listWorkspaces } from "@/platform/workspaces";
import { enterCustomerBusiness } from "@/platform/workspaces/business-entry";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";

export const dynamic = "force-dynamic";
function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
}
function failure(error: unknown) {
  if (error instanceof z.ZodError) return json({ error: "Check the business name and request." }, 400);
  if (error instanceof WorkspaceAccessError) return json({ error: "This business is unavailable to your account." }, 403);
  if (error instanceof WorkspaceConflictError) return json({ error: error.message }, 409);
  return json({ error: "Business setup could not be confirmed. Retry the same request before creating another." }, 503);
}
export async function GET() {
  if (!workspaceReleaseEnabled()) return json({ error: "Business workspaces are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return json({ error: "Sign in with a confirmed email." }, 401);
    const workspaces = await listWorkspaces(actor);
    return json({ actorId: actor.userId, businesses: workspaces
      .filter(item => item.kind === "customer" && item.access === "member" && ["owner", "admin"].includes(item.role || ""))
      .map(({ id, name }) => ({ id, name })) });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "Business workspaces are not enabled." }, 503);
  const denied = workspaceWriteGuard(request);
  if (denied) return denied;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return json({ error: "Sign in with a confirmed email." }, 401);
    if (await isRateLimitedWindowedAsync(`workspace:business-entry:${actor.userId}`, 30, 60_000)) return json({error:"Please wait before another setup request."},429);
    return json(await enterCustomerBusiness(actor, await readWorkspaceBody(request, 16000)));
  } catch (error) { return failure(error); }
}
