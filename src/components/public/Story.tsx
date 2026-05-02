"use client";

import { useRef, useEffect } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger as _ScrollTrigger } from "@/lib/lenis";
import type { StoryContent } from "@/lib/types";

export function Story({ story, ownerName }: { story: StoryContent; ownerName?: string }) {
  const sectionRef = useRef<HTMLElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const quoteRef = useRef<HTMLDivElement>(null);
  const statementRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const image = imageRef.current;
    const text = textRef.current;
    const quote = quoteRef.current;
    const statement = statementRef.current;
    if (!section || !image || !text || !quote || !statement) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      // Statement fade in
      gsap.from(statement, {
        opacity: 0,
        y: 30,
        duration: 0.8,
        ease: "power3.out",
        scrollTrigger: {
          trigger: statement,
          start: "top 85%",
          once: true,
        },
      });

      // Image parallax
      gsap.to(image, {
        yPercent: 8,
        ease: "none",
        scrollTrigger: {
          trigger: image,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      });

      // Text elements stagger reveal
      const textElements = text.querySelectorAll("[data-story-animate]");
      gsap.from(textElements, {
        opacity: 0,
        y: 24,
        duration: 0.7,
        ease: "power3.out",
        stagger: 0.12,
        scrollTrigger: {
          trigger: text,
          start: "top 80%",
          once: true,
        },
      });

      // Quote reveal
      gsap.from(quote, {
        opacity: 0,
        y: 20,
        duration: 0.8,
        ease: "power3.out",
        scrollTrigger: {
          trigger: quote,
          start: "top 85%",
          once: true,
        },
      });
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section id="story" ref={sectionRef} style={{ background: "var(--cream)" }}>
      {/* Statement */}
      <div className="py-8 md:py-10" style={{ borderBottom: "1px solid var(--cream-dark)" }}>
        <div className="container-main">
          <div>
            <p
              ref={statementRef}
              className="font-display text-[clamp(2rem,5vw,4rem)] leading-[1.1] tracking-tight max-w-4xl"
              data-reb-field="statement"
            >
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
                <div className="relative aspect-[4/3] md:aspect-[3/2] overflow-hidden" ref={imageRef}>
                  {story.imageUrl ? (
                    <Image
                      src={story.imageUrl}
                      alt={ownerName ? `${ownerName}, founder` : "Business owner"}
                      fill
                      className="object-cover"
                      sizes="(min-width: 1024px) 58vw, 100vw"
                    />
                  ) : (
                    <div className="absolute inset-0" style={{ background: "var(--cream-dark)" }} />
                  )}
                </div>
                <p
                  className="text-sm italic mt-4 ml-1"
                  style={{ color: "var(--bark-faded)" }}
                  data-reb-field="accentText"
                >
                  {story.accentText}
                </p>
              </div>
            </div>

            {/* Text */}
            <div className="lg:col-span-5 lg:pl-16 lg:pt-8" ref={textRef}>
              <h2
                className="font-display text-4xl md:text-5xl tracking-tight leading-[1.05] mb-6"
                data-story-animate
                data-reb-field="headline"
              >
                {(story.headline || "").split("\n").map((line, i) => (
                  <span key={i}>
                    {i > 0 && <br />}
                    {line}
                  </span>
                ))}
              </h2>

              <div
                className="space-y-5 text-base leading-relaxed mb-8"
                style={{ color: "var(--bark-light)" }}
                data-story-animate
              >
                {story.paragraphs.map((p, i) => (
                  <p key={i} data-reb-field={`paragraphs[${i}]`}>{p}</p>
                ))}
              </div>

              {/* Stats */}
              <div
                className="inline-flex items-center gap-6 px-6 py-4"
                style={{ border: "1px solid var(--cream-mid)" }}
                data-story-animate
              >
                {story.stats.map((stat, i) => (
                  <div key={i} className="flex items-baseline gap-2">
                    <span
                      className="font-display text-2xl tracking-tight"
                      style={{ color: "var(--bark)" }}
                      data-reb-field={`stats[${i}].value`}
                    >
                      {stat.value}
                    </span>
                    <span
                      className="text-[0.625rem] tracking-widest uppercase"
                      style={{ color: "var(--bark-faded)" }}
                      data-reb-field={`stats[${i}].label`}
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
            ref={quoteRef}
            className="mt-8 md:mt-12 py-8 md:py-10 text-center"
            style={{ borderTop: "1px solid var(--cream-dark)" }}
          >
            <blockquote className="font-display text-3xl md:text-4xl lg:text-5xl tracking-tight max-w-3xl mx-auto leading-[1.15]" data-reb-field="quote">
              &ldquo;{story.quote.replace(/^"|"$/g, "")}&rdquo;
            </blockquote>
            <p
              className="text-xs font-medium tracking-wider uppercase mt-6"
              style={{ color: "var(--bark-faded)" }}
              data-reb-field="quoteAttribution"
            >
              {story.quoteAttribution}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
