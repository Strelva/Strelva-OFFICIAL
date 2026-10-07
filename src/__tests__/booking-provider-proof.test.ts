/** Opt-in proof on two explicitly disposable calendars. Never runs by default. */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createGoogleCalendarAdapter, createOutlookCalendarAdapter } from "@/products/scheduling/calendar/adapters";

const providers = ["google", "outlook"] as const;
const adapterFor = (provider: typeof providers[number]) => provider === "google" ? createGoogleCalendarAdapter : createOutlookCalendarAdapter;

describe("booking calendar provider failure contract", () => {
  it.each(providers)("preserves %s rate-limit evidence without retrying a write", async provider => {
    let calls = 0;
    const adapter = adapterFor(provider)({ fetch: async () => {
      calls++;
      return new Response('{"error":{"message":"rate limited"}}', { status: 429, headers: { "content-type": "application/json", "retry-after": "60" } });
    } });
    await expect(adapter.create({ accessToken: "fictional" }, {
      calendarId: "disposable-fixture", title: "Booking proof", start: "2026-11-05T15:00:00Z", end: "2026-11-05T15:30:00Z",
      timeZone: "America/New_York", idempotencyKey: "booking-proof-rate-limit",
    })).rejects.toMatchObject({ status: 429, retryable: true });
    expect(calls).toBe(1);
  });
});

// Credentials belong to a test account. The suite creates and deletes only its
// own uninvited event; no primary calendar, workspace or production access.
describe.runIf(process.env.STRELVA_BOOKING_PROVIDER_PROOF === "1")("booking disposable real-provider proof", () => {
  beforeAll(() => {
    for (const provider of providers) {
      const prefix = `BOOKING_PROOF_${provider.toUpperCase()}`;
      if (!process.env[`${prefix}_TOKEN`] || !process.env[`${prefix}_CALENDAR_ID`] || process.env[`${prefix}_CALENDAR_ID`] === "primary") {
        throw new Error(`Explicit disposable ${provider} calendar and test-account token required.`);
      }
    }
  });
  it.each(providers)("%s event read-back, stale etag refusal, deletion and revoked token", async provider => {
    const prefix = `BOOKING_PROOF_${provider.toUpperCase()}`;
    const adapter = adapterFor(provider)();
    const credentials = { accessToken: process.env[`${prefix}_TOKEN`]! };
    const input = {
      calendarId: process.env[`${prefix}_CALENDAR_ID`]!, title: "Strelva disposable booking proof",
      start: new Date(Date.now() + 7 * 86400000).toISOString(), end: new Date(Date.now() + 7 * 86400000 + 1800000).toISOString(),
      timeZone: "America/New_York", idempotencyKey: `booking-proof:${randomUUID()}`,
    };
    let eventId: string | null = null;
    try {
      const created = await adapter.create(credentials, input);
      eventId = created.id;
      const read = await adapter.get(credentials, { calendarId: input.calendarId, eventId });
      expect(read).toMatchObject({ id: eventId, title: input.title });
      expect(read?.versionTag).toBeTruthy();
      await expect(adapter.update(credentials, { ...input, eventId, versionTag: '"strelva-intentionally-stale"' })).rejects.toMatchObject({ status: 412, code: "conflict" });
      await expect(adapter.get({ accessToken: "intentionally-invalid-booking-proof" }, { calendarId: input.calendarId, eventId })).rejects.toMatchObject({ code: "unauthorized" });
      await adapter.remove(credentials, { calendarId: input.calendarId, eventId, versionTag: read!.versionTag });
      expect(await adapter.get(credentials, { calendarId: input.calendarId, eventId })).toBeNull();
      eventId = null;
    } finally {
      if (eventId) await adapter.remove(credentials, { calendarId: input.calendarId, eventId });
    }
  }, 60000);
});
