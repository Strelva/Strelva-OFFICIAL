"use client";

import { useRef, useEffect } from "react";
import Image from "next/image";
import gsap from "gsap";
import type { HeroContent } from "@/lib/types";

function canRenderHeroImage(src: string | undefined) {
  return !!src && !src.startsWith("/images/");
}

export function Hero({ hero }: { hero: HeroContent }) {
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const productRef = useRef<HTMLDivElement>(null);
  const heroLogoUrl = canRenderHeroImage(hero.logoUrl) ? hero.logoUrl : "";

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
      className="relative w-full overflow-hidden"
      style={{ paddingBottom: "33.333%" /* 3:1 aspect ratio like TopSeedz */ }}
    >
      {/* Full-bleed background image */}
      {hero.backgroundImageUrl && (
        <Image
          src={hero.backgroundImageUrl}
          alt=""
          fill
          className="object-cover object-center"
          sizes="100vw"
          priority
        />
      )}
      {/* Dark overlay for text legibility */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Content positioned absolutely within the aspect-ratio box */}
      <div className="absolute inset-0 z-10 flex items-center">
        <div className="container-main w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            {/* Left — Text */}
            <div ref={contentRef} className="max-w-xl text-center lg:text-left mx-auto lg:mx-0">
              {hero.subheadline && (
                <p
                  data-hero-animate
                  className="text-xs md:text-sm font-medium tracking-wider uppercase mb-3"
                  style={{ color: "var(--wheat-light)" }}
                >
                  {hero.subheadline}
                </p>
              )}
              <h1
                data-hero-animate
                className="font-display text-3xl md:text-5xl lg:text-6xl tracking-tight leading-[0.92] mb-4"
                style={{ color: "var(--cream)" }}
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
                className="text-sm md:text-base max-w-md mx-auto lg:mx-0 mb-5 leading-relaxed"
                style={{ color: "rgba(250, 248, 245, 0.8)" }}
              >
                {hero.tagline}
              </p>
              <div data-hero-animate className="flex flex-wrap items-center justify-center lg:justify-start gap-3">
                <a
                  href="#products"
                  className="btn-primary"
                  aria-label="See Great Lakes Dried Fruit products"
                  style={{ background: "var(--cream)", color: "var(--sage)" }}
                  onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
                    e.currentTarget.style.background = "var(--wheat-light)";
                  }}
                  onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
                    e.currentTarget.style.background = "var(--cream)";
                  }}
                >
                  {hero.ctaText}
                </a>
                <a
                  href="#comparison"
                  className="btn-ghost"
                  aria-label="Jump to what makes these products different"
                  style={{ borderColor: "rgba(250,248,245,0.5)", color: "var(--cream)" }}
                >
                  Why We&apos;re Different
                </a>
              </div>
            </div>

            {/* Right — Product bag (only show if logoUrl is set as product image) */}
            {heroLogoUrl && (
              <div ref={productRef} className="hidden lg:flex items-center justify-end">
                <div
                  data-product-img
                  className="relative z-10"
                  style={{ width: "min(280px, 40vw)" }}
                >
                  <Image
                    src={heroLogoUrl}
                    alt={`${hero.headline} — Product`}
                    width={1200}
                    height={1703}
                    className="w-full h-auto drop-shadow-[0_20px_60px_rgba(0,0,0,0.4)]"
                    sizes="280px"
                    priority
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
