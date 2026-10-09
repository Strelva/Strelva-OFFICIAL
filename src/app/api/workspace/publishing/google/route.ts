import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { commandNativeGoogle } from "@/products/google-listing/server";
import { POST as makeReal } from "@/app/api/workspace/systems/make-real/route";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "The workspace release is not enabled." }, 503);
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    return workspaceJson(await commandNativeGoogle(actor, await readWorkspaceBody(request, 16000), async plan => {
      const result = await makeReal(new Request(new URL("/api/workspace/systems/make-real", request.url), { method: "POST", headers: request.headers, body: JSON.stringify({ workspaceId: plan.workspaceId, possibilityId: plan.possibilityId, expectedPlan: { candidateRevision: plan.candidateRevision, fingerprint: plan.planFingerprint } }) }));
      if (!result.ok) throw new Error("Native Make real did not confirm. Read existing activation before retrying.");
      return result.json();
    }));
  } catch (error) { return workspaceHttpFailure(error); }
}
