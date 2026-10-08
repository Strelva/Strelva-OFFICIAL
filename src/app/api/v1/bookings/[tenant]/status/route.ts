import { isTenantId } from "@/lib/scaffold-contracts";
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";
import { nativeBookingByToken, requireAgentBookings, tokenHash } from "@/platform/bookings/native";
import { bookingJson, bookingOptions, bookingError } from "../../_shared";
export const OPTIONS = bookingOptions;
export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  if (!isTenantId(tenant)) return bookingJson({ error: "Invalid tenant." }, 400);
  try {
    await requireAgentBookings();
    if (await isRateLimitedAsync(rateLimitKey(request, `booking-status:${tenant}`), 20)) return bookingJson({ error: "Too many requests." }, 429);
    const token = new URL(request.url).searchParams.get("token");
    const booking = token && /^[A-Za-z0-9_-]{43}$/.test(token) ? await nativeBookingByToken(tokenHash(token), "status") : null;
    if (!booking || booking.tenantId !== tenant) return bookingJson({ error: "Booking not found." }, 404);
    return bookingJson({ reservationId: booking.id, status: booking.status, start: booking.start, end: booking.end });
  } catch (error) { return bookingError(error); }
}
