import { createHash } from "node:crypto";
import { calendarEventSchema, type CalendarBusyInterval, type CalendarEvent, type CalendarEventInput } from "./contracts";
import type { CalendarAdapter, CalendarCredentials, ProviderCalendar } from "./adapters";

/**
 * Loopback-only synthetic provider used by the joined Auth/Postgres proof. It
 * has the same adapter boundary as Graph and Google, keeps external identity
 * outside the schedule payload, and never makes a network call.
 */
const events = new Map<string, CalendarEvent>();

function key(calendarId: string, eventId: string): string { return `${calendarId}:${eventId}`; }
function fixtureId(idempotencyKey: string): string { return `fixture-${createHash("sha256").update(idempotencyKey, "utf8").digest("hex").slice(0, 24)}`; }
function now(): string { return new Date().toISOString(); }
function requireToken(credentials: CalendarCredentials): void { if (!credentials.accessToken) throw new Error("fixture credentials missing"); }

export function createFixtureCalendarAdapter(provider: "outlook" | "google"): CalendarAdapter {
  return {
    provider,
    async listCalendars(credentials): Promise<ProviderCalendar[]> {
      requireToken(credentials);
      return [{ id: "fixture-calendar", name: `${provider === "outlook" ? "Outlook" : "Google Calendar"} fixture`, timeZone: "America/New_York", canEdit: true }];
    },
    async availability(credentials, query): Promise<{ busy: CalendarBusyInterval[]; observedAt: string }> {
      requireToken(credentials);
      const busy = [...events.values()].filter(event => event.calendarId === query.calendarId && Date.parse(event.start) < Date.parse(query.end) && Date.parse(event.end) > Date.parse(query.start)).map(event => ({ start: event.start, end: event.end, sourceId: event.id }));
      return { busy, observedAt: now() };
    },
    async create(credentials, input: CalendarEventInput): Promise<CalendarEvent> {
      requireToken(credentials);
      const event = calendarEventSchema.parse({ id: input.eventId ?? fixtureId(input.idempotencyKey), title: input.title, start: input.start, end: input.end, calendarId: input.calendarId, timeZone: input.timeZone, observedAt: now() });
      events.set(key(event.calendarId, event.id), event);
      return event;
    },
    async findByIdempotencyKey(credentials, input): Promise<CalendarEvent | null> {
      requireToken(credentials);
      return events.get(key(input.calendarId, fixtureId(input.idempotencyKey))) ?? null;
    },
    async get(credentials, input): Promise<CalendarEvent | null> {
      requireToken(credentials);
      return input.eventId ? events.get(key(input.calendarId, input.eventId)) ?? null : null;
    },
    async update(credentials, input): Promise<CalendarEvent> {
      requireToken(credentials);
      if (!input.eventId) throw new Error("fixture event id missing");
      const prior = events.get(key(input.calendarId, input.eventId));
      if (!prior) throw new Error("fixture event not found");
      const event = calendarEventSchema.parse({ ...prior, title: input.title, start: input.start, end: input.end, timeZone: input.timeZone, observedAt: now() });
      events.set(key(event.calendarId, event.id), event);
      return event;
    },
    async remove(credentials, input): Promise<{ id: string; observedAt: string }> {
      requireToken(credentials);
      if (!input.eventId) throw new Error("fixture event id missing");
      events.delete(key(input.calendarId, input.eventId));
      return { id: input.eventId, observedAt: now() };
    },
  };
}
