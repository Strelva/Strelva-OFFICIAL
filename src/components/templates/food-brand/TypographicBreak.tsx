"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger as _ScrollTrigger } from "@/lib/lenis";

export function TypographicBreak() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const text = textRef.current;
    if (!section || !text) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      // Horizontal scrub — text slides left as you scroll through
      gsap.fromTo(text,
        { xPercent: 15 },
        {
          xPercent: -15,
          ease: "none",
          scrollTrigger: {
            trigger: section,
            start: "top bottom",
            end: "bottom top",
            scrub: 0.5,
          },
        }
      );
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={sectionRef}
      className="py-6 md:py-8 overflow-hidden"
      style={{ background: "var(--cream)", borderTop: "1px solid var(--cream-dark)", borderBottom: "1px solid var(--cream-dark)" }}
    >
      <p
        ref={textRef}
        className="font-display text-[clamp(3rem,8vw,7rem)] tracking-tight leading-[0.95] text-center whitespace-nowrap"
        style={{ color: "var(--sage)" }}
      >
        Just apples. Just cinnamon.
      </p>
    </div>
  );
}
