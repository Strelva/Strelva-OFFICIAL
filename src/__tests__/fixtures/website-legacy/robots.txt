import type { MetadataRoute } from "next";
import { MARKETING_URL } from "@/lib/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard/", "/api/"],
    },
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL || MARKETING_URL}/sitemap.xml`,
  };
}
