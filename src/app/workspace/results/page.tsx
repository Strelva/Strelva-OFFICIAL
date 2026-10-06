import type { Metadata } from "next";
import { resolveRange } from "@/lib/analytics/period";
import { openWorkspacePlace } from "@/platform/owner-entry/place";
import { readPlace } from "@/platform/owner-entry/place-state";
import { readWorkspaceResults } from "@/products/websites/linked-results";
import { WorkspaceResultsView } from "@/experience/places/WorkspaceResults";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Results and health", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** The workspace home of /dashboard/analytics and /dashboard/health (owner-entry spec §5). */
export default async function ResultsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { workspaceId, actor } = await openWorkspacePlace(params, "/workspace/results");
  const text = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);
  const range = resolveRange(text(params.range), text(params.from), text(params.to));
  const state = await readPlace("results", workspaceId, () => readWorkspaceResults(actor, workspaceId, range));
  return <WorkspaceResultsView workspaceId={workspaceId} state={state} range={range.key} />;
}
