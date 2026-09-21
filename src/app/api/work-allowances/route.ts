import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { inspectWorkAllowances } from "@/platform/work-economics/allowances";
import { allowanceActor, allowanceFailure, allowanceJson } from "./http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return allowanceJson({ error: "Work allowances are not enabled." }, 503);
  try {
    const actor = await allowanceActor();
    if (!actor) return allowanceJson({ error: "Sign in to view allowances." }, 401);
    const params = new URL(request.url).searchParams;
    const inspection = await inspectWorkAllowances(actor, {
      ...(params.get("allowanceId") ? { allowanceId: params.get("allowanceId") } : {}),
      ...(params.get("workspaceId") ? { workspaceId: params.get("workspaceId") } : {}),
    });
    return allowanceJson({ ...inspection, currentActorId: actor.userId });
  } catch (error) {
    return allowanceFailure(error);
  }
}
