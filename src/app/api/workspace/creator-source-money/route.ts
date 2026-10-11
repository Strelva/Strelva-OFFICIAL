import { z } from 'zod';
import { workspaceReleaseEnabled } from '@/platform/workspace-release';
import { isRateLimitedWindowedAsync } from '@/platform/infra/rate-limit';
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from '@/platform/workspaces/http';
import { neutralCreatorListingCommandSchema, readNeutralCreatorSources, registerNeutralCreatorListing } from '@/platform/connect/neutral-creator-money';
export const dynamic = 'force-dynamic';
const enabled = () => workspaceReleaseEnabled() && process.env.STRELVA_REVENUE_SPLITS === '1';
export async function GET(request: Request) {
  if (!enabled()) return workspaceJson({ error: 'Creator money terms are not enabled.' }, 503);
  try { const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: 'Sign in.' }, 401); return workspaceJson(await readNeutralCreatorSources(actor, z.uuid().parse(new URL(request.url).searchParams.get('workspaceId')))); } catch (error) { return workspaceHttpFailure(error); }
}
export async function POST(request: Request) {
  if (!enabled()) return workspaceJson({ error: 'Creator money terms are not enabled.' }, 503);
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try { const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: 'Sign in.' }, 401); if (await isRateLimitedWindowedAsync(`neutral-creator-listing:${actor.userId}`,20,60000)) return workspaceJson({ error: 'Please wait.' },429); return workspaceJson(await registerNeutralCreatorListing(actor,neutralCreatorListingCommandSchema.parse(await readWorkspaceBody(request,8000)))); } catch(error) { return workspaceHttpFailure(error); }
}
