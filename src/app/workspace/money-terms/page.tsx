import { notFound, redirect } from "next/navigation";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { XaHeadline, XaTextLink } from "@/components/ui/strelva/Xa";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { readGovernedMoney } from "@/platform/connect/governed-operations";
import { readNeutralVersionMoney } from "@/platform/connect/neutral-creator-money";
import { VersionTerms } from "@/experience/workspace/money/VersionTerms";
import { CollectionTerms } from "@/experience/workspace/money/CollectionTerms";
import { MoneyLoadFailure } from "@/experience/workspace/money/MoneyLoadFailure";
import styles from "@/experience/workspace/money/money.module.css";
export const dynamic = "force-dynamic";
export default async function RecordedMoneyTermsPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  if (!workspaceReleaseEnabled() || process.env.STRELVA_REVENUE_SPLITS !== "1") notFound();
  const actor = await workspaceHttpActor(); if (!actor) redirect("/sign-in");
  const { workspaceId = "" } = await searchParams;
  const id = encodeURIComponent(workspaceId);
  let graph, versionGraph;
  try { graph = await readGovernedMoney(actor, workspaceId); versionGraph = await readNeutralVersionMoney(actor, workspaceId); }
  catch { return <StrelvaShell title="" workspaceId={workspaceId} active="settings" detailsPlace="plan"><div className={styles.screen}><MoneyLoadFailure title="Terms could not be loaded." quiet="Confirm your current business access and reload." retryHref={`/workspace/money-terms?workspaceId=${id}`} /></div></StrelvaShell>; }
  return <StrelvaShell title="" workspaceId={workspaceId} active="settings" detailsPlace="plan"><div className={styles.screen}>
    <p className={styles.note}><XaTextLink href={`/workspace/billing?workspaceId=${id}`}>Plan and billing</XaTextLink></p>
    <XaHeadline quiet="Written prices you accepted, and the exact period each covers. Nothing here charges a card.">Recorded money terms</XaHeadline>
    <CollectionTerms key={workspaceId} graph={graph} actorId={actor.userId} />
    <VersionTerms graph={versionGraph} actorId={actor.userId} />
  </div></StrelvaShell>;
}
