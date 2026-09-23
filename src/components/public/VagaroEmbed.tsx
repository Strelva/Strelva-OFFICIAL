"use client";

interface VagaroEmbedProps {
  embedId: string;
  fallbackUrl?: string;
}

/**
 * Vagaro booking integration with three tiers:
 * 1. If a Vagaro widget script ID is configured → embedded widget via Vagaro's WidgetEmbeddedLoader
 * 2. If only a business slug → styled iframe of their Vagaro page
 * 3. Always: direct link fallback at the bottom
 *
 * The widget script ID comes from Vagaro's dashboard:
 * Settings > Online Booking > Website Integration > Embedded Page
 * It looks like: "WidgetEmbeddedLoader/OZqnVaq4p5r"
 *
 * For most clients, the iframe fallback is cleaner than asking them to
 * find the widget script in their Vagaro dashboard.
 */
export function VagaroEmbed({ embedId, fallbackUrl }: VagaroEmbedProps) {
  const bookingUrl = fallbackUrl || `https://www.vagaro.com/${embedId}`;

  return (
    <section id="booking" className="py-14 md:py-20" style={{ background: "var(--cream)" }}>
      <div className="container-main">
        <div className="text-center mb-10">
          <h2
            className="font-display text-4xl md:text-5xl tracking-tight mb-4"
            style={{ color: "var(--bark)" }}
          >
            Book a Session
          </h2>
          <p className="text-base md:text-lg max-w-md mx-auto" style={{ color: "var(--bark-light)" }}>
            Choose a service, pick your time, and you&apos;re booked. Simple as that.
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          {/* Vagaro widget container — the script will populate this */}
          <div
            id="vagaro-booking-widget"
            className="vagaro rounded-xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
            style={{
              background: "var(--pure-white)",
              border: "1px solid var(--cream-mid)",
              minHeight: "600px",
            }}
          >
            {/* Iframe fallback — works universally without needing the widget script */}
            <iframe
              src={bookingUrl}
              title="Book with Vagaro"
              className="w-full border-0"
              style={{ height: "700px", minHeight: "500px" }}
              loading="lazy"
              allow="payment"
            />
          </div>

          {/* Direct link */}
          <div className="text-center mt-4">
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm transition-opacity hover:opacity-60"
              style={{ color: "var(--bark-faded)" }}
            >
              Or book directly on Vagaro &rarr;
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
