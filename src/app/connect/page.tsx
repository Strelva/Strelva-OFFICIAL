import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Card } from "@/components/ui/Card";
import { AssistantConnections } from "@/experience/workspace/AssistantConnections";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { oauthEnabled, oauthRpc, resourceUrl } from "@/platform/agent-channel/oauth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connected assistants | Strelva", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!oauthEnabled()) notFound();
  const raw = await searchParams;
  const requested = typeof raw.workspaceId === "string" ? raw.workspaceId : null;
  const actor = await workspaceHttpActor();
  if (!actor) redirect(`/sign-in?next=${encodeURIComponent(`/connect${requested ? `?workspaceId=${encodeURIComponent(requested)}` : ""}`)}`);
  let choices: { workspaceId: string; name: string; agencyId: string | null }[] | null = null;
  try {
    choices = z.array(z.object({ workspaceId: z.uuid(), name: z.string(), agencyId: z.uuid().nullable() }))
      .parse(await oauthRpc("read_agent_oauth_choices", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail })).filter(choice => choice.agencyId === null);
  } catch { /* No permission or connection claim without a confirmed read. */ }
  const selected = choices?.find(choice => choice.workspaceId === requested) ?? (!requested ? choices?.[0] : undefined);
  return <main className="min-h-dvh bg-canvas px-6 py-12 text-warm-black md:px-8"><div className="mx-auto max-w-3xl space-y-8">
    <header className="space-y-4"><Link href="/workspace" className="text-sm text-accent-text underline underline-offset-4">Back to Strelva</Link><h1 className="font-display text-3xl font-medium">Strelva in your assistant</h1><p className="text-base text-gray-muted">Connect your business. Read its facts and saved websites, then prepare a website change for review in Strelva.</p></header>
    <Card><div className="space-y-4"><h2 className="text-base font-medium">Connect Claude or Codex</h2><p className="text-sm text-gray-muted">In Claude, add a custom connector named Strelva using this address. In Codex, add it as an HTTP MCP server, then sign in with OAuth.</p><code className="block break-all rounded-lg bg-surface-raised p-4 text-sm">{resourceUrl()}</code><p className="text-sm text-gray-muted">Sign in, choose a business, and review the requested permissions. Start with “Read my business context and show me the websites I can work on.” Access renews while the connection and your business permissions remain valid.</p></div></Card>
    {choices === null ? <p role="alert" className="text-sm text-critical">Your business access could not be loaded. Reload to try again.</p> : choices.length === 0 ? <p className="text-sm text-gray-muted">You need direct owner access to a business to manage its assistant connections.</p> : <>
      <nav aria-label="Choose business" className="flex flex-wrap gap-4">{choices.map(choice => <Link key={choice.workspaceId} href={`/connect?workspaceId=${choice.workspaceId}`} aria-current={selected?.workspaceId === choice.workspaceId ? "page" : undefined} className="inline-flex min-h-11 items-center text-sm text-accent-text underline underline-offset-4">{choice.name}</Link>)}</nav>
      {selected ? <Card><p className="mb-4 text-sm font-medium text-accent-text">{selected.name}</p><AssistantConnections workspaceId={selected.workspaceId} /></Card> : <p role="alert" className="text-sm text-critical">That business is unavailable to your account. Choose a business above.</p>}
    </>}
  </div></main>;
}
