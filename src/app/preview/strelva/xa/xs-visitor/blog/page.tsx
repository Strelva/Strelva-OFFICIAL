import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsVisitorFrame } from "@/experience/workspace/preview/XsVisitorFrame";
import { SiteBlogIndex } from "@/components/public/SiteBlog";
import { harborPosts } from "@/experience/workspace/preview/xs-visitor-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Blog preview", robots: { index: false, follow: false } };

/** /blog as the real SiteBlogIndex renders it. ?state=ready|empty */
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state } = await searchParams;
  return <XsVisitorFrame><SiteBlogIndex siteName="Harbor Dental" posts={state === "empty" ? [] : harborPosts} /></XsVisitorFrame>;
}
