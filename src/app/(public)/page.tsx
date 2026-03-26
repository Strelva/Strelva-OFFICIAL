import Link from "next/link";
import { getContent } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { Hero } from "@/components/public/Hero";
import { PageViewTracker } from "@/components/public/PageViewTracker";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tenant = await getTenantFromHeaders();
  const settings = await getContent("settings", tenant);
  return {
    title: settings.siteName,
    description: settings.siteDescription,
  };
}

export default async function Home() {
  const tenant = await getTenantFromHeaders();
  const [hero, testimonials, contact, settings] =
    await Promise.all([
      getContent("hero", tenant),
      getContent("testimonials", tenant),
      getContent("contact", tenant),
      getContent("settings", tenant),
    ]);

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:text-sm" style={{ background: "var(--sage)", color: "var(--cream)" }}>
        Skip to content
      </a>
      <PageViewTracker />
      <main id="main">
        <Hero hero={hero} ownerName={settings.ownerName} />

        {/* Trust strip */}
        <div
          className="py-5 md:py-6"
          style={{ background: "var(--cream-dark)", borderBottom: "1px solid var(--cream-mid)" }}
        >
          <div className="container-main">
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-2 text-[0.625rem] font-medium tracking-[0.15em] uppercase" style={{ color: "var(--bark-faded)" }}>
              <span>{settings.ownerTitle || "Wellness Professional"}</span>
              <span style={{ color: "var(--cream-mid)" }}>|</span>
              <span>1-on-1 Sessions</span>
              <span style={{ color: "var(--cream-mid)" }}>|</span>
              <span>{contact.address ? contact.address.split(",").slice(-2).join(",").trim() : "Virtual Available"}</span>
            </div>
          </div>
        </div>

        {/* Inline testimonial quote */}
        {testimonials.testimonials.length > 0 && (
          <section className="py-14 md:py-20" style={{ background: "var(--cream)" }}>
            <div className="container-main text-center">
              <p
                className="font-display text-[clamp(1.5rem,3.5vw,2.5rem)] leading-[1.2] tracking-tight max-w-3xl mx-auto"
                style={{ color: "var(--bark)" }}
              >
                &ldquo;{testimonials.testimonials[0].quote}&rdquo;
              </p>
              {testimonials.testimonials[0].author && (
                <p className="text-sm mt-6" style={{ color: "var(--bark-faded)" }}>
                  &mdash; {testimonials.testimonials[0].author}
                </p>
              )}
            </div>
          </section>
        )}

        {/* CTA section */}
        <section className="py-16 md:py-24" style={{ background: "var(--sage)" }}>
          <div className="container-main text-center">
            <h2 className="font-display text-4xl md:text-5xl lg:text-6xl tracking-tight mb-6" style={{ color: "var(--pure-white)" }}>
              Ready to feel better?
            </h2>
            <p className="text-base md:text-lg leading-relaxed max-w-md mx-auto mb-8" style={{ color: "rgba(255,255,255,0.8)" }}>
              Book your first session and experience the difference.
            </p>
            <Link
              href="/services#booking"
              className="inline-flex text-xs font-bold tracking-widest uppercase px-8 py-3.5 transition-all duration-300"
              style={{ background: "var(--pure-white)", color: "var(--sage)" }}
            >
              Book a Session
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
