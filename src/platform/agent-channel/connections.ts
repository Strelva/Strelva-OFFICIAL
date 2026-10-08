import { z } from 'zod';
import type { WorkspaceActor } from '@/platform/workspaces/types';
import { oauthRpc } from './oauth';
const connectionSchema = z.object({
  id: z.uuid(), clientId: z.string(), clientName: z.string(), scopes: z.array(z.string()),
  createdAt: z.string(), expiresAt: z.string(), lastUsedAt: z.string().nullable(), revokedAt: z.string().nullable(),
  agencyId: z.uuid().nullable(), status: z.enum(['active', 'expired', 'revoked', 'authority_removed']),
});
export type AgentConnection = z.infer<typeof connectionSchema>;
export async function listAgentConnections(actor: WorkspaceActor, workspaceId: string) {
  return z.array(connectionSchema).parse(await oauthRpc('list_agent_oauth_connections', {
    p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_workspace_id: z.uuid().parse(workspaceId),
  }));
}
export async function disconnectAgentConnection(actor: WorkspaceActor, workspaceId: string, connectionId: string) {
  z.literal(true).parse(await oauthRpc('disconnect_agent_oauth_connection', {
    p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
    p_workspace_id: z.uuid().parse(workspaceId), p_connection_id: z.uuid().parse(connectionId),
  }));
}
