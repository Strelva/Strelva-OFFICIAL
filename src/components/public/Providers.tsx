"use client";

import { useReveal } from "@/hooks/useReveal";
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

export function Providers({ providers }: { providers: ProvidersContent }) {
  const sectionRef = useReveal();

  // Group by category
  const grouped = CATEGORY_ORDER
    .map((cat) => ({
      category: cat,
      label: CATEGORY_LABELS[cat],
      items: providers.providers.filter((p) => p.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  if (providers.providers.length === 0) return null;

  return (
    <section id="providers" className="py-14 md:py-20" style={{ background: "var(--cream-dark)" }}>
      <div className="container-main">
        <div ref={sectionRef} className="reveal">
          <h2 className="font-display text-4xl md:text-5xl tracking-tight mb-4">
            {providers.headline}
          </h2>
          <p
            className="text-base md:text-lg leading-relaxed max-w-xl mb-10"
            style={{ color: "var(--bark-light)" }}
          >
            {providers.description}
          </p>

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
                      className="p-6"
                      style={{ background: "var(--pure-white)", border: "1px solid var(--cream-mid)" }}
                    >
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
                            — Chelsea&apos;s recommendation
                          </span>
                        </p>
                      )}
                      <div className="flex items-center gap-3">
                        {provider.booking_link && (
                          <a
                            href={provider.booking_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[0.5625rem] font-bold tracking-[0.15em] uppercase transition-opacity hover:opacity-60"
                            style={{ color: "var(--sage)" }}
                          >
                            Book &rarr;
                          </a>
                        )}
                        {provider.phone && (
                          <a
                            href={`tel:${provider.phone}`}
                            className="text-[0.5625rem] font-bold tracking-[0.15em] uppercase transition-opacity hover:opacity-60"
                            style={{ color: "var(--bark-faded)" }}
                          >
                            Call
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
