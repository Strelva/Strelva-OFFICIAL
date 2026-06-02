"use client";

import { useState, useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger as _ScrollTrigger } from "@/lib/lenis";
import type { FaqContent } from "@/lib/types";

export function Faq({ faq }: { faq: FaqContent }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const heading = el.querySelector("[data-faq-heading]");
      if (heading) {
        gsap.from(heading, {
          opacity: 0,
          y: 20,
          duration: 0.6,
          ease: "power3.out",
          scrollTrigger: { trigger: heading, start: "top 80%", once: true },
        });
      }

      const items = el.querySelectorAll("[data-faq-item]");
      if (items.length) {
        gsap.from(items, {
          opacity: 0,
          y: 16,
          stagger: 0.06,
          duration: 0.5,
          ease: "power3.out",
          scrollTrigger: { trigger: items[0], start: "top 80%", once: true },
        });
      }
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <section id="faq" ref={sectionRef} className="py-14 md:py-20" style={{ background: "var(--cream)" }}>
      <div className="container-main">
        <div>
          {faq.description && (
            <p
              data-faq-heading
              className="text-base leading-relaxed max-w-2xl mb-10"
              style={{ color: "var(--bark-light)" }}
              data-reb-field="description"
            >
              {faq.description}
            </p>
          )}

          <div className="max-w-3xl">
            {faq.faqs.map((item, index) => {
              const isOpen = openId === item.id;
              const btnId = `faq-btn-${index}`;
              return (
                <div
                  key={item.id}
                  data-faq-item
                  style={{ borderBottom: "1px solid var(--cream-mid)" }}
                >
                  <button
                    id={btnId}
                    onClick={() => setOpenId(isOpen ? null : item.id)}
                    className="w-full flex items-center justify-between py-6 text-left group"
                    aria-expanded={isOpen}
                  >
                    <span
                      className="font-display text-lg md:text-xl tracking-tight pr-8"
                      style={{ color: "var(--bark)" }}
                      data-reb-field={`faqs[${index}].question`}
                    >
                      {item.question}
                    </span>
                    <span
                      className="shrink-0 text-xl transition-transform duration-300"
                      style={{
                        color: "var(--sage)",
                        transform: isOpen ? "rotate(45deg)" : "none",
                      }}
                    >
                      +
                    </span>
                  </button>
                  <div
                    role="region"
                    aria-labelledby={btnId}
                    className="overflow-hidden transition-all duration-300"
                    style={{
                      maxHeight: isOpen ? "2000px" : "0",
                      opacity: isOpen ? 1 : 0,
                    }}
                  >
                    <p
                      className="text-sm leading-relaxed pb-6"
                      style={{ color: "var(--bark-light)" }}
                      data-reb-field={`faqs[${index}].answer`}
                    >
                      {item.answer}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
