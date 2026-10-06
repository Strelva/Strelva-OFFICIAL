import type { Metadata } from "next";
import { openWorkspacePlace } from "@/platform/owner-entry/place";
import { readPlace } from "@/platform/owner-entry/place-state";
import { readWorkspaceLeads } from "@/products/inquiries/linked-leads";
import { WorkspaceInquiries } from "@/experience/places/WorkspaceInquiries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inquiries", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** The workspace home of /dashboard/leads (owner-entry spec §5). */
export default async function InquiriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { workspaceId, actor } = await openWorkspacePlace(await searchParams, "/workspace/inquiries");
  const state = await readPlace("inquiries", workspaceId, () => readWorkspaceLeads(actor, workspaceId));
  return <WorkspaceInquiries workspaceId={workspaceId} state={state} />;
}
