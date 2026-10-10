import { readBoundedBody, workspaceJson } from '@/platform/workspaces/http';
import { hash, oauthEnabled, oauthRpc } from '@/platform/agent-channel/oauth';
import { isRateLimitedAsync, rateLimitKey } from '@/platform/infra/rate-limit';
export const dynamic = 'force-dynamic';
/** RFC 7009 client revocation. Owners disconnect by connection ID in their workspace. */
export async function POST(request: Request) {
  if (!oauthEnabled()) return workspaceJson({ error: 'temporarily_unavailable' }, 503);
  if (await isRateLimitedAsync(rateLimitKey(request, 'agent-oauth-revoke'), 30)) return workspaceJson({ error: 'temporarily_unavailable' }, 429);
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return workspaceJson({ error: 'invalid_request' }, 400);
  try {
    const p = new URLSearchParams((await readBoundedBody(request, 8192)).toString('utf8'));
    if (p.getAll('token').length !== 1 || p.getAll('client_id').length !== 1 || !p.get('client_id') || p.get('client_id')!.length > 2000
      || p.getAll('token_type_hint').length > 1 || !/^[A-Za-z0-9_-]{43}$/.test(p.get('token') || '')) return workspaceJson({ error: 'invalid_request' }, 400);
    await oauthRpc('revoke_agent_oauth_client_token', { p_token_hash: hash(p.get('token')!), p_client_id: p.get('client_id') });
    return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch { return workspaceJson({ error: 'invalid_request' }, 400); }
}
