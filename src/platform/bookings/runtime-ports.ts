import type { StoreBooking } from "./store";

/** Registration must not evaluate booking services, storage or provider code. */
type ProviderAvailabilityRead = (
  actor: { userId: string; verifiedEmail: string },
  workspaceId: string,
  provider: "google" | "outlook",
  query: { start: string; end: string; timeZone: string },
) => Promise<{ busy: Array<{ start: string; end: string }> }>;
type BookingRequestNotifier = (booking: StoreBooking) => Promise<unknown>;

let providerAvailability: ProviderAvailabilityRead | null = null;
let bookingRequestNotifier: BookingRequestNotifier | null = null;

/** The app edge supplies lazy callbacks; domain consumers retrieve them at use. */
export function registerCalendarBusyProviderRead(read: ProviderAvailabilityRead): void { providerAvailability = read; }
export function getCalendarBusyProviderRead(): ProviderAvailabilityRead | null { return providerAvailability; }
export function registerBookingRequestNotifier(notify: BookingRequestNotifier): void { bookingRequestNotifier = notify; }
export function getBookingRequestNotifier(): BookingRequestNotifier | null { return bookingRequestNotifier; }
