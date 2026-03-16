"use client";

import { useReveal } from "@/hooks/useReveal";
import type { EventsContent, EventItem } from "@/lib/types";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function isUpcoming(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = new Date(dateStr + "T00:00:00");
  return eventDate >= today;
}

const HOST_LABELS: Record<EventItem["hosted_by"], string> = {
  chelsea: "Hosted by Chelsea",
  partner: "Partner Event",
  community: "Community Event",
};

export function Events({ events }: { events: EventsContent }) {
  const sectionRef = useReveal();
  const upcomingEvents = events.events.filter((e) => isUpcoming(e.date));

  return (
    <section id="events" className="py-14 md:py-20" style={{ background: "var(--cream)" }}>
      <div className="container-main">
        <div ref={sectionRef} className="reveal">
          <h2 className="font-display text-4xl md:text-5xl tracking-tight mb-4">
            {events.headline}
          </h2>

          {upcomingEvents.length === 0 ? (
            <div className="py-12 text-center" style={{ background: "var(--cream-dark)" }}>
              <p className="font-display text-xl tracking-tight mb-2" style={{ color: "var(--bark)" }}>
                No upcoming events
              </p>
              <p className="text-sm" style={{ color: "var(--bark-faded)" }}>
                Follow{" "}
                <a
                  href="https://instagram.com/rohlaxwellness"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium transition-opacity hover:opacity-60"
                  style={{ color: "var(--sage)" }}
                >
                  @rohlaxwellness
                </a>{" "}
                for updates on upcoming events and workshops.
              </p>
            </div>
          ) : (
            <div className="space-y-4 mt-8">
              {upcomingEvents
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((event) => (
                  <div
                    key={event.id}
                    className="grid md:grid-cols-[140px_1fr_auto] gap-4 md:gap-8 p-6 md:p-8 items-center"
                    style={{ background: "var(--cream-dark)" }}
                  >
                    {/* Date */}
                    <div>
                      <p className="font-display text-xl tracking-tight" style={{ color: "var(--sage)" }}>
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
                        <span>{HOST_LABELS[event.hosted_by]}</span>
                      </div>
                    </div>

                    {/* CTA */}
                    <div className="md:text-right">
                      {event.external_link ? (
                        <a
                          href={event.external_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[0.5625rem] font-bold tracking-[0.15em] uppercase transition-opacity hover:opacity-60"
                          style={{ color: "var(--sage)" }}
                        >
                          Details &rarr;
                        </a>
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
