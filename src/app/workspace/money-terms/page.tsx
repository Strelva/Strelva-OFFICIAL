import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { readGovernedMoney } from "@/platform/connect/governed-operations";
import { CollectionTerms } from "@/experience/workspace/money/CollectionTerms";
export const dynamic = "force-dynamic";
export default async function RecordedMoneyTermsPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  if (!workspaceReleaseEnabled() || process.env.STRELVA_REVENUE_SPLITS !== "1") notFound();
  const actor = await workspaceHttpActor(); if (!actor) redirect("/sign-in");
  const { workspaceId = "" } = await searchParams;
  let graph;
  try { graph = await readGovernedMoney(actor, workspaceId); }
  catch { return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="font-display text-3xl">Recorded money terms</h1><p role="alert" className="mt-6">Terms could not be loaded. Confirm your current business access and reload.</p></main>; }
  return <main className="mx-auto max-w-3xl px-6 py-12 text-warm-black"><Link className="inline-flex min-h-12 items-center underline" href={`/workspace/billing?workspaceId=${encodeURIComponent(workspaceId)}`}>Back to billing</Link><h1 className="mt-6 font-display text-3xl">Recorded money terms</h1><CollectionTerms key={workspaceId} graph={graph} /></main>;
}
