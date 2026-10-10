import { notFound } from "next/navigation";
import { getPathHostedSite, renderPathHostedPage, safeJsonLd, siteDocumentJsonLd, siteDocumentMetadata } from "@/products/websites/index";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ tenant: string; sitePath?: string[] }> };

export async function generateMetadata({ params }: Props) {
  const { tenant, sitePath = [] } = await params;
  const site = await getPathHostedSite(tenant);
  return site ? siteDocumentMetadata(site.document, `/${sitePath.join("/")}`, site.origin) : { robots: { index: false, follow: false } };
}

export default async function HostedPathPage({ params }: Props) {
  const { tenant, sitePath = [] } = await params;
  const site = await getPathHostedSite(tenant);
  if (!site) notFound();
  const path = `/${sitePath.join("/")}`;
  return <>
    <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[200]">Skip to content</a>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(siteDocumentJsonLd(site.document, site.origin, site.config?.industry)) }} />
    <main id="main-content">{await renderPathHostedPage(tenant, path)}</main>
  </>;
}
