/**
 * The `booking-reminders` cron's work, every 15 minutes (bookings spec,
 * "Notifications", "Approvals", "Placing a booking"):
 *
 *  1. The hold sweep. An agent's hold not confirmed in 15 minutes is released.
 *  2. The request clock. A request unanswered for 72 hours is declined
 *     ("Expired"), never confirmed, and the customer is told and offered new
 *     times. Needs you then sees the source stopped waiting and closes the
 *     item with the reason (needs-you-adapter.ts goneReason).
 *  3. Messages due now: the customer's reminders 24 hours and 2 hours before,
 *     and the owner's one chase of a request unanswered after 24 hours.
 *
 * Each message is claimed once in the store's send log and finished with what
 * the one send path returned (sent, suppressed or failed). A failed send is
 * recorded, never retried: a provider may have accepted it. Every dependency
 * is a port so the whole run is tested without Postgres or Resend.
 */
import type { SendEmailInput, SendEmailResult } from "@/platform/infra/email/send";
import { customerReminderEmail, ownerRequestReminderEmail, requestLapsedEmail, type ReminderEmail } from "./emails";
import type { BookingMessageKind, BookingMessageStatus, ClaimedBookingMessage, StoreBooking } from "./store";

export interface BookingBusiness {
  name: string;
  address?: string;
  tenantId: string | null;
  /** The owner recipient, resolved once through the owner-recipient rule. */
  ownerEmail: string | null;
  /** The public site, where a customer can pick another time. */
  siteUrl: string | null;
}

export interface BookingLifecyclePorts {
  expireHolds(now: Date): Promise<number>;
  lapseRequests(now: Date, limit: number): Promise<Array<{ messageId: string | null; booking: StoreBooking }>>;
  claim(now: Date, limit: number): Promise<ClaimedBookingMessage[]>;
  finish(messageId: string, status: BookingMessageStatus, providerMessageId: string | null, detail: string | null): Promise<unknown>;
  business(booking: StoreBooking): Promise<BookingBusiness | null>;
  /** Up to three open times for the same service, as labels ("Tue, Nov 17 at 10:00 AM"). */
  alternatives(booking: StoreBooking, now: Date): Promise<string[]>;
  /** The customer's manage link, when the booking has one and the page is on. */
  manageUrl(booking: StoreBooking): Promise<string | null>;
  send(input: SendEmailInput): Promise<SendEmailResult>;
  appOrigin: string;
}

export interface BookingLifecycleSummary {
  holdsExpired: number;
  requestsLapsed: number;
  claimed: number;
  sent: number;
  suppressed: number;
  failed: number;
  skipped: number;
  /** Steps that could not run (a store error); the next run picks them up. */
  errors: string[];
}

const CUSTOMER_FROM = "bookings@mail.strelva.com";

function workspaceBookingsUrl(origin: string, booking: StoreBooking): string {
  const params = new URLSearchParams({ view: "week", date: booking.localDate });
  if (booking.workspaceId) params.set("workspaceId", booking.workspaceId);
  return `${origin.replace(/\/$/, "")}/workspace/bookings?${params}`;
}

async function deliver(
  ports: BookingLifecyclePorts,
  summary: BookingLifecycleSummary,
  messageId: string,
  kind: BookingMessageKind,
  booking: StoreBooking,
  now: Date,
): Promise<void> {
  const skip = async (detail: string) => {
    summary.skipped += 1;
    await ports.finish(messageId, "skipped", null, detail).catch(() => undefined);
  };
  let business: BookingBusiness | null;
  try {
    business = await ports.business(booking);
  } catch {
    business = null;
  }
  if (!business) return skip("business_unknown");

  let email: ReminderEmail;
  let to: string;
  let audience: SendEmailInput["audience"];
  if (kind === "request_owner_reminder") {
    if (!business.ownerEmail) return skip("no_owner_recipient");
    to = business.ownerEmail;
    audience = "client";
    email = ownerRequestReminderEmail({ booking, businessName: business.name, openUrl: workspaceBookingsUrl(ports.appOrigin, booking) });
  } else {
    if (!booking.customer.email) return skip("no_customer_email");
    to = booking.customer.email;
    audience = "customer";
    if (kind === "request_lapsed") {
      const alternatives = await ports.alternatives(booking, now).catch(() => []);
      email = requestLapsedEmail({ booking, businessName: business.name, alternatives, bookAgainUrl: business.siteUrl });
    } else {
      // A reminder for a booking that is no longer confirmed is not sent.
      if (booking.status !== "confirmed") return skip("not_confirmed");
      const manageUrl = await ports.manageUrl(booking).catch(() => null);
      email = customerReminderEmail({ booking, kind, businessName: business.name, manageUrl });
    }
  }

  try {
    const result = await ports.send({
      audience,
      ...(business.tenantId ? { tenantId: business.tenantId } : {}),
      ...(audience === "customer" ? { fromName: business.name || "Strelva", fromAddress: CUSTOMER_FROM } : {}),
      to,
      subject: email.subject,
      options: email.options,
      idempotencyKey: `booking-message:${messageId}`,
      tags: { kind: `booking_${kind}` },
    });
    if (result.status === "accepted") {
      summary.sent += 1;
      await ports.finish(messageId, "sent", result.providerMessageId, null).catch(() => undefined);
    } else {
      summary.suppressed += 1;
      await ports.finish(messageId, "suppressed", null, result.reason).catch(() => undefined);
    }
  } catch (error) {
    // The provider may have accepted it: record the failure, never resend.
    summary.failed += 1;
    await ports.finish(messageId, "failed", null, (error instanceof Error ? error.message : String(error)).slice(0, 500)).catch(() => undefined);
  }
}

export async function runBookingLifecycle(ports: BookingLifecyclePorts, options: { now: Date; limit?: number }): Promise<BookingLifecycleSummary> {
  const limit = options.limit ?? 200;
  const summary: BookingLifecycleSummary = { holdsExpired: 0, requestsLapsed: 0, claimed: 0, sent: 0, suppressed: 0, failed: 0, skipped: 0, errors: [] };
  try {
    summary.holdsExpired = await ports.expireHolds(options.now);
  } catch (error) {
    summary.errors.push(`holds: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const lapsed = await ports.lapseRequests(options.now, limit);
    summary.requestsLapsed = lapsed.length;
    for (const row of lapsed) {
      if (!row.messageId) continue;
      summary.claimed += 1;
      await deliver(ports, summary, row.messageId, "request_lapsed", row.booking, options.now);
    }
  } catch (error) {
    summary.errors.push(`lapse: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const due = await ports.claim(options.now, limit);
    summary.claimed += due.length;
    for (const message of due) await deliver(ports, summary, message.messageId, message.kind, message.booking, options.now);
  } catch (error) {
    summary.errors.push(`messages: ${error instanceof Error ? error.message : String(error)}`);
  }
  return summary;
}
