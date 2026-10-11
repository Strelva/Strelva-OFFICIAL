import { z } from 'zod';
import { oauthEnabled } from '@/platform/agent-channel/oauth';
import { listAgentConnections } from '@/platform/agent-channel/connections';
import { workspaceHttpActor, workspaceJson } from '@/platform/workspaces/http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!oauthEnabled()) return workspaceJson({ error: 'Agent connections are not enabled.' }, 503);
  const actor = await workspaceHttpActor();
  if (!actor) return workspaceJson({ error: 'Sign in with a verified email.' }, 401);
  const params = new URL(request.url).searchParams;
  if (params.getAll('workspaceId').length !== 1) return workspaceJson({ error: 'Choose a business.' }, 400);
  const workspaceId = z.uuid().safeParse(params.get('workspaceId'));
  if (!workspaceId.success) return workspaceJson({ error: 'Choose a business.' }, 400);
  try { return workspaceJson({ connections: await listAgentConnections(actor, workspaceId.data) }); }
  catch (error) {
    if (error instanceof Error && error.message === 'workspace_access_denied') return workspaceJson({ error: 'Only the business owner can manage agent connections.' }, 403);
    return workspaceJson({ error: 'Agent connections could not be loaded. Try again.' }, 503);
  }
}
