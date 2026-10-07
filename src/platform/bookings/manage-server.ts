/** Both receipt and native management use the same /b customer surface. */
import { createPublicWebsiteBookingService } from "@/products/scheduling/server";
import { PublicBookingError } from "@/products/scheduling/public-booking";
import type { ManageDeps } from "./manage";
import { readReservationByManageTokenHash } from "./store";
import { bookingMessagesEnabled, bookingAgentsEnabled } from "./flags";
import { nativeBookingByToken, nativeSlots, tokenHash, changeNativeBooking, confirmAgent } from "./native";
import { deliverBookingUpdates } from "./updates";

export function manageDeps(): ManageDeps {
  const service = createPublicWebsiteBookingService();
  const nativeEnabled = () => bookingMessagesEnabled() || bookingAgentsEnabled();
  return {
    async find(hash) {
      const receipt = await readReservationByManageTokenHash(hash);
      if (receipt || !nativeEnabled()) return receipt;
      const native = await nativeBookingByToken(hash, "manage") ?? await nativeBookingByToken(hash, "confirm");
      if (!native?.tenantId) return null;
      return { tenantId: native.tenantId, siteName: native.siteName, reservationId: native.id,
        capabilityId: `native:${native.serviceRef ?? ""}`, capabilityVersion: 1, title: native.serviceName,
        start: native.start, end: native.end, timeZone: native.timeZone,
        status: native.status === "confirmed" ? "confirmed" : native.status === "held" ? "held" : native.status === "cancelled" || native.status === "declined" ? "cancelled" : "pending",
        confirmationRequired: native.confirmationRequired, confirmUntil: native.confirmUntil };
    },
    async read(input) {
      if (!input.capabilityId.startsWith("native:")) return service.read(input);
      if (!nativeEnabled()) throw new PublicBookingError("not_found", "Booking management is unavailable.");
      return nativeSlots(input.tenantId, input.capabilityId.slice(7), input.range.from, input.range.to);
    },
    async change(input) {
      if (!input.capabilityId.startsWith("native:")) return service.change(input);
      if (!nativeEnabled()) throw new PublicBookingError("not_found", "Booking management is unavailable.");
      const booking = await changeNativeBooking(tokenHash(input.managementToken), "reschedule", input.slotId);
      await deliverBookingUpdates(booking.id).catch(() => undefined);
      return { status: booking.status === "confirmed" ? "confirmed" : "pending" };
    },
    async cancel(input) {
      if (nativeEnabled() && await nativeBookingByToken(tokenHash(input.managementToken), "manage")) {
        const booking = await changeNativeBooking(tokenHash(input.managementToken), "cancel");
        await deliverBookingUpdates(booking.id).catch(() => undefined);
        return { status: "cancelled" };
      }
      return service.cancel(input);
    },
    async confirm(token) {
      if (!bookingAgentsEnabled()) throw new PublicBookingError("not_found", "Agent bookings are unavailable.");
      const booking = await confirmAgent(tokenHash(token));
      await deliverBookingUpdates(booking.id).catch(() => undefined);
      return { status: booking.status === "confirmed" ? "confirmed" : "pending" };
    },
    now: () => Date.now(),
  };
}
