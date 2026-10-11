import type { StoreBooking } from "./store";

/** Never infer an agent from its customer, external ref or request fingerprint. */
export function bookingAgentName(booking: Pick<StoreBooking, "origin" | "agentName">): string | null {
  if (booking.origin !== "agent") return null;
  return booking.agentName?.replace(/\s+/g, " ").trim().slice(0, 120) || "an unnamed agent";
}

export function bookingAgentLabel(booking: Pick<StoreBooking, "origin" | "agentName">): string | null {
  const name = bookingAgentName(booking);
  return name ? `Booked through ${name}` : null;
}
