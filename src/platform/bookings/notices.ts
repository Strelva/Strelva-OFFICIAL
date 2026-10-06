/**
 * Owner booking notices (bookings spec, "Owner notices and Needs you").
 *
 * "New booking" is a notice: one email when a visitor's booking is confirmed,
 * to the business's owner recipient resolved once through the owner-recipient
 * rule (src/lib/owner-recipient.ts). A booking *request* is not a notice: it is
 * a Needs you item (needs-you-adapter.ts), which sends its own urgent email.
 *
 * Off unless STRELVA_BOOKING_OWNER_NOTICE=1, and every send still goes through
 * the one email path and its gate (src/lib/email/send.ts, email-enabled.ts).
 * Never throws: the booking is already kept.
 */
import { getTenantConfig } from "@/lib/tenants";
import { getTenantDashboardUrl } from "@/lib/tenant-urls";
import { ownerNoticeEmail } from "@/lib/owner-recipient";
import { sendNewBookingOwnerEmail } from "@/lib/delivery-email";
import type { Booking } from "@/lib/types";
import { bookingOwnerNoticeEnabled } from "./flags";

export type BookingNoticeOutcome = "sent" | "off" | "request" | "no_recipient" | "not_sent";

function when(booking: Pick<Booking, "date" | "startTime">): string {
  const date = new Date(`${booking.date}T12:00:00Z`);
  const day = Number.isNaN(date.getTime())
    ? booking.date
    : new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(date);
  const [h, m] = booking.startTime.split(":").map(Number);
  const hour = ((h ?? 0) % 12) || 12;
  return `${day}, ${hour}:${String(m ?? 0).padStart(2, "0")} ${(h ?? 0) < 12 ? "AM" : "PM"}`;
}

export async function notifyOwnerOfBooking(tenant: string, booking: Booking): Promise<BookingNoticeOutcome> {
  if (!bookingOwnerNoticeEnabled()) return "off";
  if (booking.status === "requested") return "request";
  try {
    const config = await getTenantConfig(tenant);
    if (!config) return "no_recipient";
    const email = await ownerNoticeEmail(config);
    if (!email) return "no_recipient";
    const sent = await sendNewBookingOwnerEmail({
      tenantId: tenant,
      email,
      siteName: config.siteName,
      booking: {
        customerName: booking.clientName,
        ...(booking.clientEmail ? { customerEmail: booking.clientEmail } : {}),
        serviceName: booking.serviceName,
        when: when(booking),
      },
      dashboardUrl: getTenantDashboardUrl(config, "/dashboard/schedule"),
      logPrefix: "[bookings]",
    });
    return sent ? "sent" : "not_sent";
  } catch (error) {
    console.error(`[bookings] owner notice failed for ${tenant}:`, error);
    return "not_sent";
  }
}
