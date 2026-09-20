import { createHash } from "node:crypto";
import {
  calendarAvailabilityQuerySchema,
  calendarEventLookupSchema,
  calendarIdempotencyLookupSchema,
  calendarEventInputSchema,
  calendarEventSchema,
  calendarBusyIntervalSchema,
  calendarProviderSchema,
  type CalendarBusyInterval,
  type CalendarConnection,
  type CalendarEvent,
  type CalendarEventInput,
  type CalendarProvider,
} from "./contracts";

type JsonRecord = Record<string, unknown>;
type CalendarFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ProviderCalendar = {
  id: string;
  name: string;
  timeZone?: string;
  canEdit?: boolean;
};

export type CalendarCredentials = {
  accessToken: string;
  refreshToken?: string;
};

export class CalendarProviderError extends Error {
  readonly provider: CalendarProvider;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly code: "unauthorized" | "conflict" | "timeout" | "provider";

  constructor(input: {
    provider: CalendarProvider;
    message: string;
    status?: number | null;
    retryable?: boolean;
    code?: CalendarProviderError["code"];
  }) {
    super(input.message);
    this.name = "CalendarProviderError";
    this.provider = input.provider;
    this.status = input.status ?? null;
    this.retryable = input.retryable ?? false;
    this.code = input.code ?? "provider";
  }
}

export interface CalendarAdapter {
  readonly provider: CalendarProvider;
  listCalendars(credentials: CalendarCredentials): Promise<ProviderCalendar[]>;
  availability(credentials: CalendarCredentials, query: {
    calendarId: string;
    start: string;
    end: string;
    timeZone: string;
    ignoredEventId?: string;
  }): Promise<{ busy: CalendarBusyInterval[]; observedAt: string }>;
  create(credentials: CalendarCredentials, input: CalendarEventInput): Promise<CalendarEvent>;
  findByIdempotencyKey(credentials: CalendarCredentials, input: Pick<CalendarEventInput, "calendarId" | "idempotencyKey" | "timeZone">): Promise<CalendarEvent | null>;
  get(credentials: CalendarCredentials, input: Pick<CalendarEventInput, "calendarId" | "eventId" | "versionTag">): Promise<CalendarEvent | null>;
  update(credentials: CalendarCredentials, input: CalendarEventInput & { eventId: string }): Promise<CalendarEvent>;
  remove(credentials: CalendarCredentials, input: Pick<CalendarEventInput, "calendarId" | "eventId" | "versionTag">): Promise<{ id: string; observedAt: string }>;
}

function isoNow(now: () => number): string {
  return new Date(now()).toISOString();
}

function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
  } catch {
    throw new CalendarProviderError({ provider: "google", message: "The calendar timezone is invalid.", code: "provider" });
  }
}

const WINDOWS_TIME_ZONE_ALIASES: Record<string, string> = {
  "UTC": "UTC",
  "GMT Standard Time": "Europe/London",
  "W. Europe Standard Time": "Europe/Berlin",
  "Central Europe Standard Time": "Europe/Budapest",
  "Romance Standard Time": "Europe/Paris",
  "E. Europe Standard Time": "Europe/Bucharest",
  "FLE Standard Time": "Europe/Kyiv",
  "Russian Standard Time": "Europe/Moscow",
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "Pacific Standard Time": "America/Los_Angeles",
  "Alaskan Standard Time": "America/Anchorage",
  "Hawaiian Standard Time": "Pacific/Honolulu",
  "Canada Central Standard Time": "America/Regina",
  "Atlantic Standard Time": "America/Halifax",
  "Newfoundland Standard Time": "America/St_Johns",
  "Mexico Standard Time": "America/Mexico_City",
  "Central America Standard Time": "America/Guatemala",
  "SA Pacific Standard Time": "America/Bogota",
  "Venezuela Standard Time": "America/Caracas",
  "Paraguay Standard Time": "America/Asuncion",
  "Argentina Standard Time": "America/Argentina/Buenos_Aires",
  "E. South America Standard Time": "America/Sao_Paulo",
  "South Africa Standard Time": "Africa/Johannesburg",
  "Egypt Standard Time": "Africa/Cairo",
  "Israel Standard Time": "Asia/Jerusalem",
  "Arab Standard Time": "Asia/Riyadh",
  "Arabian Standard Time": "Asia/Dubai",
  "Turkey Standard Time": "Europe/Istanbul",
  "India Standard Time": "Asia/Kolkata",
  "West Asia Standard Time": "Asia/Tashkent",
  "SE Asia Standard Time": "Asia/Bangkok",
  "China Standard Time": "Asia/Shanghai",
  "Singapore Standard Time": "Asia/Singapore",
  "Tokyo Standard Time": "Asia/Tokyo",
  "Korea Standard Time": "Asia/Seoul",
  "Taipei Standard Time": "Asia/Taipei",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "New Zealand Standard Time": "Pacific/Auckland",
};

function resolveTimeZone(timeZone: string, provider: CalendarProvider): string {
  const resolved = WINDOWS_TIME_ZONE_ALIASES[timeZone] ?? timeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: resolved }).format();
  } catch {
    throw new CalendarProviderError({ provider, message: "The calendar returned an unsupported timezone; sync remains unresolved.", code: "provider" });
  }
  return resolved;
}

export function normalizeProviderTimeZone(timeZone: string, provider: CalendarProvider): string | undefined {
  try {
    return resolveTimeZone(timeZone, provider);
  } catch {
    return undefined;
  }
}

function offsetMinutes(timeZone: string, instant: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  const localAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return Math.round((localAsUtc - instant) / 60000);
}

function wallDateTimeToIso(value: string, timeZone: string, provider: CalendarProvider): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(value);
  if (!match) throw new CalendarProviderError({ provider, message: "The calendar returned an invalid event time; sync remains unresolved.", code: "provider" });
  const [, year, month, day, hour, minute, second, fraction = ""] = match;
  const millisecond = Number(`0.${fraction}`) * 1000;
  const wallAsUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), millisecond);
  if (!Number.isFinite(wallAsUtc)) throw new CalendarProviderError({ provider, message: "The calendar returned an invalid event time; sync remains unresolved.", code: "provider" });
  const resolvedTimeZone = resolveTimeZone(timeZone, provider);
  const firstOffset = offsetMinutes(resolvedTimeZone, wallAsUtc);
  const firstCandidate = wallAsUtc - firstOffset * 60000;
  const secondOffset = offsetMinutes(resolvedTimeZone, firstCandidate);
  return new Date(wallAsUtc - secondOffset * 60000).toISOString();
}

function normalizeProviderDateTime(value: string, timeZone: string, provider: CalendarProvider): string {
  if (/[zZ]|[+-]\d\d:\d\d$/.test(value)) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new CalendarProviderError({ provider, message: "The calendar returned an invalid event time; sync remains unresolved.", code: "provider" });
    return parsed.toISOString();
  }
  return wallDateTimeToIso(value, timeZone, provider);
}

function localDateTime(value: string, timeZone: string): string {
  assertTimeZone(timeZone);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Calendar event time is invalid.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
}

function providerError(provider: CalendarProvider, response: Response, body: unknown): CalendarProviderError {
  const status = response.status;
  const code = status === 401 || status === 403 ? "unauthorized" : status === 409 || status === 412 ? "conflict" : "provider";
  const retryable = status === 408 || status === 425 || status === 429 || status >= 500;
  const message = code === "unauthorized"
    ? "The calendar authorization is no longer valid. Reconnect the calendar before trying again."
    : code === "conflict"
      ? "The calendar provider rejected this change because the event changed elsewhere. Refresh before trying again."
      : retryable
        ? "The calendar provider did not confirm this change. The current sync state is preserved for recovery."
        : "The calendar provider rejected this request.";
  void body;
  return new CalendarProviderError({ provider, message, status, retryable, code });
}

async function readJson(response: Response): Promise<unknown> {
  const type = response.headers.get("content-type") || "";
  if (!type.toLowerCase().includes("json")) return null;
  return response.json().catch(() => null);
}

async function requestJson<T>(provider: CalendarProvider, fetcher: CalendarFetch, url: string, init: RequestInit = {}): Promise<T | null> {
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch {
    throw new CalendarProviderError({
      provider,
      message: "The calendar provider could not be reached. The sync remains unresolved.",
      retryable: true,
      code: "timeout",
    });
  }
  const body = await readJson(response);
  if (!response.ok) throw providerError(provider, response, body);
  return body as T | null;
}

type GraphCollectionPage = {
  value?: JsonRecord[];
  "@odata.nextLink"?: string;
};

type GoogleEventsPage = {
  items?: JsonRecord[];
  nextPageToken?: string;
};

async function requestGraphCollection(fetcher: CalendarFetch, url: string, headers: Record<string, string>): Promise<JsonRecord[]> {
  const values: JsonRecord[] = [];
  let nextUrl: string | undefined = url;
  let pageCount = 0;
  while (nextUrl) {
    pageCount += 1;
    if (pageCount > 100) {
      throw new CalendarProviderError({
        provider: "outlook",
        message: "The calendar provider did not return a complete availability result. Retry before booking.",
        retryable: true,
        code: "timeout",
      });
    }
    const page: GraphCollectionPage | null = await requestJson<GraphCollectionPage>("outlook", fetcher, nextUrl, { headers });
    values.push(...(page?.value ?? []));
    nextUrl = typeof page?.["@odata.nextLink"] === "string" && page["@odata.nextLink"] ? page["@odata.nextLink"] : undefined;
  }
  return values;
}

async function requestGoogleEvents(fetcher: CalendarFetch, url: string, headers: Record<string, string>): Promise<JsonRecord[]> {
  const values: JsonRecord[] = [];
  let nextUrl: string | undefined = url;
  let pageCount = 0;
  while (nextUrl) {
    pageCount += 1;
    if (pageCount > 100) {
      throw new CalendarProviderError({
        provider: "google",
        message: "The calendar provider did not return a complete availability result. Retry before booking.",
        retryable: true,
        code: "timeout",
      });
    }
    const page: GoogleEventsPage | null = await requestJson<GoogleEventsPage>("google", fetcher, nextUrl, { headers });
    values.push(...(page?.items ?? []));
    nextUrl = typeof page?.nextPageToken === "string" && page.nextPageToken
      ? `${url}&pageToken=${encodeURIComponent(page.nextPageToken)}`
      : undefined;
  }
  return values;
}

function authHeaders(credentials: CalendarCredentials, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${credentials.accessToken}`, Accept: "application/json", ...extra };
}

function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

function graphEvent(value: JsonRecord, calendarId: string, now: () => number, fallbackTimeZone = "UTC"): CalendarEvent {
  const start = value.start as JsonRecord | undefined;
  const end = value.end as JsonRecord | undefined;
  const startValue = typeof start?.dateTime === "string" ? start.dateTime : "";
  const endValue = typeof end?.dateTime === "string" ? end.dateTime : "";
  const startTimeZone = typeof start?.timeZone === "string" && start.timeZone ? start.timeZone : fallbackTimeZone;
  const endTimeZone = typeof end?.timeZone === "string" && end.timeZone ? end.timeZone : startTimeZone;
  const normalizedStartTimeZone = resolveTimeZone(startTimeZone, "outlook");
  return calendarEventSchema.parse({
    id: typeof value.id === "string" ? value.id : "",
    title: typeof value.subject === "string" && value.subject ? value.subject : "Calendar event",
    start: normalizeProviderDateTime(startValue, startTimeZone, "outlook"),
    end: normalizeProviderDateTime(endValue, endTimeZone, "outlook"),
    calendarId,
    timeZone: normalizedStartTimeZone,
    ...(typeof value["@odata.etag"] === "string" && value["@odata.etag"] ? { versionTag: value["@odata.etag"] } : {}),
    observedAt: isoNow(now),
  });
}

function googleEvent(value: JsonRecord, calendarId: string, now: () => number, fallbackTimeZone: string): CalendarEvent {
  const start = value.start as JsonRecord | undefined;
  const end = value.end as JsonRecord | undefined;
  const startTimeZone = typeof start?.timeZone === "string" && start.timeZone ? start.timeZone : fallbackTimeZone;
  const endTimeZone = typeof end?.timeZone === "string" && end.timeZone ? end.timeZone : startTimeZone;
  const normalizedStartTimeZone = resolveTimeZone(startTimeZone, "google");
  return calendarEventSchema.parse({
    id: typeof value.id === "string" ? value.id : "",
    title: typeof value.summary === "string" && value.summary ? value.summary : "Calendar event",
    start: typeof start?.dateTime === "string" ? normalizeProviderDateTime(start.dateTime, startTimeZone, "google") : "",
    end: typeof end?.dateTime === "string" ? normalizeProviderDateTime(end.dateTime, endTimeZone, "google") : "",
    calendarId,
    timeZone: normalizedStartTimeZone,
    ...(typeof value.etag === "string" && value.etag ? { versionTag: value.etag } : {}),
    observedAt: isoNow(now),
  });
}

function googleDateOnlyToIso(value: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new CalendarProviderError({ provider: "google", message: "The calendar returned an invalid all-day event; sync remains unresolved.", code: "provider" });
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (!daysInMonth || day < 1 || day > daysInMonth) {
    throw new CalendarProviderError({ provider: "google", message: "The calendar returned an invalid all-day event; sync remains unresolved.", code: "provider" });
  }
  return wallDateTimeToIso(`${value}T00:00:00`, timeZone, "google");
}

function googleBusyEvent(value: JsonRecord, fallbackTimeZone: string): CalendarBusyInterval {
  const id = typeof value.id === "string" && value.id ? value.id : undefined;
  if (!id) throw new CalendarProviderError({ provider: "google", message: "The calendar returned an event without an identity; sync remains unresolved.", code: "provider" });
  const start = value.start as JsonRecord | undefined;
  const end = value.end as JsonRecord | undefined;
  const startTimeZone = typeof start?.timeZone === "string" && start.timeZone ? start.timeZone : fallbackTimeZone;
  const endTimeZone = typeof end?.timeZone === "string" && end.timeZone ? end.timeZone : startTimeZone;
  const startValue = typeof start?.dateTime === "string"
    ? normalizeProviderDateTime(start.dateTime, startTimeZone, "google")
    : typeof start?.date === "string" ? googleDateOnlyToIso(start.date, startTimeZone) : "";
  const endValue = typeof end?.dateTime === "string"
    ? normalizeProviderDateTime(end.dateTime, endTimeZone, "google")
    : typeof end?.date === "string" ? googleDateOnlyToIso(end.date, endTimeZone) : "";
  return calendarBusyIntervalSchema.parse({ start: startValue, end: endValue, sourceId: id });
}

function googleFreeBusyError(): CalendarProviderError {
  return new CalendarProviderError({
    provider: "google",
    message: "The calendar provider did not return a complete availability result. Retry before booking.",
    retryable: true,
    code: "provider",
  });
}

function googleFreeBusyIntervals(body: unknown, calendarId: string): CalendarBusyInterval[] {
  const response = body && typeof body === "object" && !Array.isArray(body) ? body as JsonRecord : null;
  const calendars = response?.calendars;
  const calendarMap = calendars && typeof calendars === "object" && !Array.isArray(calendars) ? calendars as JsonRecord : null;
  const calendar = calendarMap?.[calendarId];
  const calendarRecord = calendar && typeof calendar === "object" && !Array.isArray(calendar) ? calendar as JsonRecord : null;
  if (!calendarRecord) throw googleFreeBusyError();

  const errors = calendarRecord.errors;
  if (errors !== undefined && (!Array.isArray(errors) || errors.length > 0)) throw googleFreeBusyError();

  const busy = calendarRecord.busy;
  if (!Array.isArray(busy)) throw googleFreeBusyError();
  try {
    return busy.map(value => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("busy interval is not an object");
      const interval = value as JsonRecord;
      if (typeof interval.start !== "string" || typeof interval.end !== "string") throw new Error("busy interval has no complete time range");
      return calendarBusyIntervalSchema.parse({ start: interval.start, end: interval.end });
    });
  } catch {
    throw googleFreeBusyError();
  }
}

function googleEventId(idempotencyKey: string): string {
  // Google permits lower-case base32hex characters and digits in caller IDs.
  // SHA-256 hex stays within that alphabet and makes the identity stable across
  // retries without exposing workspace/request text to the provider.
  return `strelva${createHash("sha256").update(idempotencyKey, "utf8").digest("hex")}`;
}

function outlookReminder(policy: CalendarEventInput["reminderPolicy"]): JsonRecord {
  if (policy.mode === "off") return { isReminderOn: false };
  if (policy.mode === "provider_default") return { isReminderOn: true };
  return { isReminderOn: true, reminderMinutesBeforeStart: policy.minutes };
}

function googleReminder(policy: CalendarEventInput["reminderPolicy"]): JsonRecord {
  if (policy.mode === "off") return { reminders: { useDefault: false, overrides: [] } };
  if (policy.mode === "provider_default") return { reminders: { useDefault: true } };
  return { reminders: { useDefault: false, overrides: [{ method: "popup", minutes: policy.minutes }] } };
}

export function createOutlookCalendarAdapter(options: { fetch?: CalendarFetch; now?: () => number } = {}): CalendarAdapter {
  // Graph semantics verified against the primary docs on 2026-09-20: event
  // creation and response timezone selection use Prefer
  // (https://learn.microsoft.com/en-us/graph/api/user-post-events?view=graph-rest-1.0),
  // and calendarView results must follow @odata.nextLink pagination
  // (https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0).
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const provider = "outlook" as const;
  const base = "https://graph.microsoft.com/v1.0";
  const calendarUrl = (calendarId: string, suffix = "") => `${base}/me/calendars/${pathSegment(calendarId)}${suffix}`;
  const eventUrl = (calendarId: string, eventId: string) => calendarUrl(calendarId, `/events/${pathSegment(eventId)}`);
  const headers = (credentials: CalendarCredentials, extra: Record<string, string> = {}) => authHeaders(credentials, extra);
  return {
    provider,
    async listCalendars(credentials) {
      const values = await requestGraphCollection(fetcher, `${base}/me/calendars?$top=100`, headers(credentials));
      return values.flatMap(value => {
        if (typeof value.id !== "string" || typeof value.name !== "string") return [];
        const timeZone = typeof value.timeZone === "string" ? normalizeProviderTimeZone(value.timeZone, provider) : undefined;
        return [{ id: value.id, name: value.name, timeZone, canEdit: value.canEdit !== false }];
      });
    },
    async availability(credentials, query) {
      const input = calendarAvailabilityQuerySchema.parse(query);
      const url = `${calendarUrl(input.calendarId, "/calendarView")}?startDateTime=${encodeURIComponent(input.start)}&endDateTime=${encodeURIComponent(input.end)}&$top=100`;
      const values = await requestGraphCollection(fetcher, url, headers(credentials, { Prefer: `outlook.timezone="UTC"` }));
      const busy = values.flatMap(value => {
        if (value.isCancelled === true || value.showAs === "free") return [];
        const event = graphEvent(value, input.calendarId, now);
        return [{ start: event.start, end: event.end, sourceId: event.id }];
      });
      return { busy, observedAt: isoNow(now) };
    },
    async create(credentials, input) {
      const value = calendarEventInputSchema.parse(input);
      const body = await requestJson<JsonRecord>(provider, fetcher, `${calendarUrl(value.calendarId, "/events")}`, {
        method: "POST",
        headers: headers(credentials, { "Content-Type": "application/json", Prefer: `outlook.timezone="UTC"`, ...(value.versionTag ? { "If-Match": value.versionTag } : {}) }),
        body: JSON.stringify({
          subject: value.title,
          start: { dateTime: localDateTime(value.start, value.timeZone), timeZone: value.timeZone },
          end: { dateTime: localDateTime(value.end, value.timeZone), timeZone: value.timeZone },
          transactionId: value.idempotencyKey,
          ...outlookReminder(value.reminderPolicy),
        }),
      });
      return graphEvent(body ?? {}, value.calendarId, now, "UTC");
    },
    async findByIdempotencyKey(credentials, input) {
      const value = calendarIdempotencyLookupSchema.parse(input);
      const filter = encodeURIComponent(`transactionId eq '${value.idempotencyKey.replaceAll("'", "''")}'`);
      const values = await requestGraphCollection(fetcher, `${calendarUrl(value.calendarId, `/events?$filter=${filter}&$top=2`)}`, headers(credentials, { Prefer: `outlook.timezone="UTC"` }));
      const event = values[0];
      return event ? graphEvent(event, value.calendarId, now, "UTC") : null;
    },
    async get(credentials, input) {
      const value = calendarEventLookupSchema.parse(input);
      if (!value.eventId) return null;
      try {
        const body = await requestJson<JsonRecord>(provider, fetcher, eventUrl(value.calendarId, value.eventId), { headers: headers(credentials, { Prefer: `outlook.timezone="UTC"` }) });
        return body ? graphEvent(body, value.calendarId, now, "UTC") : null;
      } catch (cause) {
        if (cause instanceof CalendarProviderError && cause.status === 404) return null;
        throw cause;
      }
    },
    async update(credentials, input) {
      const value = calendarEventInputSchema.parse(input);
      if (!value.eventId) throw new Error("An external calendar event is required to update a reservation.");
      const body = await requestJson<JsonRecord>(provider, fetcher, eventUrl(value.calendarId, value.eventId), {
        method: "PATCH",
        headers: headers(credentials, { "Content-Type": "application/json", Prefer: `outlook.timezone="UTC"`, ...(value.versionTag ? { "If-Match": value.versionTag } : {}) }),
        body: JSON.stringify({
          subject: value.title,
          start: { dateTime: localDateTime(value.start, value.timeZone), timeZone: value.timeZone },
          end: { dateTime: localDateTime(value.end, value.timeZone), timeZone: value.timeZone },
          ...outlookReminder(value.reminderPolicy),
        }),
      });
      return graphEvent(body ?? {}, value.calendarId, now, "UTC");
    },
    async remove(credentials, input) {
      const value = calendarEventLookupSchema.parse(input);
      if (!value.eventId) throw new Error("An external calendar event is required to cancel a reservation.");
      await requestJson<null>(provider, fetcher, eventUrl(value.calendarId, value.eventId), { method: "DELETE", headers: headers(credentials, value.versionTag ? { "If-Match": value.versionTag } : {}) });
      return { id: value.eventId, observedAt: isoNow(now) };
    },
  };
}

export function createGoogleCalendarAdapter(options: { fetch?: CalendarFetch; now?: () => number } = {}): CalendarAdapter {
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const provider = "google" as const;
  const base = "https://www.googleapis.com/calendar/v3";
  const calendarUrl = (calendarId: string, suffix = "") => `${base}/calendars/${pathSegment(calendarId)}${suffix}`;
  const eventUrl = (calendarId: string, eventId: string) => calendarUrl(calendarId, `/events/${pathSegment(eventId)}`);
  const headers = (credentials: CalendarCredentials, extra: Record<string, string> = {}) => authHeaders(credentials, extra);
  return {
    provider,
    async listCalendars(credentials) {
      const body = await requestJson<{ items?: JsonRecord[] }>(provider, fetcher, `${base}/users/me/calendarList?maxResults=250`, { headers: headers(credentials) });
      return (body?.items ?? []).flatMap(value => typeof value.id === "string" && typeof value.summary === "string" ? [{ id: value.id, name: value.summary, timeZone: typeof value.timeZone === "string" ? value.timeZone : undefined, canEdit: value.accessRole === "owner" || value.accessRole === "writer" }] : []);
    },
    async availability(credentials, query) {
      const input = calendarAvailabilityQuerySchema.parse(query);
      if (input.ignoredEventId) {
        const eventsUrl = `${calendarUrl(input.calendarId, "/events")}?timeMin=${encodeURIComponent(input.start)}&timeMax=${encodeURIComponent(input.end)}&singleEvents=true&showDeleted=false&maxResults=2500&timeZone=${encodeURIComponent(input.timeZone)}`;
        const values = await requestGoogleEvents(fetcher, eventsUrl, headers(credentials));
        const busy = values.flatMap(value => value.status === "cancelled" || value.transparency === "transparent" ? [] : [googleBusyEvent(value, input.timeZone)]);
        return { busy, observedAt: isoNow(now) };
      }
      const body = await requestJson<unknown>(provider, fetcher, `${base}/freeBusy`, {
        method: "POST",
        headers: headers(credentials, { "Content-Type": "application/json" }),
        body: JSON.stringify({ timeMin: input.start, timeMax: input.end, timeZone: input.timeZone, items: [{ id: input.calendarId }] }),
      });
      const busy = googleFreeBusyIntervals(body, input.calendarId);
      return { busy, observedAt: isoNow(now) };
    },
    async create(credentials, input) {
      const value = calendarEventInputSchema.parse(input);
      const id = value.eventId ?? googleEventId(value.idempotencyKey);
      const body = await requestJson<JsonRecord>(provider, fetcher, `${calendarUrl(value.calendarId, "/events?sendUpdates=none")}`, {
        method: "POST",
        headers: headers(credentials, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          id,
          summary: value.title,
          start: { dateTime: value.start, timeZone: value.timeZone },
          end: { dateTime: value.end, timeZone: value.timeZone },
          ...googleReminder(value.reminderPolicy),
        }),
      });
      return googleEvent(body ?? {}, value.calendarId, now, value.timeZone);
    },
    async findByIdempotencyKey(credentials, input) {
      const value = calendarIdempotencyLookupSchema.parse(input);
      return this.get(credentials, { calendarId: value.calendarId, eventId: googleEventId(value.idempotencyKey) });
    },
    async get(credentials, input) {
      const value = calendarEventLookupSchema.parse(input);
      if (!value.eventId) return null;
      try {
        const body = await requestJson<JsonRecord>(provider, fetcher, eventUrl(value.calendarId, value.eventId), { headers: headers(credentials) });
        return body ? googleEvent(body, value.calendarId, now, "UTC") : null;
      } catch (cause) {
        if (cause instanceof CalendarProviderError && cause.status === 404) return null;
        throw cause;
      }
    },
    async update(credentials, input) {
      const value = calendarEventInputSchema.parse(input);
      if (!value.eventId) throw new Error("An external calendar event is required to update a reservation.");
      const body = await requestJson<JsonRecord>(provider, fetcher, eventUrl(value.calendarId, value.eventId), {
        method: "PATCH",
        headers: headers(credentials, { "Content-Type": "application/json", ...(value.versionTag ? { "If-Match": value.versionTag } : {}) }),
        body: JSON.stringify({
          summary: value.title,
          start: { dateTime: value.start, timeZone: value.timeZone },
          end: { dateTime: value.end, timeZone: value.timeZone },
          ...googleReminder(value.reminderPolicy),
        }),
      });
      return googleEvent(body ?? {}, value.calendarId, now, value.timeZone);
    },
    async remove(credentials, input) {
      const value = calendarEventLookupSchema.parse(input);
      if (!value.eventId) throw new Error("An external calendar event is required to cancel a reservation.");
      await requestJson<null>(provider, fetcher, eventUrl(value.calendarId, value.eventId), { method: "DELETE", headers: headers(credentials, value.versionTag ? { "If-Match": value.versionTag } : {}) });
      return { id: value.eventId, observedAt: isoNow(now) };
    },
  };
}

export function createCalendarAdapter(provider: CalendarProvider, options: { fetch?: CalendarFetch; now?: () => number } = {}): CalendarAdapter {
  const parsed = calendarProviderSchema.parse(provider);
  return parsed === "outlook" ? createOutlookCalendarAdapter(options) : createGoogleCalendarAdapter(options);
}

export function providerConnectionCredentials(connection: CalendarConnection & { accessToken?: string; refreshToken?: string }): CalendarCredentials {
  if (!connection.accessToken) throw new CalendarProviderError({ provider: connection.provider, message: "The calendar connection has no usable authorization.", code: "unauthorized" });
  return { accessToken: connection.accessToken, refreshToken: connection.refreshToken };
}
