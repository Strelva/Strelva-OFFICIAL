import { aiControlsReleaseEnabled } from "@/platform/infra/ai-controls-release";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { aiControlsCommandSchema, aiControlsScopeSchema } from "@/platform/ai-controls/contracts";
import { readAgencyAiControls, setAgencyAiControls } from "@/platform/ai-controls/service";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
export const dynamic = "force-dynamic";

const off = () => workspaceJson({ error: "Usage controls are not enabled." }, 503);
/** What the server enforces, so a screen can explain a limit it does not set itself. */
function enforcement() {
  const free = process.env.STRELVA_FREE_MONTHLY_AI_CAP_USD;
  const freeCapUsd = free && Number.isFinite(Number(free)) ? Number(free) : null;
  return { budgetEnforced: process.env.STRELVA_BUSINESS_AI_BUDGET === "1", freeCapUsd };
}

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled() || !aiControlsReleaseEnabled()) return off();
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const p = new URL(request.url).searchParams;
    const scope = aiControlsScopeSchema.parse({ agencyWorkspaceId: p.get("agencyWorkspaceId"), workspaceId: p.get("workspaceId") });
    return workspaceJson({ ...(await readAgencyAiControls(actor, scope)), ...enforcement() });
  } catch (error) { return workspaceHttpFailure(error); }
}
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled() || !aiControlsReleaseEnabled()) return off();
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    return workspaceJson({ ...(await setAgencyAiControls(actor, aiControlsCommandSchema.parse(await readWorkspaceBody(request, 4000)))), ...enforcement() });
  } catch (error) { return workspaceHttpFailure(error); }
}
