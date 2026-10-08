import { ReleaseFlagValidationError } from "@/platform/release-flags/store";
import { getAuthenticatedOperatorContext } from "@/platform/infra/auth";
import { agencyFlagScopeSchema, readOperatorAgencyReleaseFlags, operatorCeilingCommandSchema, setAgencyReleaseFlagCeiling } from "@/platform/release-flags/agency";
import { readWorkspaceBody, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
export const dynamic = "force-dynamic";
/** Explicit permission only; no defaults, release activation, mandates or owner consent. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const operator = await getAuthenticatedOperatorContext(); if (!operator) return workspaceJson({ error: "Forbidden" }, 403);
    const { id } = await params;
    const input = operatorCeilingCommandSchema.parse(await readWorkspaceBody(request, 4000));
    if (input.workspaceId !== id) return workspaceJson({ error: "This permission is for a different business." }, 400);
    return workspaceJson(await setAgencyReleaseFlagCeiling(operator.actor, input));
  } catch (error) { if (error instanceof ReleaseFlagValidationError) return workspaceJson({ error: error.message, code: error.code }, 400); return workspaceHttpFailure(error); }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const operator = await getAuthenticatedOperatorContext(); if (!operator) return workspaceJson({ error: "Forbidden" }, 403);
    const { id } = await params;
    const input = agencyFlagScopeSchema.parse({ workspaceId: id, agencyWorkspaceId: new URL(request.url).searchParams.get("agencyWorkspaceId") });
    return workspaceJson(await readOperatorAgencyReleaseFlags(operator.actor, input.agencyWorkspaceId, input.workspaceId));
  } catch (error) { return workspaceHttpFailure(error); }
}
