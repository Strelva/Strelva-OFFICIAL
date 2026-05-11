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
      const elements = content.querySelectorAll("[data-hero-animate]");
      gsap.set(elements, { opacity: 0, y: 36 });
      gsap.to(elements, {
        opacity: 1,
        y: 0,
        duration: 1,
        ease: "power3.out",
        stagger: 0.14,
        delay: 0.15,
      });

      gsap.set(product, { opacity: 0, y: 48 });
      gsap.to(product, {
        opacity: 1,
        y: 0,
        duration: 1.1,
        ease: "power3.out",
        delay: 0.35,
      });

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
      className="relative min-h-[760px] overflow-hidden pt-24 md:pt-28 lg:pt-32"
      style={{ background: "var(--cream)", color: "var(--bark)" }}
    >
      <div className="container-main relative z-10">
        <div className="grid min-h-[610px] items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(360px,430px)]">
          <div ref={contentRef} className="max-w-4xl">
            {hero.subheadline && (
              <p
                data-hero-animate
                data-reb-field="subheadline"
                className="mb-5 text-[0.68rem] font-bold uppercase tracking-[0.2em]"
                style={{ color: "var(--sage)" }}
              >
                {hero.subheadline}
              </p>
            )}
            <h1
              data-hero-animate
              data-reb-field="headline"
              className="font-display text-[clamp(3.25rem,8vw,7.5rem)] leading-[0.9] tracking-tight"
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
              data-reb-field="tagline"
              className="mt-7 max-w-2xl text-lg leading-relaxed md:text-xl"
              style={{ color: "var(--bark-light)" }}
            >
              {hero.tagline}
            </p>
            <div data-hero-animate className="mt-9 flex flex-wrap items-center gap-4">
              <a
                href={hero.ctaLink || "#products"}
                className="px-7 py-3.5 text-[0.68rem] font-bold uppercase tracking-[0.16em] transition-opacity hover:opacity-80"
                aria-label="See Great Lakes Dried Fruit products"
                data-reb-field="ctaText"
                style={{ background: "var(--bark)", color: "var(--cream)" }}
              >
                {hero.ctaText}
              </a>
              <a
                href="#comparison"
                className="px-7 py-3.5 text-[0.68rem] font-bold uppercase tracking-[0.16em] transition-opacity hover:opacity-70"
                aria-label="Jump to what makes these products different"
                style={{ border: "1px solid var(--cream-mid)", color: "var(--bark)" }}
              >
                Why Us
              </a>
            </div>
          </div>

          <div ref={productRef} className="relative hidden min-h-[560px] lg:block">
            <div
              data-product-img
              className="absolute right-0 top-0 h-[520px] w-[430px] overflow-hidden"
              style={{ background: "var(--cream-dark)" }}
            >
              <Image
                src="/images/product-bag-lifestyle.jpg"
                alt="Great Lakes Dried Fruit apple snaps bag"
                fill
                className="object-cover"
                sizes="(min-width: 1024px) 430px, 72vw"
                priority
              />
            </div>
            <div
              className="absolute -bottom-1 left-0 h-[260px] w-[260px] overflow-hidden shadow-[0_24px_80px_rgba(44,36,24,0.18)]"
              style={{ background: "var(--cream-mid)" }}
            >
              <Image
                src="/images/product-bag.jpg"
                alt="Great Lakes Dried Fruit apple snaps bag"
                fill
                className="object-cover"
                sizes="260px"
              />
            </div>
          </div>
        </div>

        <div
          data-hero-animate
          className="absolute bottom-8 left-4 hidden items-center gap-3 text-[0.62rem] font-bold uppercase tracking-[0.18em] md:flex"
          style={{ color: "var(--bark-faded)" }}
        >
          <span>Scroll to explore</span>
          <span className="h-px w-16" style={{ background: "var(--cream-mid)" }} />
        </div>
      </div>

      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-32"
        style={{ background: "linear-gradient(to bottom, transparent, var(--cream-dark))" }}
      />

      {hero.backgroundImageUrl && (
        <div className="sr-only">
          <Image
            src={hero.backgroundImageUrl}
            alt=""
            width={1}
            height={1}
            data-reb-field="backgroundImageUrl"
          />
        </div>
      )}
    </section>
  );
}
