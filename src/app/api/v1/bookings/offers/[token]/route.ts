import { z } from "zod";
import { readWorkspaceBody } from "@/platform/workspaces/http";
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";
import { chooseInquiryBookingOffer, readInquiryBookingOffer } from "@/platform/bookings/inquiry-offers";
import { bookingError, bookingJson, bookingOptions } from "../../_shared";
export const OPTIONS = bookingOptions;
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    if (await isRateLimitedAsync(rateLimitKey(request, "booking-inquiry-offer"), 20)) return bookingJson({ error: "Too many requests." }, 429);
    const offer = await readInquiryBookingOffer((await params).token);
    return offer ? bookingJson({ offer }) : bookingJson({ error: "This suggestion has expired." }, 404);
  } catch (error) { return bookingError(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    if (await isRateLimitedAsync(rateLimitKey(request, "booking-inquiry-choice"), 20)) return bookingJson({ error: "Too many requests." }, 429);
    const input = z.object({ start: z.string().datetime({ offset: true }) }).strict().parse(await readWorkspaceBody(request, 2000));
    const booking = await chooseInquiryBookingOffer((await params).token, input.start);
    return bookingJson({ reservationId: booking.id, status: booking.status, start: booking.start, end: booking.end });
  } catch (error) {
    if (error instanceof z.ZodError) return bookingJson({ error: "Choose a valid suggested time." }, 400);
    return bookingError(error);
  }
}
