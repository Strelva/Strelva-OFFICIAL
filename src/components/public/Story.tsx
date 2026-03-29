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
              {story.statement}
            </p>
          </div>
        </div>
      </div>

      {/* Asymmetric layout */}
      <div className="py-10 md:py-14">
        <div className="container-wide">
          <div className="grid lg:grid-cols-12 gap-8 lg:gap-0 items-start">
            {/* Image */}
            <div className="lg:col-span-7 lg:-ml-12">
              <div>
                <div className="relative aspect-[4/3] md:aspect-[3/2]">
                  <Image
                    src={story.imageUrl || "/images/chelsea/portrait.jpg"}
                    alt="Chelsea Rohl, founder of Rohlax Wellness"
                    fill
                    className="object-cover"
                    sizes="(min-width: 1024px) 58vw, 100vw"
                  />
                </div>
                <p
                  className="text-sm italic mt-4 ml-1"
                  style={{ color: "var(--bark-faded)" }}
                >
                  {story.accentText}
                </p>
              </div>
            </div>

            {/* Text */}
            <div className="lg:col-span-5 lg:pl-16 lg:pt-8">
              <h2 className="font-display text-4xl md:text-5xl tracking-tight leading-[1.05] mb-6">
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
                  <p key={i}>{p}</p>
                ))}
              </div>

              {/* Stats */}
              <div
                className="inline-flex items-center gap-6 px-6 py-4"
                style={{ border: "1px solid var(--cream-mid)" }}
              >
                {story.stats.map((stat, i) => (
                  <div key={i} className="flex items-baseline gap-2">
                    <span
                      className="font-display text-2xl tracking-tight"
                      style={{ color: "var(--bark)" }}
                    >
                      {stat.value}
                    </span>
                    <span
                      className="text-[0.625rem] tracking-widest uppercase"
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
            <blockquote className="font-display text-3xl md:text-4xl lg:text-5xl tracking-tight max-w-3xl mx-auto leading-[1.15]">
              &ldquo;{story.quote.replace(/^"|"$/g, "")}&rdquo;
            </blockquote>
            <p
              className="text-xs font-medium tracking-wider uppercase mt-6"
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
