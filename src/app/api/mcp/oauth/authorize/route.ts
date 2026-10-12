import { z } from 'zod';
import { workspaceHttpActor, workspaceWriteGuard, readWorkspaceBody, workspaceJson } from '@/platform/workspaces/http';
import { authorizeAgent, parseAuthorization, oauthEnabled, oauthOrigin } from '@/platform/agent-channel/oauth';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { if (!oauthEnabled())
    return workspaceJson({ error: 'Assistant connections are not enabled.' }, 503); const guard = workspaceWriteGuard(request); if (guard)
    return guard; const actor = await workspaceHttpActor(); if (!actor)
    return workspaceJson({ error: 'Sign in with a verified email.' }, 401); try {
    const i = z.object({ decision: z.enum(['approve', 'deny']), workspaceId: z.uuid().optional(), agencyId: z.uuid().nullable().optional(), params: z.record(z.string(), z.string()) }).strict().parse(await readWorkspaceBody(request, 16000));
    if (i.decision === 'deny') {
        const a = await parseAuthorization(i.params);
        const url = new URL(a.params.redirect_uri);
        url.searchParams.set('error', 'access_denied');
        url.searchParams.set('iss', oauthOrigin());
        if (a.params.state !== undefined)
            url.searchParams.set('state', a.params.state);
        return workspaceJson({ redirectTo: url.toString() });
    }
    if (!i.workspaceId)
        return workspaceJson({ error: 'Choose a business.' }, 400);
    return workspaceJson({ redirectTo: await authorizeAgent(actor, i.params, i.workspaceId, i.agencyId ?? null) });
}
catch {
    return workspaceJson({ error: 'This assistant or business grant could not be authorized.' }, 400);
} }
