import { isSuperAdmin } from "@/lib/auth";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { awardWorkAllowance } from "@/platform/work-economics/allowances";
import {
  allowanceActor,
  allowanceFailure,
  allowanceJson,
  readAllowanceBody,
  validMutationRequest,
} from "../http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return allowanceJson({ error: "Work allowances are not enabled." }, 503);
  const invalid = validMutationRequest(request);
  if (invalid) return invalid;
  try {
    const actor = await allowanceActor();
    if (!actor) return allowanceJson({ error: "Sign in to award an allowance." }, 401);
    if (!(await isSuperAdmin())) return allowanceJson({ error: "Operator access is required." }, 403);
    const body = await readAllowanceBody(request);
    if (body instanceof Response) return body;
    return allowanceJson({ ...await awardWorkAllowance(actor, body), currentActorId: actor.userId });
  } catch (error) {
    return allowanceFailure(error);
  }
}
