import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";

export const metadata: Metadata = {
  title: "Blog - Scaffold Web",
  description:
    "Tips, guides, and insights on AI website management, local SEO, and growing your business online.",
  openGraph: {
    title: "Blog - Scaffold Web",
    description:
      "Tips, guides, and insights on AI website management, local SEO, and growing your business online.",
    type: "website",
    siteName: "Scaffold Web",
  },
};

export default function BlogPage() {
  return (
    <>
      <section className="px-5 pt-[7rem] pb-12 md:px-8 md:pt-32 md:pb-16">
        <div className="mx-auto max-w-[1200px]">
          <h1
            className="font-semibold leading-[1.05] tracking-tight text-[color:var(--m-text)]"
            style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)" }}
          >
            Blog
          </h1>
          <p className="mt-4 max-w-[480px] text-[16px] leading-relaxed text-[color:var(--m-text-2)]">
            Practical guides for local businesses on website management, local
            SEO, and getting found online.
          </p>
        </div>
      </section>

      <section className="px-5 pb-24 md:px-8 md:pb-32">
        <div className="mx-auto max-w-[1200px]">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {BLOG_POSTS.map((post) => (
              <article
                key={post.slug}
                className="flex flex-col rounded-2xl border border-[var(--m-rule-soft)] bg-[var(--m-panel)]"
              >
                <div className="flex-1 p-6">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="rounded-full border border-[var(--m-rule-soft)] bg-[var(--m-panel-strong)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--m-text-3)]">
                      {post.category}
                    </span>
                    <span className="flex items-center gap-1 text-[12px] text-[color:var(--m-text-3)]">
                      <Clock className="size-3" />
                      {post.readTime}
                    </span>
                  </div>
                  <h2 className="mb-2 text-[17px] font-semibold leading-snug text-[color:var(--m-text)]">
                    {post.title}
                  </h2>
                  <p className="text-[14px] leading-relaxed text-[color:var(--m-text-3)]">
                    {post.excerpt}
                  </p>
                </div>
                <div className="border-t border-[var(--m-rule-soft)] px-6 py-3">
                  <span className="text-[13px] font-medium text-[color:var(--m-accent)]">
                    Coming soon
                  </span>
                </div>
              </article>
            ))}
          </div>

          {/* Newsletter */}
          <div className="mt-16 rounded-2xl border border-[var(--m-rule-soft)] bg-[var(--m-panel)] p-8 text-center md:p-12">
            <h2
              className="font-semibold leading-[1.1] text-[color:var(--m-text)]"
              style={{ fontSize: "clamp(1.5rem, 3vw, 2.25rem)" }}
            >
              Get articles delivered
            </h2>
            <p className="mx-auto mt-3 max-w-[420px] text-[15px] leading-relaxed text-[color:var(--m-text-2)]">
              One email per week with practical tips for your business website.
              No spam.
            </p>
            <div className="mx-auto mt-6 flex max-w-[420px] gap-2">
              <input
                type="email"
                placeholder="you@business.com"
                disabled
                aria-label="Email address for blog subscription"
                className="h-11 flex-1 rounded-xl border border-[var(--m-rule-soft)] bg-[var(--m-panel-strong)] px-4 text-[14px] text-[color:var(--m-text-3)] opacity-50"
              />
              <button
                disabled
                className="marketing-button-primary h-11 opacity-50"
              >
                Subscribe
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-[var(--m-rule-soft)] px-5 py-24 md:px-8 md:py-32">
        <div className="mx-auto max-w-[680px] text-center">
          <h2
            className="font-semibold leading-[1.05] tracking-tight text-[color:var(--m-text)]"
            style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)" }}
          >
            Ready to stop managing your website?
          </h2>
          <p className="mx-auto mt-4 max-w-[440px] text-[16px] leading-relaxed text-[color:var(--m-text-2)]">
            Let AI handle the updates while you run your business.
          </p>
          <Link href="/pricing" className="marketing-button-primary mt-6 inline-flex">
            View plans
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
    </>
  );
}

const BLOG_POSTS = [
  {
    slug: "why-local-businesses-need-ai-website-management",
    title: "Why Local Businesses Need AI Website Management",
    excerpt:
      "Most local business websites are outdated within 3 months. Here's why AI-managed sites stay current and how it impacts your bottom line.",
    category: "AI",
    readTime: "5 min",
  },
  {
    slug: "google-business-profile-checklist",
    title: "The Complete Google Business Profile Checklist",
    excerpt:
      "Your GBP listing is often the first thing customers see. Here's every field you should fill out and why each one matters for local search.",
    category: "Local SEO",
    readTime: "8 min",
  },
  {
    slug: "site-speed-matters-for-local-businesses",
    title: "Site Speed: Why It Matters More Than You Think",
    excerpt:
      "A 1-second delay reduces conversions by 7%. For local businesses competing on Google, speed is the difference between first page and invisible.",
    category: "Performance",
    readTime: "4 min",
  },
  {
    slug: "what-is-structured-data-local-business",
    title: "What Is Structured Data? A Plain-English Guide",
    excerpt:
      "Schema markup tells Google exactly what your business does. Without it, you're leaving rich snippets and local pack features on the table.",
    category: "SEO",
    readTime: "6 min",
  },
  {
    slug: "weekly-reports-prove-website-value",
    title: "How Weekly Reports Prove Your Website Is Working",
    excerpt:
      "The #1 reason business owners stop paying for websites: they can't see the value. Automated reports solve this before the first invoice recurs.",
    category: "Strategy",
    readTime: "5 min",
  },
  {
    slug: "diy-vs-managed-website-cost-comparison",
    title: "DIY vs. Managed: The Real Cost of Running a Website",
    excerpt:
      "Squarespace costs $16/mo but 5 hours of your time. An agency costs $400/mo. Here's where AI-managed sites fit in the equation.",
    category: "Comparison",
    readTime: "7 min",
  },
];
