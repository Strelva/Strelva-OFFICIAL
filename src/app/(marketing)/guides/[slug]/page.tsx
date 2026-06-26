import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock } from "lucide-react";
import { getGuide, listGuides } from "@/lib/guides";

// Serialize JSON-LD safely: JSON.stringify escapes quotes but NOT `<`, so a
// `</script>` in the data would close the tag. Mirrors the escaper in
// (public)/layout.tsx. Guide data is team-authored today, so this is
// defense-in-depth — applied for parity in case a field ever becomes dynamic.
function jsonLd(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/;/g, "\\u003b");
}

export function generateStaticParams() {
  return listGuides().map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return { title: "Guide not found - Strelva" };
  const title = guide.seoTitle || `${guide.title} - Strelva`;
  const description = guide.seoDescription || guide.excerpt;
  return {
    title,
    description,
    alternates: { canonical: `/guides/${guide.slug}` },
    openGraph: { title, description, type: "article", siteName: "Strelva" },
  };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.excerpt,
    dateModified: guide.updatedAt,
    author: { "@type": "Organization", name: "Strelva" },
    publisher: { "@type": "Organization", name: "Strelva" },
    mainEntityOfPage: { "@type": "WebPage", "@id": `https://strelva.com/guides/${guide.slug}` },
  };

  const faqLd =
    guide.faq && guide.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: guide.faq.map((f) => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: { "@type": "Answer", text: f.answer },
          })),
        }
      : null;

  return (
    <article className="marketing-root min-h-dvh px-5 py-5 md:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(articleLd) }}
      />
      {faqLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(faqLd) }}
        />
      )}

      <div className="relative z-10 mx-auto max-w-[720px] pt-24 pb-16">
        <Link
          href="/guides"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-m-text-2 transition-colors hover:text-m-text"
        >
          <ArrowLeft className="size-4" />
          All guides
        </Link>

        <div className="mt-8 flex items-center gap-3 text-[12px] text-m-text-3">
          <span className="rounded-full border border-m-rule-soft bg-m-panel-strong px-2.5 py-0.5 font-semibold uppercase tracking-wider">
            {guide.category}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {guide.readingTime}
          </span>
        </div>

        <h1
          className="mt-4 font-semibold leading-[1.1] tracking-tight text-m-text"
          style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}
        >
          {guide.title}
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-m-text-2">{guide.excerpt}</p>

        {/* Inline audit CTA */}
        <div className="mt-8 rounded-2xl border border-m-accent bg-m-accent-faint p-5">
          <p className="text-[14px] leading-relaxed text-m-text">
            Not sure if this affects your site?{" "}
            <Link href="/audit" className="font-semibold text-m-accent underline underline-offset-2">
              Run a free audit
            </Link>{" "}
            and we will check this and dozens of other signals in seconds.
          </p>
        </div>

        {/* Body */}
        <div
          className="guide-body mt-10 text-[16px] leading-[1.75] text-m-text-2"
          dangerouslySetInnerHTML={{ __html: guide.bodyHtml }}
        />

        {/* FAQ */}
        {guide.faq && guide.faq.length > 0 && (
          <div className="mt-12 border-t border-m-rule-soft pt-8">
            <h2 className="text-[20px] font-semibold text-m-text">Frequently asked</h2>
            <div className="mt-4 grid gap-5">
              {guide.faq.map((f) => (
                <div key={f.question}>
                  <h3 className="text-[15px] font-semibold text-m-text">{f.question}</h3>
                  <p className="mt-1 text-[15px] leading-relaxed text-m-text-2">{f.answer}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer CTA */}
        <div className="mt-14 rounded-2xl border border-m-rule-soft bg-m-panel p-6 text-center sm:p-8">
          <h2 className="text-[20px] font-semibold text-m-text sm:text-[24px]">
            Rather we just handle it?
          </h2>
          <p className="mx-auto mt-3 max-w-[440px] text-[15px] leading-relaxed text-m-text-2">
            Strelva builds and manages local business websites, so fixes like
            this happen for you, automatically.
          </p>
          <Link href="/access-request" className="marketing-button-primary mt-6 inline-flex">
            Request your build
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}
