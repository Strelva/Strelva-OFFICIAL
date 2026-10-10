/**
 * The public business page (#309): a business's confirmed facts, rendered on
 * the server with its schema.org JSON-LD in the HTML, so AI crawlers that
 * never run JavaScript read the same answer people do. Kit presentation is
 * server-rendered; business facts remain in the initial HTML.
 *
 * App host only (a client site's host answers 404, so no business's page
 * appears under another's domain). Off unless STRELVA_BUSINESS_PAGES=1, the
 * connected sites release and the business's row are on, and the page is
 * published. Ported from feat/connected-sites `/b/{handle}`.
 */
import { PublicBusinessProfile } from "@/experience/product/assistants/PublicBusinessProfile";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { businessJsonLd } from "@/products/connected-sites/contracts";
import { appOrigin, businessPageUrl, jsonLdScriptContent, loadPublishedBusinessPage } from "@/products/connected-sites/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ handle: string }> };

const load = cache(async (handle: string) => {
  // The proxy sets x-tenant only on a client site's host and strips it elsewhere.
  if ((await headers()).get("x-tenant")) return null;
  try {
    return await loadPublishedBusinessPage(handle);
  } catch (error) {
    console.error("[biz page] read failed", error instanceof Error ? error.message : error);
    return null;
  }
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = await load((await params).handle);
  if (!page) return { title: "Page not found", robots: { index: false, follow: false } };
  const { facts } = page;
  const place = facts.address?.locality ? ` in ${[facts.address.locality, facts.address.region].filter(Boolean).join(", ")}` : "";
  const title = `${facts.name}${place}`;
  const description = facts.description?.slice(0, 200) ?? `${facts.name}: hours, contact details and services.`;
  const url = businessPageUrl(appOrigin(), page.handle);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { title, description, url, type: "website", siteName: facts.name },
  };
}

export default async function BusinessPage({ params }: Params) {
  const page = await load((await params).handle);
  if (!page) notFound();
  const url = businessPageUrl(appOrigin(), page.handle);
  const ld = businessJsonLd(page.facts, url);
  return <>
    {ld ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(ld) }} /> : null}
    <PublicBusinessProfile facts={page.facts} confirmedAt={page.confirmedAt} pageUrl={url} />
  </>;
}
