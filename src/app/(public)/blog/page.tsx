import type { Metadata } from "next";
import Link from "next/link";
import { getBlogPosts } from "@/lib/blog";
import { getContent } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { PageViewTracker } from "@/components/public/PageViewTracker";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
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
  const tenant = await getTenantFromHeaders();
  const posts = await getBlogPosts(tenant, { status: "published" });
  const settings = await getContent("settings", tenant);

  if (posts.length === 0) {
    return (
      <>
        <PageViewTracker />
        <main className="min-h-[60vh] flex items-center justify-center px-6">
          <div className="text-center max-w-md">
            <h1 className="text-3xl font-semibold mb-4" style={{ color: "var(--color-heading, #2d3a2e)" }}>
              Blog
            </h1>
            <p className="text-lg" style={{ color: "var(--color-body, #5a6b5c)" }}>
              No posts yet. Check back soon for updates from {settings.siteName}.
            </p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <PageViewTracker />
      <main className="max-w-3xl mx-auto px-6 py-20">
        <h1 className="text-4xl font-semibold mb-12" style={{ color: "var(--color-heading, #2d3a2e)" }}>
          Blog
        </h1>
        <div className="space-y-12">
          {posts.map((post) => (
            <article key={post.id}>
              <Link href={`/blog/${post.slug}`} className="group block">
                <time
                  dateTime={post.publishedAt}
                  className="text-sm uppercase tracking-wider"
                  style={{ color: "var(--color-muted, #8a9b8c)" }}
                >
                  {new Date(post.publishedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>
                <h2
                  className="text-2xl font-semibold mt-1 mb-2 group-hover:opacity-70 transition-opacity"
                  style={{ color: "var(--color-heading, #2d3a2e)" }}
                >
                  {post.title}
                </h2>
                <p style={{ color: "var(--color-body, #5a6b5c)" }}>
                  {post.excerpt}
                </p>
                {post.tags.length > 0 && (
                  <div className="flex gap-2 mt-3">
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
              </Link>
            </article>
          ))}
        </div>
      </main>
    </>
  );
}
