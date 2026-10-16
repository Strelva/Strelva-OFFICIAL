import { hostedPageMetadata, renderHostedPage } from "@/products/websites/index";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteBlogPost } from "@/components/public/SiteBlog";
import { getBlogPostForSite } from "@/lib/cms/blog-public";
import { getContent } from "@/lib/storage";
import { defaults } from "@/lib/defaults";
import { getTenantFromHeaders, isPreviewMode } from "@/lib/tenant";
import { PageViewTracker } from "@/components/public/PageViewTracker";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const hosted = await hostedPageMetadata(`/blog/${slug}`);
  if (hosted) return hosted;
  const tenant = await getTenantFromHeaders();
  const post = await getBlogPostForSite(tenant, slug).catch(() => null);
  const settings = await getContent("settings", tenant).catch(() => defaults.settings);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";

  if (!post) {
    return { title: `Not Found | ${settings.siteName}` };
  }

  return {
    title: `${post.title} | ${settings.siteName}`,
    description: post.excerpt,
    alternates: { canonical: `${siteUrl}/blog/${slug}` },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.publishedAt,
      authors: [post.author],
      url: `${siteUrl}/blog/${slug}`,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const hosted = await renderHostedPage(`/blog/${slug}`);
  if (hosted) return hosted;
  const tenant = await getTenantFromHeaders();
  const preview = await isPreviewMode();
  // In preview mode, allow viewing draft posts. A transient backend error must
  // become a clean 404 (via notFound below), not a 500 that bypasses it.
  const post = await getBlogPostForSite(tenant, slug, preview ? { includeDrafts: true } : undefined).catch(
    () => null
  );

  if (!post) notFound();

  return (
    <>
      <PageViewTracker />
      <SiteBlogPost post={post} />
    </>
  );
}
