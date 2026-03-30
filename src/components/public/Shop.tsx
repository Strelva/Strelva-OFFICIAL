"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "@/lib/lenis";
import { TrackedLink } from "./TrackedLink";
import type { ShopContent, ShopItem } from "@/lib/types";

const CATEGORY_LABELS: Record<ShopItem["category"], string> = {
  recommended: "Recommended",
  merch: "Merch",
  tools: "Tools",
};

export function Shop({ shop }: { shop: ShopContent }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [filter, setFilter] = useState<ShopItem["category"] | "all">("all");

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const heading = el.querySelector("[data-shop-heading]");
      if (heading) {
        gsap.from(heading, {
          opacity: 0,
          y: 20,
          duration: 0.6,
          ease: "power3.out",
          scrollTrigger: { trigger: heading, start: "top 80%", once: true },
        });
      }

      const cards = el.querySelectorAll("[data-shop-card]");
      if (cards.length) {
        gsap.from(cards, {
          opacity: 0,
          y: 20,
          stagger: 0.08,
          duration: 0.6,
          ease: "power3.out",
          scrollTrigger: { trigger: cards[0], start: "top 80%", once: true },
        });
      }
    }, el);

    return () => ctx.revert();
  }, []);

  const categories = Array.from(new Set(shop.items.map((i) => i.category)));
  const filtered = filter === "all" ? shop.items : shop.items.filter((i) => i.category === filter);

  return (
    <section id="shop" ref={sectionRef} className="py-14 md:py-20" style={{ background: "var(--cream)" }}>
      <div className="container-main">
        <div>
          {shop.description && (
            <p
              data-shop-heading
              className="text-base leading-relaxed max-w-2xl mb-10"
              style={{ color: "var(--bark-light)" }}
            >
              {shop.description}
            </p>
          )}

          {/* Category tabs */}
          {categories.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-10">
              <button
                onClick={() => setFilter("all")}
                className="px-4 py-2 text-xs font-bold tracking-wider uppercase transition-all duration-200"
                style={{
                  background: filter === "all" ? "var(--sage)" : "var(--cream-dark)",
                  color: filter === "all" ? "var(--pure-white)" : "var(--bark-faded)",
                }}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className="px-4 py-2 text-xs font-bold tracking-wider uppercase transition-all duration-200"
                  style={{
                    background: filter === cat ? "var(--sage)" : "var(--cream-dark)",
                    color: filter === cat ? "var(--pure-white)" : "var(--bark-faded)",
                  }}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          )}

          {/* Product grid */}
          {filtered.length === 0 ? (
            <div className="py-12 text-center" style={{ background: "var(--cream-dark)" }}>
              <p className="font-display text-xl tracking-tight mb-2" style={{ color: "var(--bark)" }}>
                No items yet
              </p>
              <p className="text-sm" style={{ color: "var(--bark-faded)" }}>
                Check back soon for product recommendations and merch.
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  data-shop-card
                  className="flex flex-col"
                  style={{ background: "var(--cream-dark)" }}
                >
                  {/* Image placeholder */}
                  {item.image_url ? (
                    <div className="aspect-square overflow-hidden relative">
                      <Image
                        src={item.image_url}
                        alt={item.name}
                        fill
                        className="object-cover"
                        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      />
                    </div>
                  ) : (
                    <div
                      className="aspect-square flex items-center justify-center"
                      style={{ background: "var(--cream-mid)" }}
                    >
                      <span className="text-3xl" style={{ color: "var(--bark-faded)", opacity: 0.3 }}>
                        {CATEGORY_LABELS[item.category]}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-col flex-1 p-6">
                    <span
                      className="text-[0.5625rem] font-bold tracking-[0.15em] uppercase mb-2"
                      style={{ color: "var(--sage)" }}
                    >
                      {CATEGORY_LABELS[item.category]}
                    </span>
                    <h3 className="font-display text-lg tracking-tight mb-2">
                      {item.name}
                    </h3>
                    {item.description && (
                      <p
                        className="text-sm leading-relaxed mb-4 flex-1"
                        style={{ color: "var(--bark-light)" }}
                      >
                        {item.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-auto pt-4" style={{ borderTop: "1px solid var(--cream-mid)" }}>
                      {item.price && (
                        <span className="font-display text-lg tracking-tight">
                          ${item.price}
                        </span>
                      )}
                      {item.external_link ? (
                        <TrackedLink
                          href={item.external_link}
                          event="shop-click"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[0.5625rem] font-bold tracking-[0.15em] uppercase transition-opacity hover:opacity-60"
                          style={{ color: "var(--sage)" }}
                        >
                          Shop Now &rarr;
                        </TrackedLink>
                      ) : (
                        <span
                          className="text-[0.5625rem] font-bold tracking-[0.15em] uppercase"
                          style={{ color: "var(--bark-faded)" }}
                        >
                          Coming Soon
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
