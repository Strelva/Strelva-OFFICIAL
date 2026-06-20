/**
 * Drop-in blog rendering theme for a Strelva client repo (Collections CMS).
 *
 * A server component that fetches the published `blog` collection from the v1
 * contract and renders a simple post list. This is the per-client "theme" layer:
 * copy it into a client repo and restyle to match the site. The control plane
 * owns the content; the repo owns the look. Promote a theme to the platform only
 * once two repos need the same one (the starter-first rule).
 *
 * Usage (in a client repo, e.g. app/blog/page.tsx):
 *   import { BlogSection } from "@/scaffold/BlogSection";
 *   export default function BlogPage() { return <BlogSection />; }
 */
import { fetchScaffoldCollection } from "./scaffold-client";

interface BlogPostData {
  title?: string;
  excerpt?: string;
  body?: string;
  author?: string;
  tags?: string[];
  coverImage?: string;
}

export async function BlogSection({ preview = false }: { preview?: boolean }) {
  const posts = await fetchScaffoldCollection<BlogPostData>("blog", { preview });

  if (posts.length === 0) {
    return null;
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-12">
      <h2 className="mb-8 text-2xl font-semibold">From the blog</h2>
      <ul className="space-y-8">
        {posts.map((post) => (
          <li key={post.slug}>
            <a href={`/blog/${post.slug}`} className="group block">
              <h3 className="text-lg font-medium group-hover:underline">
                {post.data.title || post.slug}
              </h3>
              {post.data.excerpt && (
                <p className="mt-1 text-sm text-neutral-600">{post.data.excerpt}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-neutral-500">
                {post.data.author && <span>{post.data.author}</span>}
                {(post.data.tags ?? []).map((tag) => (
                  <span key={tag} className="rounded-full bg-neutral-100 px-2 py-0.5">
                    {tag}
                  </span>
                ))}
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
