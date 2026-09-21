import { describe, expect, it, vi } from "vitest";
import { createGoogleCalendarAdapter, createOutlookCalendarAdapter, CalendarProviderError } from "@/products/scheduling/calendar/adapters";

const credentials = { accessToken: "fixture-access-token" };
const eventInput = {
  calendarId: "primary",
  title: "Roof inspection",
  start: "2026-09-20T13:00:00.000Z",
  end: "2026-09-20T14:00:00.000Z",
  timeZone: "America/New_York",
  idempotencyKey: "schedule:workspace:work:request-1",
  reminderPolicy: { mode: "provider_minutes" as const, minutes: 30 },
};

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

describe("calendar provider adapters", () => {
  it("creates and recovers an Outlook event with Graph transactionId without attendees", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("$filter=")) return json({ value: [{ id: "outlook-event-1", subject: "Roof inspection", start: { dateTime: "2026-09-20T13:00:00", timeZone: "UTC" }, end: { dateTime: "2026-09-20T14:00:00", timeZone: "UTC" } }] });
      return json({ id: "outlook-event-1", "@odata.etag": "W/\"1\"", subject: "Roof inspection", start: { dateTime: "2026-09-20T09:00:00", timeZone: "Eastern Standard Time" }, end: { dateTime: "2026-09-20T10:00:00", timeZone: "Eastern Standard Time" } }, 201);
    });
    const adapter = createOutlookCalendarAdapter({ fetch: fetcher, now: () => Date.parse("2026-09-20T15:00:00.000Z") });
    const created = await adapter.create(credentials, eventInput);
    expect(created).toMatchObject({ id: "outlook-event-1", title: "Roof inspection", calendarId: "primary" });
    expect(created.start).toBe("2026-09-20T13:00:00.000Z");
    expect(created.end).toBe("2026-09-20T14:00:00.000Z");
    expect(created.versionTag).toBe('W/"1"');
    expect(calls[0]?.init?.headers).toMatchObject({ Prefer: 'outlook.timezone="UTC"' });
    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body.transactionId).toBe(eventInput.idempotencyKey);
    expect(body.attendees).toBeUndefined();
    expect(body.start).toEqual({ dateTime: "2026-09-20T09:00:00", timeZone: "America/New_York" });
    const recovered = await adapter.findByIdempotencyKey(credentials, { calendarId: "primary", idempotencyKey: eventInput.idempotencyKey, timeZone: eventInput.timeZone });
    expect(recovered?.id).toBe("outlook-event-1");
    expect(calls[1]?.url).toContain("transactionId%20eq%20'schedule%3Aworkspace%3Awork%3Arequest-1'");
    expect(calls[1]?.init?.headers).toMatchObject({ Prefer: 'outlook.timezone="UTC"' });
  });

  it("uses Outlook calendarView for busy intervals and preserves a timeout as provider evidence", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => json({ value: [{ id: "busy-1", isCancelled: false, showAs: "busy", subject: "Existing", start: { dateTime: "2026-09-20T15:00:00", timeZone: "UTC" }, end: { dateTime: "2026-09-20T16:00:00", timeZone: "UTC" } }, { id: "free-1", isCancelled: false, showAs: "free", subject: "Free", start: { dateTime: "2026-09-20T17:00:00", timeZone: "UTC" }, end: { dateTime: "2026-09-20T18:00:00", timeZone: "UTC" } }] }));
    const adapter = createOutlookCalendarAdapter({ fetch: fetcher });
    const result = await adapter.availability(credentials, { calendarId: "primary", start: eventInput.start, end: eventInput.end, timeZone: eventInput.timeZone });
    expect(result.busy).toEqual([{ start: "2026-09-20T15:00:00.000Z", end: "2026-09-20T16:00:00.000Z", sourceId: "busy-1" }]);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ headers: { Prefer: 'outlook.timezone="UTC"' } });
    const offline = createOutlookCalendarAdapter({ fetch: async () => { throw new Error("offline"); } });
    await expect(offline.create(credentials, eventInput)).rejects.toMatchObject({ code: "timeout", retryable: true } satisfies Partial<CalendarProviderError>);
  });

  it("uses the Outlook etag for conditional updates", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.headers && String((init.headers as Record<string, string>)["If-Match"] || "").length) return json({ error: "changed elsewhere" }, 412);
      return json({ id: "event-1", subject: eventInput.title, start: { dateTime: "2026-09-20T09:00:00", timeZone: "Eastern Standard Time" }, end: { dateTime: "2026-09-20T10:00:00", timeZone: "Eastern Standard Time" } });
    });
    const adapter = createOutlookCalendarAdapter({ fetch: fetcher });
    await expect(adapter.update(credentials, { ...eventInput, eventId: "event-1", versionTag: 'W/"old"' })).rejects.toMatchObject({ code: "conflict", status: 412 } satisfies Partial<CalendarProviderError>);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ headers: expect.objectContaining({ "If-Match": 'W/"old"', Prefer: 'outlook.timezone="UTC"' }) });
  });

  it("follows every Outlook calendarView page before returning availability", async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      calls.push(String(url));
      if (calls.length === 1) {
        return json({
          value: [{ id: "busy-1", showAs: "busy", start: { dateTime: "2026-09-20T15:00:00", timeZone: "UTC" }, end: { dateTime: "2026-09-20T16:00:00", timeZone: "UTC" } }],
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/calendars/primary/calendarView?page=2",
        });
      }
      return json({
        value: [{ id: "busy-2", showAs: "busy", start: { dateTime: "2026-09-20T17:00:00", timeZone: "UTC" }, end: { dateTime: "2026-09-20T18:00:00", timeZone: "UTC" } }],
      });
    });
    const adapter = createOutlookCalendarAdapter({ fetch: fetcher });
    const result = await adapter.availability(credentials, { calendarId: "primary", start: eventInput.start, end: eventInput.end, timeZone: eventInput.timeZone });
    expect(result.busy.map(interval => interval.sourceId)).toEqual(["busy-1", "busy-2"]);
    expect(calls).toHaveLength(2);
  });

  it("creates a deterministic Google event id and recovers through GET before retry", async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(url)}`);
      if (String(url).includes("/events/") && (!init?.method || init.method === "GET")) {
        const id = String(url).split("/events/")[1]!.split("?")[0];
        return json({ id, summary: "Roof inspection", start: { dateTime: eventInput.start, timeZone: eventInput.timeZone }, end: { dateTime: eventInput.end, timeZone: eventInput.timeZone } });
      }
      const body = init?.body ? JSON.parse(String(init.body)) as { id?: string } : {};
      return json({ id: body.id, summary: "Roof inspection", start: { dateTime: eventInput.start, timeZone: eventInput.timeZone }, end: { dateTime: eventInput.end, timeZone: eventInput.timeZone } }, 200);
    });
    const adapter = createGoogleCalendarAdapter({ fetch: fetcher });
    const created = await adapter.create(credentials, eventInput);
    const requestBody = JSON.parse(String((fetcher.mock.calls[0]?.[1] as RequestInit).body));
    expect(requestBody.id).toMatch(/^strelva[a-f0-9]{64}$/);
    expect(requestBody.id).toBe(created.id);
    expect(requestBody.attendees).toBeUndefined();
    const recovered = await adapter.findByIdempotencyKey(credentials, { calendarId: "primary", idempotencyKey: eventInput.idempotencyKey, timeZone: eventInput.timeZone });
    expect(recovered?.id).toBe(created.id);
    expect(calls[1]).toContain(`/events/${created.id}`);
  });

  it("uses Google etags for conditional changes and surfaces a provider conflict", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.headers && String((init.headers as Record<string, string>)["If-Match"] || "").length) return json({ error: "changed elsewhere" }, 412);
      return json({ id: "event-1", etag: "\"new\"", summary: "Roof inspection", start: { dateTime: eventInput.start, timeZone: eventInput.timeZone }, end: { dateTime: eventInput.end, timeZone: eventInput.timeZone } });
    });
    const adapter = createGoogleCalendarAdapter({ fetch: fetcher });
    await expect(adapter.update(credentials, { ...eventInput, eventId: "event-1", versionTag: '"old"' })).rejects.toMatchObject({ code: "conflict", status: 412 } satisfies Partial<CalendarProviderError>);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ headers: expect.objectContaining({ "If-Match": '"old"' }) });
  });

  it("uses Google freeBusy and provider-native reminder modes", async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
      if (String(url).includes("/freeBusy")) return json({ calendars: { primary: { busy: [{ start: eventInput.start, end: eventInput.end }] } } });
      return json({ id: "strelva-event", summary: "Roof inspection", start: { dateTime: eventInput.start, timeZone: eventInput.timeZone }, end: { dateTime: eventInput.end, timeZone: eventInput.timeZone } });
    });
    const adapter = createGoogleCalendarAdapter({ fetch: fetcher });
    const availability = await adapter.availability(credentials, { calendarId: "primary", start: eventInput.start, end: eventInput.end, timeZone: eventInput.timeZone });
    expect(availability.busy).toEqual([{ start: eventInput.start, end: eventInput.end }]);
    await adapter.create(credentials, { ...eventInput, reminderPolicy: { mode: "provider_default" } });
    const body = JSON.parse(String((fetcher.mock.calls[1]?.[1] as RequestInit).body));
    expect(body.reminders).toEqual({ useDefault: true });
  });

  it("does not treat a Google freeBusy calendar error as an empty calendar", async () => {
    const fetcher = vi.fn(async () => json({
      calendars: {
        primary: {
          errors: [{ domain: "calendar", reason: "notFound" }],
          busy: [],
        },
      },
    }));
    const adapter = createGoogleCalendarAdapter({ fetch: fetcher });

    await expect(adapter.availability(credentials, {
      calendarId: "primary",
      start: eventInput.start,
      end: eventInput.end,
      timeZone: eventInput.timeZone,
    })).rejects.toMatchObject({
      code: "provider",
      retryable: true,
      message: expect.stringContaining("availability"),
    } satisfies Partial<CalendarProviderError>);
  });

  it("does not claim availability when Google omits the requested calendar result", async () => {
    const fetcher = vi.fn(async () => json({ calendars: {} }));
    const adapter = createGoogleCalendarAdapter({ fetch: fetcher });

    await expect(adapter.availability(credentials, {
      calendarId: "primary",
      start: eventInput.start,
      end: eventInput.end,
      timeZone: eventInput.timeZone,
    })).rejects.toMatchObject({
      code: "provider",
      retryable: true,
      message: expect.stringContaining("availability"),
    } satisfies Partial<CalendarProviderError>);
  });

  it("does not discard malformed Google busy intervals into an empty result", async () => {
    const fetcher = vi.fn(async () => json({
      calendars: {
        primary: {
          busy: [{ start: eventInput.start }],
        },
      },
    }));
    const adapter = createGoogleCalendarAdapter({ fetch: fetcher });

    await expect(adapter.availability(credentials, {
      calendarId: "primary",
      start: eventInput.start,
      end: eventInput.end,
      timeZone: eventInput.timeZone,
    })).rejects.toMatchObject({
      code: "provider",
      retryable: true,
      message: expect.stringContaining("availability"),
    } satisfies Partial<CalendarProviderError>);
  });

  it("uses complete Google event pages with stable source ids for reschedule availability", async () => {
    const urls: string[] = [];
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      urls.push(String(url));
      if (String(url).includes("pageToken=page-2")) {
        return json({ items: [{
          id: "series-instance-1",
          recurringEventId: "series-1",
          start: { dateTime: "2026-09-20T09:30:00", timeZone: "America/New_York" },
          end: { dateTime: "2026-09-20T10:30:00", timeZone: "America/New_York" },
        }] });
      }
      return json({
        items: [
          { id: "self-event", start: { dateTime: "2026-09-20T09:00:00", timeZone: "America/New_York" }, end: { dateTime: "2026-09-20T10:00:00", timeZone: "America/New_York" } },
          { id: "transparent-event", transparency: "transparent", start: { dateTime: "2026-09-20T09:00:00", timeZone: "America/New_York" }, end: { dateTime: "2026-09-20T10:00:00", timeZone: "America/New_York" } },
          { id: "cancelled-event", status: "cancelled", start: { dateTime: "2026-09-20T09:00:00", timeZone: "America/New_York" }, end: { dateTime: "2026-09-20T10:00:00", timeZone: "America/New_York" } },
          { id: "all-day-event", start: { date: "2026-09-20" }, end: { date: "2026-09-21" } },
        ],
        nextPageToken: "page-2",
      });
    });
    const adapter = createGoogleCalendarAdapter({ fetch: fetcher });
    const result = await adapter.availability(credentials, {
      calendarId: "primary",
      start: eventInput.start,
      end: eventInput.end,
      timeZone: eventInput.timeZone,
      ignoredEventId: "self-event",
    });
    expect(result.busy.map(interval => interval.sourceId)).toEqual(["self-event", "all-day-event", "series-instance-1"]);
    expect(result.busy.find(interval => interval.sourceId === "all-day-event")).toMatchObject({ start: "2026-09-20T04:00:00.000Z", end: "2026-09-21T04:00:00.000Z" });
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("singleEvents=true");
    expect(urls[0]).toContain("maxResults=2500");
    expect(urls[1]).toContain("pageToken=page-2");
  });
});
