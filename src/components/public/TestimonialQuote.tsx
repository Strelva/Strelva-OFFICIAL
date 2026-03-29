import type { TestimonialsContent } from "@/lib/types";

export function TestimonialQuote({ testimonials }: { testimonials: TestimonialsContent }) {
  if (testimonials.testimonials.length === 0) return null;

  const first = testimonials.testimonials[0];

  return (
    <section className="py-14 md:py-20" style={{ background: "var(--cream)" }}>
      <div className="container-main text-center">
        <p
          className="font-display text-[clamp(1.5rem,3.5vw,2.5rem)] leading-[1.2] tracking-tight max-w-3xl mx-auto"
          style={{ color: "var(--bark)" }}
        >
          &ldquo;{first.quote}&rdquo;
        </p>
        {first.author && (
          <p className="text-sm mt-6" style={{ color: "var(--bark-faded)" }}>
            &mdash; {first.author}
          </p>
        )}
      </div>
    </section>
  );
}
