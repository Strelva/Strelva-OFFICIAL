import { googleListingAction } from "./actions";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { openWorkspacePlace } from "@/platform/owner-entry/place";
import { readPlace } from "@/platform/owner-entry/place-state";
import { publishingEnabledForWorkspace } from "@/products/publishing/server";
import { readWorkspaceGoogle } from "@/products/google-listing/server";
import { WorkspaceGoogle } from "@/experience/places/WorkspaceGoogle";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Google listing", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function GooglePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { workspaceId, actor } = await openWorkspacePlace(params, "/workspace/google");
  if (!(await publishingEnabledForWorkspace(workspaceId, actor))) redirect(`/workspace?workspaceId=${workspaceId}`);
  const state = await readPlace("google", workspaceId, () => readWorkspaceGoogle(actor, workspaceId));
  return <WorkspaceGoogle workspaceId={workspaceId} state={state} action={googleListingAction} reviewId={typeof params.reviewId === "string" ? params.reviewId : undefined} replyText={typeof params.replyText === "string" ? params.replyText : undefined} result={typeof params.result === "string" ? params.result : undefined} />;
}
