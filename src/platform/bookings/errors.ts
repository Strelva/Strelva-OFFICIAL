export class PublicBookingError extends Error {
  constructor(readonly code: "unavailable" | "invalid" | "conflict" | "not_found", message: string, readonly status = code === "invalid" ? 400 : code === "not_found" ? 404 : code === "conflict" ? 409 : 503) {
    super(message);
    this.name = "PublicBookingError";
  }
}

