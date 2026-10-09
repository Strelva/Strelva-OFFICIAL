import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { readCreatorMaintenance } from "@/platform/connect/creator-maintenance";
import CreatorMaintenance from "./CreatorMaintenance";
export const dynamic = "force-dynamic";
export default async function CreatorMaintenancePage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  if (!workspaceReleaseEnabled() || process.env.STRELVA_REVENUE_SPLITS !== "1") notFound();
  const actor = await workspaceHttpActor();
  if (!actor) redirect("/sign-in");
  const { workspaceId = "" } = await searchParams;
  let graph;
  try { graph = await readCreatorMaintenance(actor, workspaceId); }
  catch { return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="font-display text-3xl">Creator maintenance</h1><p className="mt-6" role="alert">Maintenance records could not be loaded. Confirm owner or admin access and try again.</p></main>; }
  return <main className="mx-auto max-w-3xl px-6 py-12"><Link href={`/workspace/billing?workspaceId=${encodeURIComponent(workspaceId)}`} className="inline-flex min-h-12 items-center underline">Back to billing</Link><h1 className="mt-6 font-display text-3xl">Creator maintenance</h1><p className="mt-4">Your source listings and immutable maintenance history. These records grant no customer data access and establish no provider or commercial qualification.</p><CreatorMaintenance key={workspaceId} graph={graph} /></main>;
}
