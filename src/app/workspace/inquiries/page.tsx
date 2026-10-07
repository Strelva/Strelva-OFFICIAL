import type { Metadata } from "next";
import { openWorkspacePlace } from "@/platform/owner-entry/place";
import { readPlace } from "@/platform/owner-entry/place-state";
import { readWorkspaceInquiryInbox } from "@/products/inquiries/workspace-inbox";
import { z } from "zod";
import { WorkspaceInquiries } from "@/experience/places/WorkspaceInquiries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inquiries", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** The workspace home of /dashboard/leads (owner-entry spec §5). */
export default async function InquiriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { workspaceId, actor } = await openWorkspacePlace(params, "/workspace/inquiries");
  const cursor = z.object({ before: z.iso.datetime({ offset: true }), beforeId: z.string().uuid() }).safeParse(params);
  const state = await readPlace("inquiries", workspaceId, () => readWorkspaceInquiryInbox(actor, workspaceId, cursor.success ? cursor.data : undefined));
  return <WorkspaceInquiries workspaceId={workspaceId} state={state} />;
}
