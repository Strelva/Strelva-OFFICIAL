import { z } from "zod";
import { notFound, redirect } from "next/navigation";
import { StHead, StPage, StNotice, StTextButton } from "@/components/ui/strelva/Kit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { readPackageCreator } from "@/experience/workspace/agency/package-server";
import { systemHref } from "@/experience/systems/model";
export const dynamic = "force-dynamic";
export default async function SourceAttributionPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string; systemId?: string }> }) {
  if (!workspaceReleaseEnabled()) notFound();
  const actor = await workspaceHttpActor(); if (!actor) redirect("/sign-in");
  const parsed = z.object({ workspaceId: z.string().uuid(), systemId: z.string().uuid() }).safeParse(await searchParams); if (!parsed.success) notFound();
  const { workspaceId, systemId } = parsed.data;
  let creator;
  try { creator = await readPackageCreator(actor, workspaceId, systemId); }
  catch { return <StPage><StHead title="Source attribution" /><StNotice tone="critical">Creator lineage could not be verified.</StNotice></StPage>; }
  return <main data-workspace-theme="linen"><StPage><StHead title={`Made by ${creator.creatorName}`} crumb={{ label: "Back to the System", href: systemHref("", workspaceId, systemId) }} /><p className="text-sm text-gray-muted">This System keeps its original creator lineage. Each client Version has its own records, Connections and publication decisions.</p><p className="break-words text-sm">Recorded source: {creator.sourceRevisionId}</p><StNotice>Usage, royalties and maintenance obligations are shown only when recorded terms exist. Attribution alone establishes none.</StNotice>{workspaceId === creator.creatorWorkspaceId ? <><StTextButton href={`/workspace?${new URLSearchParams({ workspaceId, agencyView: "library" })}`}>Open Library sources</StTextButton>{process.env.STRELVA_REVENUE_SPLITS === "1" ? <StTextButton href={`/workspace/creator-maintenance?${new URLSearchParams({ workspaceId })}`}>Recorded listing and maintenance terms</StTextButton> : null}</> : null}</StPage></main>;
}
