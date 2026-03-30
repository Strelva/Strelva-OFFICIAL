"use client";

import { useRef, useEffect } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "@/lib/lenis";
import { TrackedLink } from "./TrackedLink";
import type { ProvidersContent, ProviderItem } from "@/lib/types";

const CATEGORY_LABELS: Record<ProviderItem["category"], string> = {
  massage: "Massage",
  chiropractic: "Chiropractic",
  yoga: "Yoga",
  fitness: "Fitness",
  specialty: "Specialty",
};

const CATEGORY_ORDER: ProviderItem["category"][] = [
  "massage",
  "chiropractic",
  "yoga",
  "fitness",
  "specialty",
];

export function Providers({ providers, ownerName }: { providers: ProvidersContent; ownerName?: string }) {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const heading = el.querySelector("[data-providers-heading]");
      if (heading) {
        gsap.from(heading, {
          opacity: 0,
          y: 20,
          duration: 0.6,
          ease: "power3.out",
          scrollTrigger: { trigger: heading, start: "top 80%", once: true },
        });
      }

      const cards = el.querySelectorAll("[data-provider-card]");
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

  // Group by category
  const grouped = CATEGORY_ORDER
    .map((cat) => ({
      category: cat,
      label: CATEGORY_LABELS[cat],
      items: providers.providers.filter((p) => p.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <section id="providers" ref={sectionRef} className="py-14 md:py-20" style={{ background: "var(--cream-dark)" }}>
      <div className="container-main">
        <div>
          <h2 data-providers-heading className="font-display text-4xl md:text-5xl tracking-tight mb-4">
            {providers.headline}
          </h2>
          <p
            className="text-base md:text-lg leading-relaxed max-w-xl mb-10"
            style={{ color: "var(--bark-light)" }}
          >
            {providers.description}
          </p>

          {grouped.length === 0 ? (
            <div className="py-12 text-center" style={{ background: "var(--pure-white)", border: "1px solid var(--cream-mid)" }}>
              <p className="font-display text-xl tracking-tight mb-2" style={{ color: "var(--bark)" }}>
                Directory coming soon
              </p>
              <p className="text-sm" style={{ color: "var(--bark-faded)" }}>
                We&apos;re building a list of trusted providers to help you on your wellness journey.
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {grouped.map((group) => (
                <div key={group.category}>
                  <h3
                    className="text-xs font-bold tracking-[0.2em] uppercase mb-4"
                    style={{ color: "var(--sage)" }}
                  >
                    {group.label}
                  </h3>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {group.items.map((provider) => (
                      <div
                        key={provider.id}
                        data-provider-card
                        className="p-6"
                        style={{ background: "var(--pure-white)", border: "1px solid var(--cream-mid)" }}
                      >
                        <div className="flex items-start gap-4">
                          {provider.photo_url && (
                            <div className="w-12 h-12 rounded-full overflow-hidden shrink-0">
                              <Image
                                src={provider.photo_url}
                                alt={provider.name}
                                width={48}
                                height={48}
                                className="object-cover w-full h-full"
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-display text-lg tracking-tight mb-1">
                              {provider.name}
                            </h4>
                            <p className="text-sm mb-3" style={{ color: "var(--sage)" }}>
                              {provider.service}
                            </p>
                            {provider.why_i_recommend && (
                              <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--bark-light)" }}>
                                &ldquo;{provider.why_i_recommend}&rdquo;
                                <span className="block text-xs mt-1" style={{ color: "var(--bark-faded)" }}>
                                  — {ownerName || "Our"} recommendation
                                </span>
                              </p>
                            )}
                            <div className="flex items-center gap-3">
                              {provider.booking_link && (
                                <TrackedLink
                                  href={provider.booking_link}
                                  event="provider-referral-click"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-bold tracking-wider uppercase px-5 py-2.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-all duration-300"
                                  style={{ background: "var(--sage)", color: "var(--pure-white)" }}
                                >
                                  Book
                                </TrackedLink>
                              )}
                              {provider.phone && (
                                <a
                                  href={`tel:${provider.phone}`}
                                  className="text-xs font-bold tracking-wider uppercase px-5 py-2.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition-all duration-300"
                                  style={{ border: "1px solid var(--cream-mid)", color: "var(--bark-faded)" }}
                                >
                                  Call
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
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
