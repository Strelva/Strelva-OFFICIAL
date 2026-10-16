import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsVisitorFrame } from "@/experience/workspace/preview/XsVisitorFrame";
import { SiteRenderer } from "@/products/websites/SiteRenderer";
import { harborSite } from "@/experience/workspace/preview/xs-visitor-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Native website preview", robots: { index: false, follow: false } };

/** The real native renderer (/sites/[tenant]/..., tenant host home and pages) with the Harbor Dental document. ?page=/|/about */
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { page } = await searchParams;
  return <XsVisitorFrame><SiteRenderer document={harborSite} path={page === "/about" ? "/about" : "/"} preview /></XsVisitorFrame>;
}
