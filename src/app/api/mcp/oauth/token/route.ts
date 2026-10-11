import { exchangeAgentCode, oauthEnabled } from '@/platform/agent-channel/oauth';
import { readBoundedBody } from '@/platform/workspaces/http';
import { isRateLimitedAsync, rateLimitKey } from '@/platform/infra/rate-limit';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'Cache-Control': 'no-store' } }); if (!oauthEnabled())
    return json({ error: 'temporarily_unavailable' }, 503); if (await isRateLimitedAsync(rateLimitKey(request, 'agent-oauth-token'), 30))
    return json({ error: 'temporarily_unavailable' }, 429); if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))
    return json({ error: 'invalid_request' }, 400); try {
    const text = (await readBoundedBody(request, 8192)).toString('utf8');
    return json(await exchangeAgentCode(new URLSearchParams(text)));
}
catch (error) {
    const code = error instanceof Error && ['invalid_request', 'invalid_grant', 'invalid_scope', 'unsupported_grant_type', 'temporarily_unavailable'].includes(error.message) ? error.message : 'invalid_grant';
    return json({ error: code }, code === 'temporarily_unavailable' ? 503 : 400);
} }
