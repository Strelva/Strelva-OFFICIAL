"use client";

import { useRef, useEffect } from "react";
import Image from "next/image";
import gsap from "gsap";
import type { HeroContent } from "@/lib/types";

export function Hero({ hero }: { hero: HeroContent }) {
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const productRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const content = contentRef.current;
    const product = productRef.current;
    if (!section || !content || !product) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      // Text entrance stagger
      const elements = content.querySelectorAll("[data-hero-animate]");
      gsap.set(elements, { opacity: 0, y: 40 });
      gsap.to(elements, {
        opacity: 1,
        y: 0,
        duration: 1,
        ease: "power3.out",
        stagger: 0.15,
        delay: 0.2,
      });

      // Product bag entrance — slides up + fades in
      gsap.set(product, { opacity: 0, y: 60 });
      gsap.to(product, {
        opacity: 1,
        y: 0,
        duration: 1.2,
        ease: "power3.out",
        delay: 0.5,
      });

      // Subtle float on product
      gsap.to(product.querySelector("[data-product-img]"), {
        y: -8,
        duration: 3,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen flex items-center overflow-hidden"
      style={{ background: "var(--cream)" }}
    >
      <div className="container-main w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center py-24 md:py-32">
          {/* Left — Text */}
          <div ref={contentRef} className="max-w-xl text-center lg:text-left mx-auto lg:mx-0 order-2 lg:order-1">
            {hero.subheadline && (
              <p
                data-hero-animate
                className="text-sm md:text-base font-medium tracking-wider uppercase mb-4"
                style={{ color: "var(--sage)" }}
              >
                {hero.subheadline}
              </p>
            )}
            <h1
              data-hero-animate
              className="font-display text-5xl md:text-7xl lg:text-[5.5rem] tracking-tight leading-[0.92] mb-6"
              style={{ color: "var(--bark)" }}
            >
              {hero.headline.split("\n").map((line, i) => (
                <span key={i}>
                  {i > 0 && <br />}
                  {line}
                </span>
              ))}
            </h1>
            <p
              data-hero-animate
              className="text-base md:text-lg max-w-md mx-auto lg:mx-0 mb-8 leading-relaxed"
              style={{ color: "var(--bark-faded)" }}
            >
              {hero.tagline}
            </p>
            <div data-hero-animate className="flex flex-wrap items-center justify-center lg:justify-start gap-4">
              <a
                href="#products"
                className="btn-primary"
                style={{ background: "var(--sage)", color: "var(--cream)" }}
                onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
                  e.currentTarget.style.background = "var(--sage-dark)";
                }}
                onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
                  e.currentTarget.style.background = "var(--sage)";
                }}
              >
                {hero.ctaText}
              </a>
              <a
                href="#story"
                className="btn-ghost"
                style={{ borderColor: "var(--bark)", color: "var(--bark)" }}
              >
                Our Story
              </a>
            </div>

            {/* Launch teaser */}
            <div data-hero-animate className="mt-12 flex items-center justify-center lg:justify-start gap-2.5">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--sage)", animation: "pulse 2s ease-in-out infinite" }}
              />
              <span
                className="text-[0.6875rem] tracking-widest uppercase"
                style={{ color: "var(--bark-faded)" }}
              >
                Launching Spring 2026
              </span>
            </div>
          </div>

          {/* Right — Product with paint slab */}
          <div ref={productRef} className="relative flex items-center justify-center lg:justify-end order-1 lg:order-2">
            {/* Paint slab background accent */}
            <div
              className="absolute"
              style={{
                width: "85%",
                height: "80%",
                top: "10%",
                left: "10%",
                background: "#ffffff",
                borderRadius: "4px 40px 4px 40px",
                transform: "rotate(-3deg)",
                opacity: 0.12,
              }}
            />
            {/* Second paint slab — offset for depth */}
            <div
              className="absolute"
              style={{
                width: "75%",
                height: "70%",
                top: "18%",
                left: "16%",
                background: "#ffffff",
                borderRadius: "40px 4px 40px 4px",
                transform: "rotate(2deg)",
                opacity: 0.15,
              }}
            />

            {/* Product image */}
            <div
              data-product-img
              className="relative z-10"
              style={{ width: "min(420px, 60vw)" }}
            >
              <Image
                src="/images/transparentbag.png"
                alt="Great Lakes Dried Fruit — Apple Chips"
                width={1200}
                height={1703}
                className="w-full h-auto drop-shadow-2xl"
                sizes="(max-width: 1024px) 80vw, 420px"
                priority
              />
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10"
        style={{ animation: "bounce-subtle 2s ease-in-out infinite" }}
      >
        <svg width="20" height="28" viewBox="0 0 20 28" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="18" height="26" rx="9" stroke="var(--bark-faded)" strokeWidth="1.5" opacity="0.3" />
          <circle cx="10" cy="8" r="2" fill="var(--bark-faded)" opacity="0.5">
            <animate attributeName="cy" values="8;18;8" dur="2s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>
    </section>
  );
}
