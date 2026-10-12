import { z } from 'zod';
import { oauthEnabled } from '@/platform/agent-channel/oauth';
import { disconnectAgentConnection } from '@/platform/agent-channel/connections';
import { readWorkspaceBody, workspaceHttpActor, workspaceJson, workspaceWriteGuard } from '@/platform/workspaces/http';
export const dynamic = 'force-dynamic';
export async function DELETE(request: Request, context: { params: Promise<{ connectionId: string }> }) {
  if (!oauthEnabled()) return workspaceJson({ error: 'Agent connections are not enabled.' }, 503);
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  const actor = await workspaceHttpActor();
  if (!actor) return workspaceJson({ error: 'Sign in with a verified email.' }, 401);
  try {
    const { workspaceId } = z.object({ workspaceId: z.uuid() }).strict().parse(await readWorkspaceBody(request, 1024));
    await disconnectAgentConnection(actor, workspaceId, (await context.params).connectionId);
    return workspaceJson({ disconnected: true });
  } catch (error) {
    if (error instanceof z.ZodError) return workspaceJson({ error: 'Choose a valid business and connection.' }, 400);
    if (error instanceof Error && error.message === 'workspace_access_denied') return workspaceJson({ error: 'Only the business owner can disconnect this connection.' }, 403);
    return workspaceJson({ error: 'The disconnect could not be confirmed. Reload connections before trying again.' }, 503);
  }
}
