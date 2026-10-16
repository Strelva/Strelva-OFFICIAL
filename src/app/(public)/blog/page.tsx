import { hostedPageMetadata, renderHostedPage } from "@/products/websites/index";
import type { Metadata } from "next";
import { SiteBlogIndex } from "@/components/public/SiteBlog";
import { getBlogPostsForSite } from "@/lib/cms/blog-public";
import { getContent } from "@/lib/storage";
import { getTenantFromHeaders, isPreviewMode } from "@/lib/tenant";
import { PageViewTracker } from "@/components/public/PageViewTracker";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const hosted = await hostedPageMetadata("/blog");
  if (hosted) return hosted;
  const tenant = await getTenantFromHeaders();
  const settings = await getContent("settings", tenant);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  return {
    title: `Blog | ${settings.siteName}`,
    description: `Latest posts from ${settings.siteName}`,
    alternates: { canonical: `${siteUrl}/blog` },
    openGraph: {
      title: `Blog | ${settings.siteName}`,
      description: `Latest posts from ${settings.siteName}`,
      type: "website",
      url: `${siteUrl}/blog`,
    },
  };
}

export default async function BlogPage() {
  const hosted = await renderHostedPage("/blog");
  if (hosted) return hosted;
  const tenant = await getTenantFromHeaders();
  const preview = await isPreviewMode();
  // In preview mode, show all posts including drafts; in production, only published
  const posts = await getBlogPostsForSite(tenant, preview ? {} : { status: "published" });
  const settings = await getContent("settings", tenant, preview ? { preview: true } : undefined);

  return (
    <>
      <PageViewTracker />
      <SiteBlogIndex siteName={settings.siteName} posts={posts} />
    </>
  );
}
