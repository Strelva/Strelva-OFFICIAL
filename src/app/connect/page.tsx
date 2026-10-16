import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { AssistantsPlace } from "@/experience/connections/AssistantsPlace";
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
  return <StrelvaShell workspaceId={selected?.workspaceId} businessContext={selected?.name} title="Assistants" active="connections" detailsPlace="connections" connectionsAvailable>
    <AssistantsPlace choices={choices} selected={selected} resourceUrl={resourceUrl()}>
      {selected ? <AssistantConnections workspaceId={selected.workspaceId} businessName={selected.name} /> : null}
    </AssistantsPlace>
  </StrelvaShell>;
}
