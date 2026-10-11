import { z } from "zod";
import { notFound, redirect } from "next/navigation";
import { StHead, StNotice, StPage, StRow, StRows, StSection, StTextButton } from "@/components/ui/strelva/Kit";
import { readSystemVersion } from "@/experience/workspace/agency/version-server";
import { PostgresNeedsYouStore } from "@/platform/needs-you/repository";
import { needsYouReleaseEnabled } from "@/platform/needs-you/release";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { systemsReleasedFor } from "@/platform/systems-release";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { systemHref } from "@/experience/systems/model";
export const dynamic = "force-dynamic";
/** Exact read-only review for both agency and owner. Authority remains in Needs you. */
export default async function VersionReviewPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string; systemId?: string; decisionId?: string }> }) {
  if (!workspaceReleaseEnabled() || !needsYouReleaseEnabled()) notFound();
  const actor = await workspaceHttpActor();
  if (!actor) redirect("/sign-in");
  const input = z.object({ workspaceId: z.string().uuid(), systemId: z.string().uuid(), decisionId: z.string().uuid() }).safeParse(await searchParams);
  if (!input.success) notFound();
  const { workspaceId, systemId, decisionId } = input.data;
  let review;
  try {
    if (!(await systemsReleasedFor(actor, workspaceId))) notFound();
    const version = await readSystemVersion(actor, workspaceId, systemId);
    // The scope is checked before the internal decision read, and its lineage
    // must match. A caller cannot use a Version grant to read other decisions.
    const item = await PostgresNeedsYouStore.read(workspaceId, decisionId);
    if (!item || item.workspaceId !== workspaceId || item.systemId !== systemId || item.sourceLifecycle !== "version_release" || item.sourceId !== version.versionId) notFound();
    review = { item, label: version.label };
  } catch {
    return <StPage><StHead title="Prepared review" /><StNotice tone="critical">This exact review could not be verified for your access. Nothing changed.</StNotice></StPage>;
  }
  return <main data-workspace-theme="linen"><StPage><StHead title={review.item.title} crumb={{ label: review.label, href: systemHref("", workspaceId, systemId) }} meta={`Review ${decisionId}`} /><StSection title="Prepared review"><p>{review.item.detail}</p><StRows><StRow title="Current decision" detail={review.item.state.replaceAll("_", " ")} /><StRow title="If approved" detail={review.item.approveEffect} /><StRow title="If held" detail={review.item.notYetEffect} /></StRows><StNotice>The business owner decides. Opening this review does not approve or publish it.</StNotice><StTextButton href={`/workspace?${new URLSearchParams({ workspaceId, view: "needs-you" })}#decision-${decisionId}`}>Open this decision in Needs you</StTextButton></StSection></StPage></main>;
}
