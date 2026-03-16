"use client";

import { useReveal } from "@/hooks/useReveal";

interface BookingProps {
  vagaroUrl: string;
}

export function Booking({ vagaroUrl }: BookingProps) {
  const sectionRef = useReveal();

  return (
    <section
      id="booking"
      className="py-14 md:py-20"
      style={{ background: "var(--cream-dark)" }}
    >
      <div className="container-main">
        <div ref={sectionRef} className="reveal text-center">
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl tracking-tight mb-4">
            Ready to ROHLAX?
          </h2>
          <p
            className="text-base md:text-lg leading-relaxed max-w-lg mx-auto mb-10"
            style={{ color: "var(--bark-light)" }}
          >
            Book your session online — choose a time that works for you, and let&apos;s get you feeling better.
          </p>

          {vagaroUrl ? (
            <div className="max-w-2xl mx-auto">
              <iframe
                src={vagaroUrl}
                title="Book with Rohlax Wellness on Vagaro"
                className="w-full border-0 rounded-lg"
                style={{ minHeight: 600, background: "var(--pure-white)" }}
                allow="payment"
              />
            </div>
          ) : (
            <div
              className="max-w-lg mx-auto p-10 md:p-14"
              style={{ background: "var(--pure-white)", border: "1px solid var(--cream-mid)" }}
            >
              <p className="font-display text-2xl tracking-tight mb-3">
                Book via Vagaro
              </p>
              <p className="text-sm mb-6" style={{ color: "var(--bark-light)" }}>
                View available times and book your assisted stretching session online.
              </p>
              <a
                href="https://www.vagaro.com"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
                style={{ background: "var(--sage)", color: "var(--pure-white)" }}
                onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
                  e.currentTarget.style.background = "var(--sage-dark)";
                }}
                onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
                  e.currentTarget.style.background = "var(--sage)";
                }}
              >
                View Available Times
              </a>
            </div>
          )}

          {/* Gift certificate CTA */}
          <div className="mt-10 pt-8" style={{ borderTop: "1px solid var(--cream-mid)" }}>
            <p className="text-sm" style={{ color: "var(--bark-faded)" }}>
              Looking for a gift?{" "}
              <a
                href="https://www.vagaro.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium transition-opacity hover:opacity-60"
                style={{ color: "var(--sage)" }}
              >
                Purchase a gift certificate &rarr;
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
