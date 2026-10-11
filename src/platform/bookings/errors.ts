export class PublicBookingError extends Error {
  constructor(readonly code: "unavailable" | "invalid" | "conflict" | "not_found", message: string, readonly status = code === "invalid" ? 400 : code === "not_found" ? 404 : code === "conflict" ? 409 : 503) {
    super(message);
    this.name = "PublicBookingError";
  }
}

export function pausedBookingMessage(phone: string | null): string {
  return phone ? `Bookings are paused right now. Call ${phone} to reach the business.` : "Bookings are paused right now. Contact the business directly.";
}
