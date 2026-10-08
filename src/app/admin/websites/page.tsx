import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Website work", robots: { index: false, follow: false } };
/** Retained operator bookmark, with no serving authority of its own. */
export default async function WebsiteRebuildsPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string; workId?: string }> }) {
  const query = await searchParams;
  const workspace = z.string().uuid().safeParse(query.workspaceId);
  const work = query.workId === undefined ? null : z.string().uuid().safeParse(query.workId);
  if (workspace.success && (!work || work.success)) redirect(`/workspace/site?${new URLSearchParams({ workspaceId: workspace.data, entry: "rebuild", ...(work?.success ? { workId: work.data } : {}) })}`);
  return <div className="p-6"><p>Website work uses the business or its agency’s ordinary permissions. Existing saved drafts remain available there.</p><Link href="/workspace">Choose a business or agency workspace</Link></div>;
}
