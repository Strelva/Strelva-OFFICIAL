import { isSameOriginBookingForm } from "@/platform/bookings/public-form";
import { NextResponse } from "next/server";
import { createPublicWebsiteBookingService } from "@/products/scheduling/server";
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";

/** Only POST consumes the email-only token. Scanner GETs cannot place a booking. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!isSameOriginBookingForm(request)) return new NextResponse("Open the email link directly.", { status: 403 });
  const { token } = await params;
  const page = new URL(`/booking-confirm/${encodeURIComponent(token)}`, request.url);
  try {
    if (await isRateLimitedAsync(rateLimitKey(request, "booking-email-confirm"), 10)) page.searchParams.set("error", "rate");
    else {
      const result = await createPublicWebsiteBookingService().confirm(token);
      page.searchParams.set("done", result.status === "confirmed" ? "confirmed" : "pending");
    }
  } catch { page.searchParams.set("error", "unavailable"); }
  return NextResponse.redirect(page, { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
