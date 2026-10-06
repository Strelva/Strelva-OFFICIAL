import type { MetadataRoute } from "next";
import { MARKETING_URL } from "@/platform/infra/brand";
import { getHostedSite } from "@/products/websites/index";

export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const hosted = await getHostedSite();
  if (hosted) {
    if (hosted.preview) return [];
    return hosted.document.pages.map(page => ({ url: new URL(page.path, hosted.origin).toString(), changeFrequency: page.path === "/" ? "weekly" : "monthly", priority: page.path === "/" ? 1 : .8 }));
  }
  const base = process.env.NEXT_PUBLIC_SITE_URL || MARKETING_URL;

  // Only list routes that actually RENDER. /services, /events, /providers,
  // /faq and /shop currently redirect (to / or /about), so advertising them
  // wastes crawl budget and triggers "Page with redirect" warnings in the
  // client's Search Console. Keep the canonical, non-redirecting pages.
  return [
    { url: base, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${base}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/contact`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/links`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.4 },
  ];
}
