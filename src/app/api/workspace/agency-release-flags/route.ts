import { ReleaseFlagValidationError } from "@/platform/release-flags/store";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { agencyFlagCommandSchema, agencyFlagScopeSchema, readAgencyReleaseFlags, setAgencyReleaseFlag } from "@/platform/release-flags/agency";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "The workspace release is not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const p = new URL(request.url).searchParams;
    return workspaceJson(await readAgencyReleaseFlags(actor, agencyFlagScopeSchema.parse({ agencyWorkspaceId: p.get("agencyWorkspaceId"), workspaceId: p.get("workspaceId") })));
  } catch (error) { if (error instanceof ReleaseFlagValidationError) return workspaceJson({ error: error.message, code: error.code }, 400); return workspaceHttpFailure(error); }
}
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "The workspace release is not enabled." }, 503);
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    return workspaceJson(await setAgencyReleaseFlag(actor, agencyFlagCommandSchema.parse(await readWorkspaceBody(request, 4000))));
  } catch (error) { if (error instanceof ReleaseFlagValidationError) return workspaceJson({ error: error.message, code: error.code }, 400); return workspaceHttpFailure(error); }
}
