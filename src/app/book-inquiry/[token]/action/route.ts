import { NextResponse } from "next/server";
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";
import { bookingInquiryOffersEnabled, chooseInquiryBookingOffer } from "@/platform/bookings/inquiry-offers";
import { readBoundedBody } from "@/platform/workspaces/http";
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!bookingInquiryOffersEnabled()) return new NextResponse("Not found", { status: 404 });
  const { token } = await params, page = new URL(`/book-inquiry/${encodeURIComponent(token)}`, request.url);
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return new NextResponse("Open the booking link directly.", { status: 403 });
  try {
    if (await isRateLimitedAsync(rateLimitKey(request, "booking-inquiry-choice"), 20)) throw new Error("rate");
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) throw new Error("invalid");
    const form = new URLSearchParams((await readBoundedBody(request, 2000)).toString("utf8"));
    await chooseInquiryBookingOffer(token, form.get("start") ?? "");
  } catch { page.searchParams.set("error", "unavailable"); }
  return NextResponse.redirect(page, 303);
}
