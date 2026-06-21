import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";

export const metadata: Metadata = {
  title: "Blog - Strelva",
  description:
    "Tips, guides, and insights on AI website management, local SEO, and growing your business online.",
  openGraph: {
    title: "Blog - Strelva",
    description:
      "Tips, guides, and insights on AI website management, local SEO, and growing your business online.",
    type: "website",
    siteName: "Strelva",
  },
};

export default function BlogPage() {
  return (
    <>
      <section className="px-5 pt-[7rem] pb-12 md:px-8 md:pt-32 md:pb-16">
        <div className="mx-auto max-w-[1200px]">
          <h1
            className="font-semibold leading-[1.05] tracking-tight text-m-text"
            style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)" }}
          >
            Blog
          </h1>
          <p className="mt-4 max-w-[480px] text-[16px] leading-relaxed text-m-text-2">
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
                className="flex flex-col rounded-2xl border border-m-rule-soft bg-m-panel"
              >
                <div className="flex-1 p-6">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="rounded-full border border-m-rule-soft bg-m-panel-strong px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-m-text-3">
                      {post.category}
                    </span>
                    <span className="flex items-center gap-1 text-[12px] text-m-text-3">
                      <Clock className="size-3" />
                      {post.readTime}
                    </span>
                  </div>
                  <h2 className="mb-2 text-[17px] font-semibold leading-snug text-m-text">
                    {post.title}
                  </h2>
                  <p className="text-[14px] leading-relaxed text-m-text-3">
                    {post.excerpt}
                  </p>
                </div>
                <div className="border-t border-m-rule-soft px-6 py-3">
                  <span className="text-[13px] font-medium text-m-accent">
                    Coming soon
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-m-rule-soft px-5 py-24 md:px-8 md:py-32">
        <div className="mx-auto max-w-[680px] text-center">
          <h2
            className="font-semibold leading-[1.05] tracking-tight text-m-text"
            style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)" }}
          >
            Ready to stop managing your website?
          </h2>
          <p className="mx-auto mt-4 max-w-[440px] text-[16px] leading-relaxed text-m-text-2">
            Let AI handle the updates while you run your business.
          </p>
          <Link href="/access-request" className="marketing-button-primary mt-6 inline-flex">
            Request your build
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
