import { workspaceReleaseEnabled } from '@/platform/workspace-release';
import { getAuthenticatedOperatorContext } from '@/platform/infra/auth';
import { isRateLimitedWindowedAsync } from '@/platform/infra/rate-limit';
import { readWorkspaceBody, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from '@/platform/workspaces/http';
import { neutralCreatorMoneyCommandSchema, recordNeutralCreatorMoney } from '@/platform/connect/neutral-creator-money';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled() || process.env.STRELVA_REVENUE_SPLITS !== '1') return workspaceJson({ error: 'Creator money terms are not enabled.' },503);
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try { const operator = await getAuthenticatedOperatorContext(); if (!operator) return workspaceJson({ error: 'Forbidden' },403); if (await isRateLimitedWindowedAsync(`neutral-creator-configuration:${operator.actor.userId}`,20,60000)) return workspaceJson({ error: 'Please wait.' },429); return workspaceJson(await recordNeutralCreatorMoney(operator.actor,neutralCreatorMoneyCommandSchema.parse(await readWorkspaceBody(request,8000)))); } catch(error) { return workspaceHttpFailure(error); }
}
