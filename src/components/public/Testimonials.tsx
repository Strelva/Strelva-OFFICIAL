import type { TestimonialsContent } from "@/lib/types";

export function Testimonials({ testimonials }: { testimonials: TestimonialsContent }) {
  const items = testimonials.testimonials;

  if (!items || items.length === 0) return null;

  return (
    <section className="py-10 md:py-14" style={{ background: "var(--cream-dark)" }}>
      <div className="container-main">
        {/* Featured pull quote */}
        {items[0] && (
          <div className="mb-8 md:mb-10">
            <blockquote
              className="font-display text-3xl md:text-4xl lg:text-5xl tracking-tight leading-[1.15] max-w-3xl"
              style={{ color: "var(--bark)" }}
              data-reb-field="testimonials[0].quote"
            >
              &ldquo;{items[0].quote}&rdquo;
            </blockquote>
            <div className="mt-8 flex items-center gap-3">
              <div
                className="w-10 h-[1px]"
                style={{ background: "var(--sage)" }}
              />
              <span
                className="text-sm font-medium tracking-wide"
                style={{ color: "var(--bark)" }}
                data-reb-field="testimonials[0].author"
              >
                {items[0].author}
              </span>
              {items[0].location && (
                <span
                  className="text-sm"
                  style={{ color: "var(--bark-faded)" }}
                  data-reb-field="testimonials[0].location"
                >
                  {items[0].location}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Secondary quotes */}
        {items.length > 1 && (
          <div
            className="grid md:grid-cols-3 gap-8 md:gap-12 pt-8 md:pt-10"
            style={{ borderTop: "1px solid var(--cream-mid)" }}
          >
            {items.slice(1).map((item, idx) => (
              <div key={item.id}>
                <blockquote
                  className="text-base md:text-lg leading-relaxed"
                  style={{ color: "var(--bark-light)" }}
                  data-reb-field={`testimonials[${idx + 1}].quote`}
                >
                  &ldquo;{item.quote}&rdquo;
                </blockquote>
                <div className="mt-4 flex items-center gap-2">
                  <span
                    className="text-xs font-medium tracking-wider uppercase"
                    style={{ color: "var(--bark-faded)" }}
                    data-reb-field={`testimonials[${idx + 1}].author`}
                  >
                    {item.author}
                  </span>
                  {item.location && (
                    <span
                      className="text-xs"
                      style={{ color: "var(--bark-faded)", opacity: 0.5 }}
                      data-reb-field={`testimonials[${idx + 1}].location`}
                    >
                      · {item.location}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
