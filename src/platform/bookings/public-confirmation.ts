/** Inquiry handoffs share the existing email-only native confirmation surface. */
import { bookingScopeFor } from "./booking-scope";
import { PublicBookingError } from "./errors";
import { bookingManagePageEnabled, bookingMessagesEnabled } from "./flags";
import { nativeRpc, newBookingAccess } from "./native";
import type { StoreBooking } from "./store";
import { bookingCustomerEmailAllowed, deliverBookingUpdates } from "./updates";

export async function requirePublicBookingEmail(scope: string): Promise<void> {
  if (!bookingMessagesEnabled() || !bookingManagePageEnabled() || !await bookingCustomerEmailAllowed(scope)) {
    throw new PublicBookingError("unavailable", "Email confirmation is not available. Contact the business to book.");
  }
}

/** Safe on retries: the RPC returns the first encrypted email token. Nothing
 * returned to an anonymous handoff caller includes a customer bearer token. */
export async function issuePublicInquiryConfirmation(booking: StoreBooking): Promise<void> {
  if (booking.origin !== "inquiry" || booking.status !== "held") return;
  const scope = bookingScopeFor(booking);
  if (!scope || Date.parse(booking.createdAt) + 15 * 60000 <= Date.now()) throw new PublicBookingError("not_found", "This booking request expired.");
  await requirePublicBookingEmail(scope);
  await nativeRpc("issue_booking_access", { p_tenant_id: scope, p_ref: booking.id, p_access: newBookingAccess("Website booking request") });
  await deliverBookingUpdates(booking.id);
}
