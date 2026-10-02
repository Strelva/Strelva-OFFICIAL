import type { MetadataRoute } from "next";
import { MARKETING_URL } from "@/lib/brand";
import { getHostedSite } from "@/products/websites/index";

export const dynamic = "force-dynamic";
export default async function robots(): Promise<MetadataRoute.Robots> {
  const hosted = await getHostedSite();
  if (hosted) return hosted.preview ? { rules: { userAgent: "*", disallow: "/" } } : { rules: { userAgent: "*", allow: "/", disallow: ["/dashboard/", "/api/", "/workspace/", "/preview/", "/admin/"] }, sitemap: `${hosted.origin}/sitemap.xml` };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard/", "/api/"],
    },
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL || MARKETING_URL}/sitemap.xml`,
  };
}
