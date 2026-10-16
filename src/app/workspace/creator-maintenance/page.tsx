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
      <StrelvaShell title="" workspaceId={workspaceId} agencyNavigation={{}} detailsPlace="elsewhere">
        <div className={styles.screen}>
          <MoneyLoadFailure
            title="Your apps couldn't be read just now."
            quiet="Only an owner or admin of the agency can open this. Try again in a moment."
            retryHref={`/workspace/creator-maintenance?workspaceId=${id}`}
          />
        </div>
      </StrelvaShell>
    );
  }
  return (
    <StrelvaShell title="" workspaceId={workspaceId} agencyNavigation={{}} detailsPlace="elsewhere">
      <div className={styles.screen}>
        <nav aria-label="Back" className={styles.links}>
          {/* Back to the agency's own billing page; agencies have no Plan and usage. */}
          <XaTextLink href={`/workspace/billing?workspaceId=${id}`}>
            Clients you cover
          </XaTextLink>
          <span aria-hidden="true">·</span>
          <XaTextLink
            href={`/workspace?${new URLSearchParams({ workspaceId, agencyView: "library" })}`}
          >
            Library
          </XaTextLink>
        </nav>
        <XaHeadline quiet="Who looks after each one, and what you earn when a business pays for it.">
          Apps you made for others
        </XaHeadline>
        <SourceListing graph={sourceGraph} actorId={actor.userId} />
        <CreatorMaintenance
          key={workspaceId}
          graph={graph}
          listingNames={Object.fromEntries(
            sourceGraph.sources.map((item) => [
              item.sourceRevisionId,
              item.name,
            ]),
          )}
        />
      </div>
    </StrelvaShell>
  );
}
