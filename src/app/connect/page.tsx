import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { StEmpty, StHead, StMono, StNotice, StPage, StPillLink, StSection } from "@/components/ui/strelva/Kit";
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
  return <main data-workspace-theme="linen" className="min-h-dvh bg-canvas text-warm-black"><StPage>
    <StHead crumb={{ label: "Business details", href: "/workspace?view=settings" }} title="Assistants" meta="Read confirmed business facts and saved websites from your assistant. Website changes stay in Strelva for owner review." />
    <StSection title="Connect Claude or Codex"><p className="text-sm text-gray-muted">In Claude, add a custom connector named Strelva using this address. In Codex, add it as an HTTP MCP server, then sign in with OAuth.</p><p className="break-all"><StMono>{resourceUrl()}</StMono></p><p className="text-sm text-gray-muted">Sign in, choose a business, and review the requested permissions. Start with “Read my business context and show me the websites I can work on.” Access renews while the connection and your business permissions remain valid.</p></StSection>
    {choices === null ? <StNotice tone="critical">Your business access could not be loaded. Reload to try again.</StNotice> : choices.length === 0 ? <StEmpty>You need direct owner access to a business to manage its assistant connections.</StEmpty> : <>
      <nav aria-label="Choose business" className="flex flex-wrap gap-3">{choices.map(choice => <StPillLink key={choice.workspaceId} variant="soft" href={`/connect?workspaceId=${choice.workspaceId}`}>{choice.name}{selected?.workspaceId === choice.workspaceId ? " · selected" : ""}</StPillLink>)}</nav>
      {selected ? <StSection as="div" title={selected.name}><AssistantConnections workspaceId={selected.workspaceId} /></StSection> : <StNotice tone="critical">That business is unavailable to your account. Choose a business above.</StNotice>}
    </>}
  </StPage></main>;
}
