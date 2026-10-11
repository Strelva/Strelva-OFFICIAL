import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { getAuthenticatedOperatorContext } from "@/platform/infra/auth";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { readWorkspaceBody, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { z } from "zod";
import { operatorMoneyCommandSchema, readOperatorMoneyConfiguration, recordOperatorMoneyConfiguration } from "@/platform/connect/governed-operations";
export const dynamic = "force-dynamic";
/** Explicit recorded agreement/price/payout authorization. No provider dispatch. */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled() || process.env.STRELVA_REVENUE_SPLITS !== "1") return workspaceJson({ error: "Recorded money terms are not enabled." }, 503);
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const operator = await getAuthenticatedOperatorContext(); if (!operator) return workspaceJson({ error: "Forbidden" }, 403);
    if (await isRateLimitedWindowedAsync(`money-configuration:${operator.actor.userId}`, 20, 60000)) return workspaceJson({ error: "Please wait." }, 429);
    const command = operatorMoneyCommandSchema.parse(await readWorkspaceBody(request, 8000));
    return workspaceJson(await recordOperatorMoneyConfiguration(operator.actor, command));
  } catch (error) { return workspaceHttpFailure(error); }
}
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled() || process.env.STRELVA_REVENUE_SPLITS !== "1") return workspaceJson({ error: "Recorded money terms are not enabled." }, 503);
  try {
    const operator = await getAuthenticatedOperatorContext(); if (!operator) return workspaceJson({ error: "Forbidden" }, 403);
    return workspaceJson(await readOperatorMoneyConfiguration(operator.actor, z.uuid().parse(new URL(request.url).searchParams.get("workspaceId"))));
  } catch (error) { return workspaceHttpFailure(error); }
}
