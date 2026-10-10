import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { getAuthenticatedOperatorContext } from "@/platform/infra/auth";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { readWorkspaceBody, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { executeGovernedPayout, governedPayoutCommandSchema } from "@/platform/connect/governed-operations";
export const dynamic = "force-dynamic";
/** Execution remains separate from recording a specific operator authorization. */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled() || process.env.STRELVA_REVENUE_SPLITS !== "1" || process.env.STRELVA_CONNECT !== "1" || process.env.STRELVA_SPLIT_PAYOUT_EXECUTION !== "1") return workspaceJson({ error: "Payout execution is not enabled." }, 503);
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const operator = await getAuthenticatedOperatorContext(); if (!operator) return workspaceJson({ error: "Forbidden" }, 403);
    if (await isRateLimitedWindowedAsync(`money-payout:${operator.actor.userId}`, 10, 60000)) return workspaceJson({ error: "Please wait." }, 429);
    return workspaceJson(await executeGovernedPayout(operator.actor, governedPayoutCommandSchema.parse(await readWorkspaceBody(request, 4000))));
  } catch (error) { return workspaceHttpFailure(error); }
}
