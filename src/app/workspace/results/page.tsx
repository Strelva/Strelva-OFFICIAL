import type { Metadata } from "next";
import { resolveRange } from "@/lib/analytics/period";
import { openWorkspacePlace } from "@/platform/owner-entry/place";
import { readPlace } from "@/platform/owner-entry/place-state";
import { readWorkspaceResults } from "@/products/websites/server";
import { resultsChange, WorkspaceResultsView } from "@/experience/places/WorkspaceResults";
import { needsYouReleaseEnabled, readStrelvaHandled } from "@/experience/workspace/needs-you-server";
import { readOwnerPlaceChrome } from "@/experience/places/place-chrome-server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Results", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** The workspace home of /dashboard/analytics and /dashboard/health (owner-entry spec §5). */
export default async function ResultsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { workspaceId, actor } = await openWorkspacePlace(params, "/workspace/results");
  const text = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);
  const range = resolveRange(text(params.range), text(params.from), text(params.to));
  // What changed is read under the same member actor (its RPC rechecks access). A failed or
  // switched-off read leaves the line out rather than saying nothing changed.
  const [state, handled] = await Promise.all([
    readPlace("results", workspaceId, () => readWorkspaceResults(actor, workspaceId, range)),
    needsYouReleaseEnabled() ? readStrelvaHandled(actor, workspaceId).catch(() => undefined) : Promise.resolve(undefined),
  ]);
  // The real rail: pinned Systems (this place marked current), the business name and its agency.
  const chrome = await readOwnerPlaceChrome(actor, workspaceId, "website");
  return <WorkspaceResultsView workspaceId={workspaceId} state={state} range={range.key} chrome={chrome} latest={handled ? resultsChange(handled, workspaceId) : undefined} />;
}
