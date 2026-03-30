"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "@/lib/lenis";
import type { TestimonialsContent } from "@/lib/types";

export function TestimonialQuote({ testimonials }: { testimonials: TestimonialsContent }) {
  const sectionRef = useRef<HTMLElement>(null);
  const quoteRef = useRef<HTMLParagraphElement>(null);
  const attributionRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const quote = quoteRef.current;
    if (!section || !quote) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      gsap.from(quote, {
        opacity: 0,
        y: 20,
        duration: 0.8,
        ease: "power3.out",
        scrollTrigger: {
          trigger: section,
          start: "top 85%",
          once: true,
        },
      });

      const attribution = attributionRef.current;
      if (attribution) {
        gsap.from(attribution, {
          opacity: 0,
          y: 12,
          duration: 0.6,
          delay: 0.15,
          ease: "power3.out",
          scrollTrigger: {
            trigger: section,
            start: "top 85%",
            once: true,
          },
        });
      }
    }, section);

    return () => ctx.revert();
  }, []);

  if (testimonials.testimonials.length === 0) return null;

  const first = testimonials.testimonials[0];

  return (
    <section ref={sectionRef} className="py-14 md:py-20" style={{ background: "var(--cream)" }}>
      <div className="container-main text-center">
        <p
          ref={quoteRef}
          className="font-display text-[clamp(1.5rem,3.5vw,2.5rem)] leading-[1.2] tracking-tight max-w-3xl mx-auto"
          style={{ color: "var(--bark)" }}
        >
          &ldquo;{first.quote}&rdquo;
        </p>
        {first.author && (
          <p ref={attributionRef} className="text-sm mt-6" style={{ color: "var(--bark-faded)" }}>
            &mdash; {first.author}
          </p>
        )}
      </div>
    </section>
  );
}
