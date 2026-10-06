import type { Metadata } from "next";
import { openWorkspacePlace } from "@/platform/owner-entry/place";
import { readPlace } from "@/platform/owner-entry/place-state";
import { readWorkspaceReviews } from "@/products/google-listing/linked-reviews";
import { WorkspaceReviewsView } from "@/experience/places/WorkspaceReviews";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reviews", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** The workspace home of /dashboard/reviews (owner-entry spec §5). */
export default async function ReviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { workspaceId, actor } = await openWorkspacePlace(await searchParams, "/workspace/reviews");
  const state = await readPlace("reviews", workspaceId, () => readWorkspaceReviews(actor, workspaceId));
  return <WorkspaceReviewsView workspaceId={workspaceId} state={state} />;
}
