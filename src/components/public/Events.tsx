"use client";

import { useRef, useEffect } from "react";
import Image from "next/image";
import gsap from "gsap";
import "@/lib/lenis";
import { TrackedLink } from "./TrackedLink";
import type { EventsContent, EventItem, SiteSettings } from "@/lib/types";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const showYear = date.getFullYear() !== now.getFullYear();
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(showYear ? { year: "numeric" } : {}),
  });
}

function isUpcoming(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = new Date(dateStr + "T00:00:00");
  return eventDate >= today;
}

const HOST_LABELS: Record<EventItem["hosted_by"], string> = {
  owner: "Our Event",
  partner: "Partner Event",
  community: "Community Event",
};

export function Events({ events, settings }: { events: EventsContent; settings?: SiteSettings }) {
  const sectionRef = useRef<HTMLElement>(null);
  const upcomingEvents = events.events.filter((e) => isUpcoming(e.date));

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const heading = el.querySelector("[data-events-heading]");
      if (heading) {
        gsap.from(heading, {
          opacity: 0,
          y: 20,
          duration: 0.6,
          ease: "power3.out",
          scrollTrigger: { trigger: heading, start: "top 80%", once: true },
        });
      }

      const cards = el.querySelectorAll("[data-event-card]");
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

  return (
    <section id="events" ref={sectionRef} className="py-14 md:py-20" style={{ background: "var(--cream)" }}>
      <div className="container-main">
        <div>
          <h2 data-events-heading className="font-display text-4xl md:text-5xl tracking-tight mb-4">
            {events.headline}
          </h2>

          {upcomingEvents.length === 0 ? (
            <div className="py-12 text-center" style={{ background: "var(--cream-dark)" }}>
              <p className="font-display text-xl tracking-tight mb-2" style={{ color: "var(--bark)" }}>
                No upcoming events
              </p>
              <p className="text-sm" style={{ color: "var(--bark-faded)" }}>
                {settings?.instagramHandle ? (
                  <>
                    Follow{" "}
                    <a
                      href={`https://instagram.com/${settings.instagramHandle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium transition-opacity hover:opacity-60"
                      style={{ color: "var(--sage)" }}
                    >
                      @{settings.instagramHandle}
                    </a>{" "}
                    for updates on upcoming events and workshops.
                  </>
                ) : (
                  "Check back soon for upcoming events and workshops."
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-4 mt-8">
              {upcomingEvents
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((event) => (
                  <div
                    key={event.id}
                    data-event-card
                    className={`grid ${event.image_url ? "md:grid-cols-[160px_140px_1fr_auto]" : "md:grid-cols-[140px_1fr_auto]"} gap-4 md:gap-8 p-6 md:p-8 items-center overflow-hidden`}
                    style={{ background: "var(--cream-dark)" }}
                  >
                    {/* Event photo */}
                    {event.image_url && (
                      <div className="relative aspect-[4/3] md:aspect-square rounded-lg overflow-hidden">
                        <Image
                          src={event.image_url}
                          alt={event.title}
                          fill
                          className="object-cover"
                          sizes="160px"
                        />
                      </div>
                    )}

                    {/* Date */}
                    <div>
                      <p className="font-display text-xl tracking-tight" style={{ color: "var(--sage)" }} suppressHydrationWarning>
                        {formatDate(event.date)}
                      </p>
                      {event.time && (
                        <p className="text-xs mt-1" style={{ color: "var(--bark-faded)" }}>
                          {event.time}
                        </p>
                      )}
                    </div>

                    {/* Details */}
                    <div>
                      <h3 className="font-display text-lg tracking-tight mb-1">
                        {event.title}
                      </h3>
                      {event.description && (
                        <p className="text-sm leading-relaxed mb-2" style={{ color: "var(--bark-light)" }}>
                          {event.description}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: "var(--bark-faded)" }}>
                        {event.location && <span>{event.location}</span>}
                        <span style={{ color: "var(--cream-mid)" }}>·</span>
                        <span>{HOST_LABELS[event.hosted_by] || "Event"}</span>
                      </div>
                    </div>

                    {/* CTA */}
                    <div className="md:text-right">
                      {event.external_link ? (
                        <TrackedLink
                          href={event.external_link}
                          event="event-click"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[0.5625rem] font-bold tracking-[0.15em] uppercase transition-opacity hover:opacity-60"
                          style={{ color: "var(--sage)" }}
                        >
                          Details &rarr;
                        </TrackedLink>
                      ) : (
                        <span className="text-[0.5625rem] font-bold tracking-[0.15em] uppercase" style={{ color: "var(--bark-faded)" }}>
                          More info soon
                        </span>
                      )}
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
