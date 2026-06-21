import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { listGuides, guidesByCategory } from "@/lib/guides";

export const metadata: Metadata = {
  title: "Website Guides - Strelva",
  description:
    "Plain-English guides for local businesses: fix your site speed, schema, AI visibility, security, and more. Or run a free audit and we will find the issues for you.",
  openGraph: {
    title: "Website Guides - Strelva",
    description:
      "Plain-English guides for local businesses on website speed, schema, AI visibility, security, and trust.",
    type: "website",
    siteName: "Strelva",
  },
};

export default function BlogIndexPage() {
  const groups = guidesByCategory();
  const total = listGuides().length;

  return (
    <>
      <section className="px-5 pt-[7rem] pb-12 md:px-8 md:pt-32 md:pb-16">
        <div className="mx-auto max-w-[1200px]">
          <h1
            className="font-semibold leading-[1.05] tracking-tight text-m-text"
            style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)" }}
          >
            Website guides
          </h1>
          <p className="mt-4 max-w-[560px] text-[16px] leading-relaxed text-m-text-2">
            Straight answers for local business owners: what is slowing your
            site, why search and AI tools cannot read it, and how to fix it. Not
            sure where to start?{" "}
            <Link href="/audit" className="text-m-text underline underline-offset-2 hover:text-m-text-2">
              Run a free audit
            </Link>{" "}
            and we will find the issues for you.
          </p>
        </div>
      </section>

      <section className="px-5 pb-24 md:px-8 md:pb-32">
        <div className="mx-auto max-w-[1200px]">
          {total === 0 ? (
            <p className="text-[15px] text-m-text-3">New guides are on the way.</p>
          ) : (
            <div className="grid gap-12">
              {groups.map((group) => (
                <div key={group.category}>
                  <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-[0.14em] text-m-text-3">
                    {group.category}
                  </h2>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {group.items.map((post) => (
                      <Link
                        key={post.slug}
                        href={`/guides/${post.slug}`}
                        className="group flex flex-col rounded-2xl border border-m-rule-soft bg-m-panel transition-colors hover:border-m-rule"
                      >
                        <div className="flex-1 p-6">
                          <div className="mb-3 flex items-center gap-3">
                            <span className="rounded-full border border-m-rule-soft bg-m-panel-strong px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-m-text-3">
                              {post.difficulty}
                            </span>
                            <span className="flex items-center gap-1 text-[12px] text-m-text-3">
                              <Clock className="size-3" />
                              {post.readingTime}
                            </span>
                          </div>
                          <h3 className="mb-2 text-[17px] font-semibold leading-snug text-m-text">
                            {post.title}
                          </h3>
                          <p className="text-[14px] leading-relaxed text-m-text-3">
                            {post.excerpt}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 border-t border-m-rule-soft px-6 py-3 text-[13px] font-medium text-m-accent">
                          Read guide
                          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="border-t border-m-rule-soft px-5 py-24 md:px-8 md:py-32">
        <div className="mx-auto max-w-[680px] text-center">
          <h2
            className="font-semibold leading-[1.05] tracking-tight text-m-text"
            style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)" }}
          >
            Rather we just handle it?
          </h2>
          <p className="mx-auto mt-4 max-w-[440px] text-[16px] leading-relaxed text-m-text-2">
            Strelva builds and manages local business websites, so the fixes in
            these guides happen for you, automatically.
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
