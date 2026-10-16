import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { AuthorizeStopped } from '@/experience/connections/AuthorizeAssistantView';
import { workspaceHttpActor } from '@/platform/workspaces/http';
import { oauthEnabled, oauthRpc, parseAuthorization } from '@/platform/agent-channel/oauth';
import { AuthorizeAssistant } from './AuthorizeAssistant';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Connect an assistant | Strelva', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default async function AuthorizePage({ searchParams }: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    if (!oauthEnabled())
        notFound();
    const raw = await searchParams;
    const params = Object.fromEntries(Object.entries(raw).filter((e): e is [
        string,
        string
    ] => typeof e[1] === 'string'));
    let parsed: Awaited<ReturnType<typeof parseAuthorization>> | null = null;
    try {
        if (Object.values(raw).some(Array.isArray))
            throw new Error("invalid_request");
        parsed = await parseAuthorization(params);
    }
    catch { }
    if (!parsed)
        return <AuthorizeStopped title="This connection can’t continue.">Start again from your assistant. Strelva couldn’t verify its identity, where it returns you or what it asks to do.</AuthorizeStopped>;
    const actor = await workspaceHttpActor();
    if (!actor)
        redirect(`/sign-in?next=${encodeURIComponent(`/connect/authorize?${new URLSearchParams(params)}`)}`);
    try {
        const choices = z.array(z.object({ workspaceId: z.uuid(), name: z.string(), agencyId: z.uuid().nullable(), agencyName: z.string().nullable() })).parse(await oauthRpc('read_agent_oauth_choices', { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail }));
        return <AuthorizeAssistant clientName={parsed.client.client_name} clientHost={new URL(parsed.params.client_id).host} returnHost={new URL(parsed.params.redirect_uri).host} params={params} scopes={parsed.scopes} choices={choices}/>;
    }
    catch {
        return <AuthorizeStopped title="Your businesses couldn’t load.">Reload to try again.</AuthorizeStopped>;
    }
}
