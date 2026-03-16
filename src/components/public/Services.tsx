"use client";

import { useReveal } from "@/hooks/useReveal";
import type { ServicesContent } from "@/lib/types";

export function Services({ services }: { services: ServicesContent }) {
  const headerRef = useReveal();
  const gridRef = useReveal();

  const featured = services.services.find((s) => s.featured) ?? services.services[0];
  const others = services.services.filter((s) => s.id !== featured?.id);

  return (
    <section
      id="services"
      className="py-10 md:py-14"
      style={{ background: "var(--cream)" }}
    >
      <div className="container-main">
        {/* Header */}
        <div ref={headerRef} className="reveal mb-10 md:mb-14">
          <div className="grid md:grid-cols-2 gap-6 md:gap-20 items-end">
            <h2 className="font-display text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.05]">
              {services.headline}
            </h2>
            <p
              className="text-base md:text-lg leading-relaxed max-w-md"
              style={{ color: "var(--bark-light)" }}
            >
              {services.description}
            </p>
          </div>
        </div>

        {/* Featured service */}
        {featured && (
          <div className="mb-8">
            <div className="grid md:grid-cols-5 gap-0">
              <div
                className="md:col-span-3 p-8 md:p-12 lg:p-16 flex flex-col justify-center"
                style={{ background: "var(--sage)", color: "var(--pure-white)" }}
              >
                <span className="text-[0.625rem] font-bold tracking-widest uppercase mb-4 inline-block" style={{ color: "rgba(255,255,255,0.7)" }}>
                  Most Popular
                </span>
                <h3 className="font-display text-3xl md:text-4xl lg:text-5xl tracking-tight mb-4">
                  {featured.name}
                </h3>
                <p className="text-base leading-relaxed mb-6 opacity-90">
                  {featured.description}
                </p>
                {(featured.price || featured.duration) && (
                  <div className="flex items-center gap-6 mb-6">
                    {featured.price && (
                      <div>
                        <span className="font-display text-2xl md:text-3xl tracking-tight">
                          ${featured.price}
                        </span>
                      </div>
                    )}
                    {featured.price && featured.duration && (
                      <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.3)" }} />
                    )}
                    {featured.duration && (
                      <div>
                        <span className="text-sm opacity-80">{featured.duration}</span>
                      </div>
                    )}
                  </div>
                )}
                {featured.who_its_for && (
                  <p className="text-sm opacity-70 mb-6">
                    <span className="font-medium">Best for:</span> {featured.who_its_for}
                  </p>
                )}
                {featured.vagaro_link ? (
                  <a
                    href={featured.vagaro_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex text-xs font-bold tracking-widest uppercase px-6 py-3 transition-all duration-300 self-start"
                    style={{ background: "var(--pure-white)", color: "var(--sage)" }}
                    onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
                      e.currentTarget.style.background = "var(--cream)";
                    }}
                    onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
                      e.currentTarget.style.background = "var(--pure-white)";
                    }}
                  >
                    Book This Session
                  </a>
                ) : (
                  <a
                    href="#booking"
                    className="inline-flex text-xs font-bold tracking-widest uppercase px-6 py-3 transition-all duration-300 self-start"
                    style={{ background: "var(--pure-white)", color: "var(--sage)" }}
                    onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
                      e.currentTarget.style.background = "var(--cream)";
                    }}
                    onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
                      e.currentTarget.style.background = "var(--pure-white)";
                    }}
                  >
                    Book This Session
                  </a>
                )}
              </div>
              <div
                className="md:col-span-2 p-8 md:p-12 flex flex-col justify-center"
                style={{ background: "var(--cream-dark)" }}
              >
                <h4 className="text-xs font-bold tracking-widest uppercase mb-6" style={{ color: "var(--bark-faded)" }}>
                  What to expect
                </h4>
                <ul className="space-y-4">
                  {[
                    "Brief consultation about your goals and areas of tension",
                    "Full-body assessment of your range of motion",
                    "Guided stretching with hands-on assistance",
                    "Personalized plan for ongoing sessions",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[0.625rem] font-bold mt-0.5" style={{ background: "var(--sage)", color: "var(--pure-white)" }}>
                        {i + 1}
                      </span>
                      <span className="text-sm leading-relaxed" style={{ color: "var(--bark-light)" }}>
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Other services */}
        {others.length > 0 && (
          <div ref={gridRef} className="reveal">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {others.map((service, i) => (
                <div
                  key={service.id}
                  className={`p-8 reveal-delay-${Math.min(i + 1, 3)}`}
                  style={{ background: "var(--cream-dark)" }}
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <h3 className="font-display text-xl tracking-tight">
                      {service.name}
                    </h3>
                    {service.price && (
                      <div className="flex-shrink-0 text-right">
                        <span className="font-display text-xl tracking-tight" style={{ color: "var(--sage)" }}>
                          ${service.price}
                        </span>
                      </div>
                    )}
                  </div>
                  <p
                    className="text-sm leading-relaxed mb-4"
                    style={{ color: "var(--bark-light)" }}
                  >
                    {service.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: "var(--bark-faded)" }}>
                      {service.duration}
                    </span>
                    {service.vagaro_link ? (
                      <a
                        href={service.vagaro_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[0.5625rem] font-bold tracking-[0.15em] uppercase transition-opacity hover:opacity-60"
                        style={{ color: "var(--sage)" }}
                      >
                        Book Now &rarr;
                      </a>
                    ) : service.comingSoon ? (
                      <span
                        className="text-[0.5625rem] font-bold tracking-[0.15em] uppercase"
                        style={{ color: "var(--bark-faded)" }}
                      >
                        Coming Soon
                      </span>
                    ) : (
                      <a
                        href="#booking"
                        className="text-[0.5625rem] font-bold tracking-[0.15em] uppercase transition-opacity hover:opacity-60"
                        style={{ color: "var(--sage)" }}
                      >
                        Book Now &rarr;
                      </a>
                    )}
                  </div>
                  {service.who_its_for && (
                    <p className="text-xs mt-4 pt-4" style={{ color: "var(--bark-faded)", borderTop: "1px solid var(--cream-mid)" }}>
                      <span className="font-medium">Best for:</span> {service.who_its_for}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
