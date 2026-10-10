import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { Card } from '@/components/ui/Card';
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
    const frame = (children: React.ReactNode) => <main className="min-h-dvh bg-canvas px-6 py-12 text-warm-black md:px-8"><div className="mx-auto max-w-[560px]"><Card padding="lg">{children}</Card></div></main>;
    if (!parsed)
        return frame(<><h1 className="font-display text-2xl font-medium">This connection cannot continue</h1><p className="mt-4 text-base text-gray-muted">Start again from your assistant. Its client identity, redirect or requested permissions could not be verified.</p></>);
    const actor = await workspaceHttpActor();
    if (!actor)
        redirect(`/sign-in?next=${encodeURIComponent(`/connect/authorize?${new URLSearchParams(params)}`)}`);
    try {
        const choices = z.array(z.object({ workspaceId: z.uuid(), name: z.string(), agencyId: z.uuid().nullable(), agencyName: z.string().nullable() })).parse(await oauthRpc('read_agent_oauth_choices', { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail }));
        return frame(<AuthorizeAssistant clientName={parsed.client.client_name} clientHost={new URL(parsed.params.client_id).host} returnHost={new URL(parsed.params.redirect_uri).host} params={params} scopes={parsed.scopes} choices={choices}/>);
    }
    catch {
        return frame(<><h1 className="font-display text-2xl font-medium">Your businesses could not be loaded</h1><p className="mt-4 text-base text-gray-muted">Reload to try again. No assistant access has been granted.</p></>);
    }
}
