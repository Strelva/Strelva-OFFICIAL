import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsVisitorFrame } from "@/experience/workspace/preview/XsVisitorFrame";
import { SiteBlogPost } from "@/components/public/SiteBlog";
import { harborPosts } from "@/experience/workspace/preview/xs-visitor-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Blog post preview", robots: { index: false, follow: false } };

/** /blog/[slug] as the real SiteBlogPost renders it. */
export default async function Page() {
  if (!strelvaUiPreviewEnabled()) notFound();
  return <XsVisitorFrame><SiteBlogPost post={harborPosts[1]!} /></XsVisitorFrame>;
}
