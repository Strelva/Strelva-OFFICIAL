import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBlogPost } from "@/lib/blog";
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
  const tenant = await getTenantFromHeaders();
  const post = await getBlogPost(tenant, slug).catch(() => null);
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
  const tenant = await getTenantFromHeaders();
  const preview = await isPreviewMode();
  // In preview mode, allow viewing draft posts. A transient backend error must
  // become a clean 404 (via notFound below), not a 500 that bypasses it.
  const post = await getBlogPost(tenant, slug, preview ? { includeDrafts: true } : undefined).catch(
    () => null
  );

  if (!post) notFound();

  const paragraphs = post.content.split("\n\n").filter(Boolean);

  return (
    <>
      <PageViewTracker />
      <main className="max-w-2xl mx-auto px-6 py-20">
        <Link
          href="/blog"
          className="text-sm uppercase tracking-wider hover:opacity-70 transition-opacity"
          style={{ color: "var(--color-muted, #8a9b8c)" }}
        >
          &larr; Back to Blog
        </Link>

        <article className="mt-8">
          <header className="mb-10">
            <h1
              className="text-4xl font-semibold mb-4"
              style={{ color: "var(--color-heading, #2d3a2e)" }}
            >
              {post.title}
            </h1>
            <div className="flex items-center gap-3 text-sm" style={{ color: "var(--color-muted, #8a9b8c)" }}>
              <span>{post.author}</span>
              <span>&middot;</span>
              <time dateTime={post.publishedAt}>
                {new Date(post.publishedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
            </div>
            {post.tags.length > 0 && (
              <div className="flex gap-2 mt-4">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-1 rounded-full"
                    style={{
                      backgroundColor: "var(--color-accent-bg, #e8ede4)",
                      color: "var(--color-accent, #5a6b5c)",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </header>

          <div className="space-y-5" style={{ color: "var(--color-body, #5a6b5c)" }}>
            {paragraphs.map((p, i) => (
              <p key={i} className="text-lg leading-relaxed">
                {p}
              </p>
            ))}
          </div>
        </article>
      </main>
    </>
  );
}
