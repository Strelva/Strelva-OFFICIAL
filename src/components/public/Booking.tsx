"use client";

import { useReveal } from "@/hooks/useReveal";

interface BookingProps {
  vagaroUrl: string;
}

export function Booking({ vagaroUrl }: BookingProps) {
  const sectionRef = useReveal();
  const bookingUrl = vagaroUrl || "https://www.vagaro.com/rohlaxwellness";
  const giftUrl = "https://www.vagaro.com/rohlaxwellness/gift-certificates";

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

          <div
            className="max-w-xl mx-auto p-10 md:p-14"
            style={{ background: "var(--pure-white)", border: "1px solid var(--cream-mid)" }}
          >
            <div className="flex items-center justify-center gap-3 mb-6">
              <span className="text-[0.625rem] font-bold tracking-widest uppercase" style={{ color: "var(--sage)" }}>
                5.0 Rating
              </span>
              <div className="flex gap-0.5">
                {[1,2,3,4,5].map((i) => (
                  <svg key={i} className="w-4 h-4" style={{ color: "var(--sage)" }} fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <span className="text-[0.625rem] tracking-wider" style={{ color: "var(--bark-faded)" }}>
                on Vagaro
              </span>
            </div>

            <p className="text-sm mb-2" style={{ color: "var(--bark-light)" }}>
              New clients start with a <strong>Flexibility Foundation</strong> session.
            </p>
            <p className="text-sm mb-8" style={{ color: "var(--bark-faded)" }}>
              Sessions from $60 · 24-hour cancellation policy
            </p>

            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-10 py-4 text-sm font-bold tracking-widest uppercase transition-all duration-300"
              style={{ background: "var(--sage)", color: "var(--pure-white)" }}
              onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
                e.currentTarget.style.background = "var(--sage-dark)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
                e.currentTarget.style.background = "var(--sage)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              Book on Vagaro
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>

            <p className="text-xs mt-6" style={{ color: "var(--bark-faded)" }}>
              Secure booking through Vagaro · Visa, Mastercard, Amex, Discover, Cash
            </p>
          </div>

          {/* Gift certificate CTA */}
          <div className="mt-10 pt-8" style={{ borderTop: "1px solid var(--cream-mid)" }}>
            <p className="text-sm" style={{ color: "var(--bark-faded)" }}>
              Looking for a gift?{" "}
              <a
                href={giftUrl}
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
