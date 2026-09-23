"use client";

import { useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import gsap from "gsap";
import "@/lib/lenis";
import { TrackedLink } from "./TrackedLink";
import type { HeroContent } from "@/lib/types";

export function Hero({
  hero,
  siteName,
  variant = "default",
}: {
  hero: HeroContent;
  ownerName?: string;
  siteName?: string;
  variant?: string;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const image = imageRef.current;
    const content = contentRef.current;
    if (!section || !image || !content) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      gsap.to(image, {
        yPercent: 20,
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });

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

      gsap.to(content, {
        yPercent: -5,
        opacity: 0.6,
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "20% top",
          end: "90% top",
          scrub: true,
        },
      });
    }, section);

    return () => ctx.revert();
  }, []);

  const isEditorial = variant === "editorial";
  const isImageLed = variant === "image-led";
  const contentAlignment = isEditorial ? "mx-auto text-center" : "";
  const sectionHeight = isEditorial
    ? "min-h-[76svh] md:min-h-[86svh]"
    : isImageLed
      ? "min-h-[92svh] md:min-h-screen"
      : "min-h-[84svh] md:min-h-screen";

  return (
    <section id="hero" ref={sectionRef} className={`relative flex ${sectionHeight} items-end overflow-hidden pb-12 md:pb-28`}>
      <div ref={imageRef} className="absolute inset-0" style={{ willChange: "transform" }}>
        {hero.backgroundImageUrl ? (
          <Image
            src={hero.backgroundImageUrl}
            alt={siteName ? `${siteName} — hero` : "Hero image"}
            fill
            className="object-cover"
            sizes="100vw"
            priority
            style={{ transform: "scale(1.2)" }}
          />
        ) : (
          <div className="absolute inset-0" style={{ background: "var(--bark)" }} />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 45%, transparent 75%)",
          }}
        />
      </div>

      <div ref={contentRef} className="relative z-10 w-full">
        <div className="container-main">
          <div className={`max-w-2xl ${contentAlignment}`}>
            {hero.subheadline && (
              <p
                data-hero-animate
                data-reb-field="subheadline"
                className="text-sm md:text-base font-medium tracking-wider uppercase mb-4"
                style={{ color: "rgba(250,249,247,0.85)" }}
              >
                {hero.subheadline}
              </p>
            )}
            <h1
              data-hero-animate
              data-reb-field="headline"
              className={`font-display tracking-tight mb-6 ${
                isEditorial
                  ? "text-4xl md:text-6xl lg:text-7xl leading-[0.98]"
                  : "text-5xl md:text-7xl lg:text-[5.5rem] leading-[0.92]"
              }`}
              style={{ color: "var(--cream)" }}
            >
              {(hero.headline || "").split("\n").map((line, i) => (
                <span key={i}>
                  {i > 0 && <br />}
                  {line}
                </span>
              ))}
            </h1>
            <p
              data-hero-animate
              data-reb-field="tagline"
              className={`text-base md:text-lg mb-8 leading-relaxed ${isEditorial ? "mx-auto max-w-xl" : "max-w-md"}`}
              style={{ color: "rgba(250,249,247,0.7)" }}
            >
              {hero.tagline}
            </p>
            <div data-hero-animate className={`flex flex-wrap items-center gap-4 ${isEditorial ? "justify-center" : ""}`}>
              <TrackedLink
                event="booking-click"
                href={hero.ctaLink || "/services#booking"}
                className="btn-primary"
                style={{ background: "var(--sage)", color: "var(--pure-white)" }}
                onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
                  e.currentTarget.style.background = "var(--sage-dark)";
                }}
                onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
                  e.currentTarget.style.background = "var(--sage)";
                }}
                data-reb-field="ctaText"
              >
                {hero.ctaText}
              </TrackedLink>
              <Link
                href="#services"
                className="btn-ghost"
                style={{
                  background: "rgba(250,249,247,0.92)",
                  borderColor: "rgba(250,249,247,0.92)",
                  color: "var(--bark)",
                }}
                data-reb-field="ctaLink"
              >
                View services
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10"
        style={{ animation: "scroll-cue-drift 2s cubic-bezier(0.16, 1, 0.3, 1) infinite" }}
      >
        <svg width="20" height="28" viewBox="0 0 20 28" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="18" height="26" rx="9" stroke="rgba(250,249,247,0.3)" strokeWidth="1.5" />
          <circle cx="10" cy="8" r="2" fill="rgba(250,249,247,0.5)">
            <animate attributeName="cy" values="8;18;8" dur="2s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>
    </section>
  );
}
