"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "@/lib/lenis";
import type { SiteSettings, ContactContent } from "@/lib/types";

export function TrustStrip({ settings, contact }: { settings: SiteSettings; contact: ContactContent }) {
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const items = el.querySelectorAll("[data-trust-item]");
      if (items.length) {
        gsap.from(items, {
          opacity: 0,
          y: 12,
          stagger: 0.08,
          duration: 0.5,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 85%", once: true },
        });
      }
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={stripRef}
      className="py-5 md:py-6"
      style={{ background: "var(--cream-dark)", borderBottom: "1px solid var(--cream-mid)" }}
    >
      <div className="container-main">
        <div
          className="flex flex-wrap items-center justify-center gap-x-10 gap-y-2 text-[0.625rem] font-medium tracking-[0.15em] uppercase"
          style={{ color: "var(--bark-faded)" }}
        >
          <span data-trust-item>{settings.ownerTitle || "Owner-Operated"}</span>
          <span data-trust-item style={{ color: "var(--cream-mid)" }}>|</span>
          <span data-trust-item>Personalized Sessions</span>
          <span data-trust-item style={{ color: "var(--cream-mid)" }}>|</span>
          <span data-trust-item>
            {contact.address
              ? contact.address.split(",").slice(-2).join(",").trim()
              : "Virtual Available"}
          </span>
        </div>
      </div>
    </div>
  );
}
