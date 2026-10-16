import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsVisitorFrame } from "@/experience/workspace/preview/XsVisitorFrame";
import { SiteRenderer } from "@/products/websites/SiteRenderer";
import { harborSite } from "@/experience/workspace/preview/xs-visitor-fixture";
import { siteDocumentSchema, type SiteDocument } from "@/products/websites/client";
import mooneySource from "@/experience/websites/fixtures/mooney-site-2026-10-01.json";

export const dynamic = "force-dynamic";
export const metadata = { title: "Native website preview", robots: { index: false, follow: false } };

/**
 * The real native renderer (/sites/[tenant]/..., tenant host home and pages).
 * ?page=/|/about renders the fictional Harbor Dental document. ?doc=mooney
 * renders The Mooney Firm's committed site document (a real tenant's rebuild,
 * Oct 1) so a catalog CSS change is seen on a real tenant before merge.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string; doc?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { page, doc } = await searchParams;
  if (doc === "mooney") {
    const mooney: SiteDocument = siteDocumentSchema.parse(mooneySource);
    const path = mooney.pages.some(item => item.path === page) ? page! : "/";
    return <XsVisitorFrame><SiteRenderer document={mooney} path={path} preview /></XsVisitorFrame>;
  }
  return <XsVisitorFrame><SiteRenderer document={harborSite} path={page === "/about" ? "/about" : "/"} preview /></XsVisitorFrame>;
}
