import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { StHead, StNotice, StPage, StTextButton } from "@/components/ui/strelva/Kit";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { listWorkspaces } from "@/platform/workspaces";
import { createSupabaseAskHistory } from "@/platform/ask/history";
import { readWorkspaceExitCompleted } from "@/platform/workspace-exit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { systemsReleaseEnabledForWorkspace } from "@/platform/systems-release";
import { websiteRebuildReleasedFor } from "@/products/websites/index";
import { WebsiteAskContinuation } from "./WebsiteAskContinuation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prepare your website", robots: { index: false, follow: false }, referrer: "no-referrer" };
const querySchema = z.object({ workspaceId: z.string().uuid(), conversationId: z.string().uuid(), messageId: z.string().uuid() }).strict();
export default async function WebsiteAskPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!workspaceReleaseEnabled()) notFound();
  const input = querySchema.safeParse(await searchParams);
  if (!input.success) notFound();
  const { workspaceId, conversationId, messageId } = input.data;
  const here = `/workspace/business/new/website?${new URLSearchParams(input.data)}`;
  const user = await getSessionUser();
  if (!user?.id || !user.email || !user.email_confirmed_at) redirect(`/sign-in?next=${encodeURIComponent(here)}`);
  const actor = { userId: user.id, verifiedEmail: user.email };
  const business = (await listWorkspaces(actor)).find(item => item.id === workspaceId && item.kind === "customer" && item.access === "member" && ["owner", "admin"].includes(item.role || ""));
  if (!business) notFound();
  const ready = await Promise.all([
    systemsReleaseEnabledForWorkspace(workspaceId, { userId: actor.userId, operator: false, tester: false }),
    websiteRebuildReleasedFor(actor, workspaceId),
    readWorkspaceExitCompleted(workspaceId),
  ]).then(([systems, website, exited]) => systems && website && !exited).catch(() => false);
  const history = ready ? await createSupabaseAskHistory().read(actor, { workspaceId, conversationId, limit: 400 }).catch(() => null) : null;
  const message = history?.mine ? history.messages.find(item => item.id === messageId && item.role === "user" && item.content.length <= 3000) : null;
  return <StrelvaShell title={business.name} workspaceId={workspaceId}><StPage><StHead title="Prepare your website" />{message ? <WebsiteAskContinuation workspaceId={workspaceId} actorEmail={actor.verifiedEmail} words={message.content} /> : <><StNotice tone="need">This website ask is unavailable. Check your business access, its release availability and the saved conversation before trying again. Website asks can carry up to 3,000 characters.</StNotice><StTextButton href={`/workspace?workspaceId=${workspaceId}&view=home`}>Back to Home</StTextButton></>}</StPage></StrelvaShell>;
}
