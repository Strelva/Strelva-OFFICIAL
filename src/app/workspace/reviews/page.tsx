import { publishingEnabledForWorkspace } from "@/products/publishing/server";
import type { Metadata } from "next";
import { openWorkspacePlace } from "@/platform/owner-entry/place";
import { readPlace } from "@/platform/owner-entry/place-state";
import { readWorkspaceReviews } from "@/products/google-listing/server";
import { WorkspaceReviewsView } from "@/experience/places/WorkspaceReviews";
import { systemsReleasedFor } from "@/platform/systems-release";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reviews", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** The workspace home of /dashboard/reviews (owner-entry spec §5). */
export default async function ReviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { workspaceId, actor } = await openWorkspacePlace(await searchParams, "/workspace/reviews");
  const state = await readPlace("reviews", workspaceId, () => readWorkspaceReviews(actor, workspaceId));
  const systemsReleased = await systemsReleasedFor(actor, workspaceId).catch(() => false);
  return <WorkspaceReviewsView publishing={await publishingEnabledForWorkspace(workspaceId, actor)} workspaceId={workspaceId} state={state} chrome={{ systemsReleased }} />;
}
