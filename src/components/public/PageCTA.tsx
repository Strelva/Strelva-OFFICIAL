import Link from "next/link";

interface PageCTAProps {
  heading?: string;
  description?: string;
  ctaText?: string;
  ctaHref?: string;
}

export function PageCTA({
  heading = "Ready to feel better?",
  description = "Book your first session and experience the difference.",
  ctaText = "Book a Session",
  ctaHref = "/services#booking",
}: PageCTAProps) {
  return (
    <section className="py-16 md:py-24" style={{ background: "var(--sage)" }}>
      <div className="container-main text-center">
        <h2 className="font-display text-4xl md:text-5xl tracking-tight mb-6" style={{ color: "var(--pure-white)" }} data-reb-field="heading">
          {heading}
        </h2>
        <p className="text-base md:text-lg leading-relaxed max-w-md mx-auto mb-8" style={{ color: "rgba(255,255,255,0.8)" }} data-reb-field="description">
          {description}
        </p>
        <Link
          href={ctaHref}
          className="inline-flex text-xs font-bold tracking-widest uppercase px-8 py-3.5 transition-all duration-300"
          style={{ background: "var(--pure-white)", color: "var(--sage)" }}
        >
          {ctaText}
        </Link>
      </div>
    </section>
  );
}
