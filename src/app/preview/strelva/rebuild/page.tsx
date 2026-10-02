import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { RebuildFixture } from "@/experience/websites/RebuildFixture";
import { AgencyDocumentFixture } from "@/experience/agency-website/AgencyDocumentFixture";
import { agencyDocumentFixture } from "@/experience/agency-website/agency-document-fixture";
import { renderSiteDocumentHtml, siteDocumentHash } from "@/products/websites/index";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Website rebuild interface fixture", robots: { index: false, follow: false } };
export default async function RebuildPreview({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const params = await searchParams;
  if (params.scenario?.startsWith("agency-")) {
    const initial = agencyDocumentFixture(params.scenario);
    const candidate = initial.website!.rebuild.candidate!;
    candidate.contentHash = siteDocumentHash(candidate.document);
    initial.previewHtml = renderSiteDocumentHtml(candidate.document,"/",{preview:true});
    initial.previewPages = Object.fromEntries(candidate.document.pages.map(page => [page.path,renderSiteDocumentHtml(candidate.document,page.path,{preview:true})]));
    return <div data-dashboard className="min-h-screen bg-surface-base"><AgencyDocumentFixture scenario={params.scenario} initial={initial} /></div>;
  }
  return <div data-dashboard className="min-h-screen bg-surface-base"><RebuildFixture scenario={params.scenario ?? "review"} /></div>;
}
