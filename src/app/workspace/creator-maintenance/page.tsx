import { notFound, redirect } from "next/navigation";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { XaHeadline, XaTextLink } from "@/components/ui/strelva/Xa";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { readCreatorMaintenance } from "@/platform/connect/creator-maintenance";
import { readNeutralCreatorSources } from "@/platform/connect/neutral-creator-money";
import { SourceListing } from "@/experience/workspace/money/SourceListing";
import { MoneyLoadFailure } from "@/experience/workspace/money/MoneyLoadFailure";
import styles from "@/experience/workspace/money/money.module.css";
import CreatorMaintenance from "./CreatorMaintenance";
export const dynamic = "force-dynamic";
export default async function CreatorMaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  if (!workspaceReleaseEnabled() || process.env.STRELVA_REVENUE_SPLITS !== "1")
    notFound();
  const actor = await workspaceHttpActor();
  if (!actor) redirect("/sign-in");
  const { workspaceId = "" } = await searchParams;
  const id = encodeURIComponent(workspaceId);
  let graph, sourceGraph;
  try {
    graph = await readCreatorMaintenance(actor, workspaceId);
    sourceGraph = await readNeutralCreatorSources(actor, workspaceId);
  } catch {
    return (
      <StrelvaShell title="" workspaceId={workspaceId} detailsPlace="plan">
        <div className={styles.screen}>
          <MoneyLoadFailure
            title="Maintenance records could not be loaded."
            quiet="Confirm owner or admin access and try again."
            retryHref={`/workspace/creator-maintenance?workspaceId=${id}`}
          />
        </div>
      </StrelvaShell>
    );
  }
  return (
    <StrelvaShell title="" workspaceId={workspaceId} detailsPlace="plan">
      <div className={styles.screen}>
        <nav aria-label="Back" className={styles.links}>
          <XaTextLink href={`/workspace/billing?workspaceId=${id}`}>
            Billing
          </XaTextLink>
          <span aria-hidden="true">·</span>
          <XaTextLink
            href={`/workspace?${new URLSearchParams({ workspaceId, agencyView: "library" })}`}
          >
            Library sources
          </XaTextLink>
        </nav>
        <XaHeadline quiet="These records grant no access to client data and set no payment on their own.">
          Creator maintenance
        </XaHeadline>
        <SourceListing graph={sourceGraph} actorId={actor.userId} />
        <CreatorMaintenance key={workspaceId} graph={graph} />
      </div>
    </StrelvaShell>
  );
}
