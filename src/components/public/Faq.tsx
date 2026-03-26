"use client";

import { useState } from "react";
import { useReveal } from "@/hooks/useReveal";
import type { FaqContent } from "@/lib/types";

export function Faq({ faq }: { faq: FaqContent }) {
  const sectionRef = useReveal();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section id="faq" className="py-14 md:py-20" style={{ background: "var(--cream)" }}>
      <div className="container-main">
        <div ref={sectionRef} className="reveal">
          {faq.description && (
            <p
              className="text-base leading-relaxed max-w-2xl mb-10"
              style={{ color: "var(--bark-light)" }}
            >
              {faq.description}
            </p>
          )}

          <div className="max-w-3xl">
            {faq.faqs.map((item) => {
              const isOpen = openId === item.id;
              return (
                <div
                  key={item.id}
                  style={{ borderBottom: "1px solid var(--cream-mid)" }}
                >
                  <button
                    onClick={() => setOpenId(isOpen ? null : item.id)}
                    className="w-full flex items-center justify-between py-6 text-left group"
                  >
                    <span
                      className="font-display text-lg md:text-xl tracking-tight pr-8"
                      style={{ color: "var(--bark)" }}
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
                    className="overflow-hidden transition-all duration-300"
                    style={{
                      maxHeight: isOpen ? "500px" : "0",
                      opacity: isOpen ? 1 : 0,
                    }}
                  >
                    <p
                      className="text-sm leading-relaxed pb-6"
                      style={{ color: "var(--bark-light)" }}
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
