import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { acceptWorkAllowanceCap } from "@/platform/work-economics/allowances";
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
    if (!actor) return allowanceJson({ error: "Sign in to accept this spending cap." }, 401);
    const body = await readAllowanceBody(request);
    if (body instanceof Response) return body;
    return allowanceJson({ ...await acceptWorkAllowanceCap(actor, body), currentActorId: actor.userId });
  } catch (error) {
    return allowanceFailure(error);
  }
}
