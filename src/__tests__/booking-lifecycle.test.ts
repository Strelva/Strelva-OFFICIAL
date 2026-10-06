import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SendEmailInput } from "@/platform/infra/email/send";
import { runBookingLifecycle, type BookingLifecyclePorts } from "@/platform/bookings/lifecycle";
import { customerReminderEmail, ownerRequestReminderEmail, requestLapsedEmail } from "@/platform/bookings/emails";
import { bookingRequestAdapter, bookingRequestGoneReason } from "@/platform/bookings/needs-you-adapter";
import { bookingRemindersEnabled } from "@/platform/bookings/flags";
import type { StoreBooking } from "@/platform/bookings/store";

const NOW = new Date("2026-11-02T12:00:00.000Z");

function booking(over: Partial<StoreBooking> = {}): StoreBooking {
  return {
    id: "b1", calendarKey: "c1", tenantStableId: "c1", tenantId: "mooney", workspaceId: "ws-1", systemId: null,
    status: "confirmed", origin: "site", serviceRef: "svc", businessServiceId: null, serviceName: "Consultation",
    start: "2026-11-03T15:00:00.000Z", end: "2026-11-03T15:30:00.000Z", bufferMinutes: 0, timeZone: "America/New_York",
    localDate: "2026-11-03", localStart: "10:00", localEnd: "10:30",
    customer: { name: "Dana Reed", email: "dana@example.test" }, contactId: null, intakeAnswers: {}, inquiryId: null,
    legacyId: "bk_1", publicReservationId: null, externalSource: null, externalRef: null, recordedVia: "native",
    createdAt: "2026-10-20T00:00:00.000Z", cancelledAt: null, ...over,
  };
}

function ports(over: Partial<BookingLifecyclePorts> = {}) {
  const sent: SendEmailInput[] = [];
  const finished: Array<[string, string, string | null, string | null]> = [];
  const p: BookingLifecyclePorts = {
    expireHolds: vi.fn(async () => 0),
    lapseRequests: vi.fn(async () => []),
    claim: vi.fn(async () => []),
    finish: vi.fn(async (id, status, provider, detail) => { finished.push([id, status, provider, detail]); }),
    business: vi.fn(async () => ({ name: "The Mooney Firm", tenantId: "mooney", ownerEmail: "owner@mooney.example", siteUrl: "https://attymooney.example" })),
    alternatives: vi.fn(async () => ["Wed, Nov 4 at 9:00 AM", "Wed, Nov 4 at 9:30 AM"]),
    manageUrl: vi.fn(async () => null),
    send: vi.fn(async (input: SendEmailInput) => {
      sent.push(input);
      return { status: "accepted" as const, providerMessageId: `msg_${sent.length}`, acceptedAt: NOW.toISOString() };
    }),
    appOrigin: "https://app.strelva.example",
    ...over,
  };
  return { p, sent, finished };
}

describe("booking lifecycle run", () => {
  it("sweeps holds, lapses requests with new times, and sends each due reminder once through the one send path", async () => {
    const { p, sent, finished } = ports({
      expireHolds: vi.fn(async () => 2),
      lapseRequests: vi.fn(async () => [
        { messageId: "m-lapse", booking: booking({ id: "b-req", status: "declined", localDate: "2026-11-12", localStart: "14:00" }) },
        { messageId: null, booking: booking({ id: "b-req-noemail", status: "declined", customer: { name: "No Email" } }) },
      ]),
      claim: vi.fn(async () => [
        { messageId: "m-24", kind: "reminder_24h" as const, booking: booking({ publicReservationId: "r1" }) },
        { messageId: "m-owner", kind: "request_owner_reminder" as const, booking: booking({ id: "b-wait", status: "requested" }) },
      ]),
      manageUrl: vi.fn(async (b: StoreBooking) => (b.publicReservationId ? "https://app.strelva.example/b/tok" : null)),
    });
    const summary = await runBookingLifecycle(p, { now: NOW });
    expect(summary).toMatchObject({ holdsExpired: 2, requestsLapsed: 2, claimed: 3, sent: 3, failed: 0, skipped: 0, errors: [] });

    const lapse = sent.find((s) => s.idempotencyKey === "booking-message:m-lapse")!;
    expect(lapse).toMatchObject({ audience: "customer", to: "dana@example.test", fromName: "The Mooney Firm", fromAddress: "bookings@mail.strelva.com" });
    expect(lapse.subject).toBe("Your request for Thu, Nov 12 at 2:00 PM wasn't confirmed");
    expect(lapse.options?.bullets?.map((b) => b.title)).toEqual(["Wed, Nov 4 at 9:00 AM", "Wed, Nov 4 at 9:30 AM"]);
    expect(lapse.options?.button?.url).toBe("https://attymooney.example");

    const reminder = sent.find((s) => s.idempotencyKey === "booking-message:m-24")!;
    expect(reminder).toMatchObject({ audience: "customer", to: "dana@example.test", fromAddress: "bookings@mail.strelva.com" });
    expect(reminder.subject).toBe("Reminder: Consultation with The Mooney Firm, Tue, Nov 3 at 10:00 AM");
    expect(reminder.options?.button).toEqual({ label: "Change or cancel", url: "https://app.strelva.example/b/tok" });

    const owner = sent.find((s) => s.idempotencyKey === "booking-message:m-owner")!;
    // The owner reminder is client mail: tenant-aware gate, the owner recipient, a link to Bookings.
    expect(owner).toMatchObject({ audience: "client", tenantId: "mooney", to: "owner@mooney.example" });
    expect(owner.fromAddress).toBeUndefined();
    expect(owner.options?.button?.url).toBe("https://app.strelva.example/workspace/bookings?view=week&date=2026-11-03&workspaceId=ws-1");

    expect(finished).toEqual(expect.arrayContaining([
      ["m-lapse", "sent", "msg_1", null],
      ["m-24", "sent", "msg_2", null],
      ["m-owner", "sent", "msg_3", null],
    ]));
    // A lapsed request with no address has nothing to send.
    expect(sent.some((s) => s.to === undefined)).toBe(false);
  });

  it("records a gated send as suppressed and a provider error as failed, and never resends either", async () => {
    let call = 0;
    const { p, finished } = ports({
      claim: vi.fn(async () => [
        { messageId: "m-a", kind: "reminder_2h" as const, booking: booking() },
        { messageId: "m-b", kind: "reminder_24h" as const, booking: booking({ id: "b2" }) },
      ]),
      send: vi.fn(async () => {
        call += 1;
        if (call === 1) return { status: "suppressed" as const, reason: "email_suppressed_or_unconfigured" };
        throw new Error("Resend timed out");
      }),
    });
    const summary = await runBookingLifecycle(p, { now: NOW });
    expect(summary).toMatchObject({ sent: 0, suppressed: 1, failed: 1 });
    expect(finished).toEqual([
      ["m-a", "suppressed", null, "email_suppressed_or_unconfigured"],
      ["m-b", "failed", null, "Resend timed out"],
    ]);
    expect(p.send).toHaveBeenCalledTimes(2);
  });

  it("skips what it cannot send honestly: no owner recipient, unknown business, a booking no longer confirmed", async () => {
    const { p, sent, finished } = ports({
      claim: vi.fn(async () => [
        { messageId: "m-1", kind: "request_owner_reminder" as const, booking: booking({ status: "requested", tenantId: "nobody" }) },
        { messageId: "m-2", kind: "reminder_24h" as const, booking: booking({ status: "cancelled" }) },
        { messageId: "m-3", kind: "reminder_2h" as const, booking: booking({ tenantId: null }) },
      ]),
      business: vi.fn(async (b: StoreBooking) => {
        if (b.tenantId === null) return null;
        return { name: "Mooney", tenantId: b.tenantId, ownerEmail: b.tenantId === "nobody" ? null : "o@x.example", siteUrl: null };
      }),
    });
    const summary = await runBookingLifecycle(p, { now: NOW });
    expect(summary).toMatchObject({ skipped: 3, sent: 0 });
    expect(sent).toEqual([]);
    expect(finished.map((f) => [f[0], f[1], f[3]])).toEqual([
      ["m-1", "skipped", "no_owner_recipient"],
      ["m-2", "skipped", "not_confirmed"],
      ["m-3", "skipped", "business_unknown"],
    ]);
  });

  it("keeps going when one step's store call fails, and reports it", async () => {
    const { p, sent } = ports({
      expireHolds: vi.fn(async () => { throw new Error("booking_store_timeout"); }),
      lapseRequests: vi.fn(async () => { throw new Error("booking_store_failed"); }),
      claim: vi.fn(async () => [{ messageId: "m-1", kind: "reminder_24h" as const, booking: booking() }]),
      alternatives: vi.fn(async () => { throw new Error("no"); }),
    });
    const summary = await runBookingLifecycle(p, { now: NOW });
    expect(summary.errors).toEqual(["holds: booking_store_timeout", "lapse: booking_store_failed"]);
    expect(summary.sent).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it("offers no times when none can be read, and still tells the customer", async () => {
    const { p, sent } = ports({
      lapseRequests: vi.fn(async () => [{ messageId: "m-l", booking: booking({ status: "declined" }) }]),
      alternatives: vi.fn(async () => { throw new Error("store down"); }),
      business: vi.fn(async () => ({ name: "", tenantId: "mooney", ownerEmail: null, siteUrl: null })),
    });
    await runBookingLifecycle(p, { now: NOW });
    expect(sent[0]!.options?.bullets).toBeUndefined();
    expect(sent[0]!.options?.paragraphs?.[1]).toBe("Pick another time on the website, or reply to this email to reach the business.");
    expect(sent[0]!.fromName).toBe("Strelva");
  });
});

describe("booking emails", () => {
  it("says what changed and what the customer can do, in the booking's own time", () => {
    const soon = customerReminderEmail({ booking: booking({ localStart: "14:30" }), kind: "reminder_2h", businessName: "Mooney", manageUrl: null });
    expect(soon.subject).toBe("Today at 2:30 PM: Consultation with Mooney");
    expect(soon.options.paragraphs?.[1]).toBe("Need to change or cancel? Reply to this email and the business will help.");
    expect(soon.options.button).toBeUndefined();
    const owner = ownerRequestReminderEmail({ booking: booking({ status: "requested" }), businessName: "Mooney", openUrl: "https://x" });
    expect(owner.subject).toBe("Still waiting on you: Dana Reed, Tue, Nov 3 10:00 AM");
    expect(owner.options.paragraphs?.join(" ")).toContain("never confirmed by silence");
    const lapsed = requestLapsedEmail({ booking: booking(), businessName: "Mooney", alternatives: ["a", "b", "c", "d"], bookAgainUrl: null });
    expect(lapsed.options.bullets).toHaveLength(3);
    expect(lapsed.options.button).toBeUndefined();
  });
});

describe("booking request clock in Needs you", () => {
  it("names why a request stopped waiting", () => {
    expect(bookingRequestGoneReason({ ...booking({ status: "requested" }), lastChange: null })).toBeNull();
    expect(bookingRequestGoneReason({ ...booking({ status: "declined" }), lastChange: { actor: "system", reason: "Expired: the owner did not answer in 72 hours" } }))
      .toBe("Expired, nothing confirmed: no answer in 72 hours. The customer was told and offered other times.");
    expect(bookingRequestGoneReason({ ...booking({ status: "declined" }), lastChange: { actor: "owner", reason: "Owner said not yet" } })).toBe("Already declined.");
    expect(bookingRequestGoneReason({ ...booking({ status: "cancelled" }), lastChange: { actor: "visitor", reason: null } })).toBe("The customer cancelled the request.");
    expect(bookingRequestGoneReason({ ...booking({ status: "confirmed" }), lastChange: null })).toBe("Already confirmed.");
    expect(bookingRequestGoneReason(null)).toBeNull();
  });

  it("the adapter reads the booking for its own business only", async () => {
    const read = vi.fn(async (ws: string) => (ws === "ws-1" ? { ...booking({ status: "declined" }), lastChange: { actor: "system", reason: "Expired: no answer" } } : null));
    const adapter = bookingRequestAdapter({ requests: async () => [], decide: vi.fn(), booking: read });
    expect(await adapter.goneReason!({ workspaceId: "ws-1" }, "b1")).toMatch(/^Expired, nothing confirmed/);
    expect(await adapter.goneReason!({ workspaceId: "ws-2" }, "b1")).toBeNull();
    expect(await bookingRequestAdapter({ requests: async () => [], decide: vi.fn() }).goneReason!({ workspaceId: "ws-1" }, "b1")).toBeNull();
  });
});

describe("booking reminders switch", () => {
  beforeEach(() => vi.unstubAllEnvs());
  it("needs both its own switch and the store's write switch", () => {
    expect(bookingRemindersEnabled({})).toBe(false);
    expect(bookingRemindersEnabled({ STRELVA_BOOKING_REMINDERS: "1" })).toBe(false);
    expect(bookingRemindersEnabled({ STRELVA_BOOKING_REMINDERS: "1", STRELVA_BOOKING_STORE_WRITE: "1" })).toBe(true);
    expect(bookingRemindersEnabled({ STRELVA_BOOKING_REMINDERS: "1", STRELVA_BOOKING_STORE_WRITE: "1", DUAL_WRITE_PG: "0" })).toBe(false);
  });
});
