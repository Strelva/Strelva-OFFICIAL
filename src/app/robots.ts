import type { MetadataRoute } from "next";
import { MARKETING_URL } from "@/platform/infra/brand";
import { getHostedSite } from "@/products/websites/index";

export const dynamic = "force-dynamic";

/**
 * On a hosted (v2) site, agent contracts AI crawlers may read even though
 * `/api/` is closed: the longer Allow wins over `/api/` (RFC 9309 longest
 * match). The flags-off branch stays byte-identical to the v1 baseline
 * (website-tenant-metadata-routes test); public business pages
 * (`/biz/{handle}`, its llms.txt) are outside `/api/` and already open there.
 */
const AGENT_CONTRACTS = ["/api/v1/*/openapi.json", "/api/mcp/public", "/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server"];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const hosted = await getHostedSite();
  if (hosted) return hosted.preview ? { rules: { userAgent: "*", disallow: "/" } } : { rules: { userAgent: "*", allow: ["/", ...AGENT_CONTRACTS], disallow: ["/dashboard/", "/api/", "/workspace/", "/preview/", "/admin/"] }, sitemap: `${hosted.origin}/sitemap.xml` };
  return {
    rules: {
      userAgent: "*",
      allow: process.env.STRELVA_AGENT_READABLE === "1" && process.env.STRELVA_WORKSPACE_RELEASE === "1" ? ["/", ...AGENT_CONTRACTS] : "/",
      disallow: ["/dashboard/", "/api/"],
    },
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL || MARKETING_URL}/sitemap.xml`,
  };
}
