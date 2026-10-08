import { z } from 'zod';
import { workspaceHttpActor, workspaceWriteGuard, readWorkspaceBody, workspaceJson, readBoundedBody } from '@/platform/workspaces/http';
import { hash, oauthEnabled, oauthRpc } from '@/platform/agent-channel/oauth';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { if (!oauthEnabled())
    return workspaceJson({ error: 'Unavailable' }, 503); if (request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) {
    try {
        const p = new URLSearchParams((await readBoundedBody(request, 8192)).toString('utf8'));
        if (p.getAll('token').length !== 1 || p.getAll('client_id').length !== 1 || !p.get('client_id') || !/^[A-Za-z0-9_-]{43}$/.test(p.get('token') || ''))
            return workspaceJson({ error: 'invalid_request' }, 400);
        await oauthRpc('revoke_agent_oauth_client_token', { p_token_hash: hash(p.get('token')!), p_client_id: p.get('client_id') });
        return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    }
    catch {
        return workspaceJson({ error: 'invalid_request' }, 400);
    }
} const guard = workspaceWriteGuard(request); if (guard)
    return guard; const actor = await workspaceHttpActor(); if (!actor)
    return workspaceJson({ error: 'Sign in' }, 401); try {
    const i = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict().parse(await readWorkspaceBody(request, 2000));
    await oauthRpc('revoke_agent_oauth_token', { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_token_hash: hash(i.token) });
    return workspaceJson({ revoked: true });
}
catch {
    return workspaceJson({ error: 'Could not revoke' }, 400);
} }
