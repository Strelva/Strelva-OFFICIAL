import Image from "next/image";
import type { StoryContent } from "@/lib/types";

export function Story({ story }: { story: StoryContent }) {

  return (
    <section id="story" style={{ background: "var(--cream)" }}>
      {/* Statement */}
      <div className="py-8 md:py-10" style={{ borderBottom: "1px solid var(--cream-dark)" }}>
        <div className="container-main">
          <div>
            <p className="font-display text-[clamp(2rem,5vw,4rem)] leading-[1.1] tracking-tight max-w-4xl" data-reb-field="statement">
              {story.statement.split(/(feel good about)/).map((part, i) =>
                part === "feel good about" ? (
                  <em key={i} className="not-italic" style={{ color: "var(--sage)" }}>
                    {part}
                  </em>
                ) : (
                  <span key={i}>{part}</span>
                )
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Asymmetric layout */}
      <div className="py-10 md:py-14">
        <div className="container-wide">
          <div className="grid lg:grid-cols-12 gap-8 lg:gap-0 items-start">
            {/* Image */}
            <div className="min-w-0 lg:col-span-7 lg:-ml-12">
              <div>
                <div className="relative aspect-[4/3] md:aspect-[3/2] overflow-hidden">
                  {story.imageUrl ? (
                    <Image
                      src={story.imageUrl}
                      alt=""
                      fill
                      data-reb-field="imageUrl"
                      className="object-cover"
                      sizes="(min-width: 1024px) 58vw, 100vw"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center p-8 text-center" style={{ background: "var(--cream-dark)" }}>
                      <span className="font-display text-4xl tracking-tight" data-reb-field="accentText" style={{ color: "var(--sage)" }}>
                        {story.accentText || "Small-batch snacks"}
                      </span>
                    </div>
                  )}
                </div>
                <p
                  data-reb-field="accentText"
                  className="text-sm italic mt-4 ml-1"
                  style={{ color: "var(--bark-faded)" }}
                >
                  {story.accentText}
                </p>
              </div>
            </div>

            {/* Text */}
            <div className="min-w-0 lg:col-span-5 lg:pl-16 lg:pt-8">
              <h2 className="font-display text-4xl md:text-5xl tracking-tight leading-[1.05] mb-6" data-reb-field="headline">
                {story.headline.split("\n").map((line, i) => (
                  <span key={i}>
                    {i > 0 && <br />}
                    {line}
                  </span>
                ))}
              </h2>

              <div
                className="space-y-5 text-base leading-relaxed mb-8"
                style={{ color: "var(--bark-light)" }}
              >
                {story.paragraphs.map((p, i) => (
                  <p key={i} data-reb-field={`paragraphs[${i}]`}>{p}</p>
                ))}
              </div>

              {/* Origin mark */}
              <div
                className="flex flex-wrap items-center gap-4 md:gap-6 px-6 py-4"
                style={{ border: "1px solid var(--cream-mid)" }}
              >
                {story.stats.map((stat, i) => (
                  <div key={i} className="flex items-baseline gap-2">
                    <span
                      className="font-display text-2xl tracking-tight"
                      data-reb-field={`stats[${i}].value`}
                      style={{ color: "var(--bark)" }}
                    >
                      {stat.value}
                    </span>
                    <span
                      className="text-[0.625rem] tracking-widest uppercase"
                      data-reb-field={`stats[${i}].label`}
                      style={{ color: "var(--bark-faded)" }}
                    >
                      {stat.label}
                    </span>
                    {i < story.stats.length - 1 && (
                      <span
                        className="ml-4 w-[1px] h-4 inline-block"
                        style={{ background: "var(--cream-mid)" }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Pull quote */}
          <div
            className="mt-8 md:mt-12 py-8 md:py-10 text-center"
            style={{ borderTop: "1px solid var(--cream-dark)" }}
          >
            <blockquote className="font-display text-3xl md:text-4xl lg:text-5xl tracking-tight max-w-3xl mx-auto leading-[1.15]" data-reb-field="quote">
              &ldquo;{story.quote.replace(/^"|"$/g, "")}&rdquo;
            </blockquote>
            <p
              className="text-xs font-medium tracking-wider uppercase mt-6"
              data-reb-field="quoteAttribution"
              style={{ color: "var(--bark-faded)" }}
            >
              {story.quoteAttribution}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
