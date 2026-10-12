import { googleListingAction } from "./actions";
import { chooseGoogleListing, decideGoogleFoundFact, rereadGoogleFoundFacts, startGoogleConnect } from "./connect-actions";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { openWorkspacePlace } from "@/platform/owner-entry/place";
import { readPlace } from "@/platform/owner-entry/place-state";
import { readBusinessRecord } from "@/platform/business-record/service";
import { publishingEnabledForWorkspace } from "@/products/publishing/server";
import { readWorkspaceGoogle } from "@/products/google-listing/server";
import { GOOGLE_DISCOVER_CHOICES_COOKIE, ownerConnectAvailable, readDiscoveryChoices, readFoundFacts } from "@/products/google-listing/connect";
import { WorkspaceGoogle } from "@/experience/places/WorkspaceGoogle";
import { GoogleConnect, type GoogleConnectViewer } from "@/experience/places/GoogleConnect";
import { readWorkspaceReviews } from "@/products/google-listing/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Google listing", robots: { index: false, follow: false }, referrer: "no-referrer" };
const one = (value: string | string[] | undefined) => typeof value === "string" ? value.slice(0, 40) : undefined;
export default async function GooglePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { workspaceId, actor } = await openWorkspacePlace(params, "/workspace/google");
  if (!(await publishingEnabledForWorkspace(workspaceId, actor))) redirect(`/workspace?workspaceId=${workspaceId}`);
  const state = await readPlace("google", workspaceId, () => readWorkspaceGoogle(actor, workspaceId));
  // Each read retains its existing membership/tenant boundary. Review failure
  // does not hide the listing's drafts or receipts; refused listings never read reviews.
  const reviews = state.kind === "ready" ? await readPlace("reviews", workspaceId, async () => (await readWorkspaceReviews(actor, workspaceId)).sites) : undefined;
  // Connect Google (STRELVA_GOOGLE_OWNER_CONNECT). Any failure here leaves the listing page as it was.
  const enabled = await ownerConnectAvailable(actor, workspaceId).catch(() => false);
  const access = await readBusinessRecord(actor, workspaceId).then(record => record.access).catch(() => null);
  const viewer: GoogleConnectViewer = access === "owner" ? "owner" : access === "agency" ? "agency" : "member";
  const choices = enabled && viewer === "owner" ? readDiscoveryChoices(actor, workspaceId, (await cookies()).get(GOOGLE_DISCOVER_CHOICES_COOKIE)?.value) : null;
  const foundFacts = enabled ? await readFoundFacts(actor, workspaceId).catch(() => []) : [];
  const connect = <GoogleConnect workspaceId={workspaceId} viewer={viewer} enabled={enabled} hasListing={state.kind === "ready" && state.data.length > 0}
    params={{ connect: one(params.connect), read: one(params.read), fact: one(params.fact) }} choices={choices} foundFacts={foundFacts}
    actions={{ start: startGoogleConnect, choose: chooseGoogleListing, reread: rereadGoogleFoundFacts, decide: decideGoogleFoundFact }} />;
  return <WorkspaceGoogle workspaceId={workspaceId} state={state} reviews={reviews} action={googleListingAction} connect={connect} reviewId={typeof params.reviewId === "string" ? params.reviewId : undefined} replyText={typeof params.replyText === "string" ? params.replyText : undefined} result={typeof params.result === "string" ? params.result : undefined} />;
}
