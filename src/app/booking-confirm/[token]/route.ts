import { createPublicWebsiteBookingService, PublicBookingError } from "@/products/scheduling/server";
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";

const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'" };
const page = (message: string, form = false, status = 200) => new Response(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirm booking request</title><main><h1>Confirm booking request</h1><p>${message}</p>${form ? '<form method="post"><button type="submit">Confirm my email and request this time</button></form>' : ''}</main></html>`, { status, headers });
/** A scanner opening the email link cannot consume it or place a booking. */
export async function GET() { return page("Confirm within 15 minutes. The business may still need to accept your request.", true); }
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return page("Open the email link directly.", false, 403);
  try {
    if (await isRateLimitedAsync(rateLimitKey(request, "booking-email-confirm"), 10)) return page("Too many tries. Wait a minute.", false, 429);
    const result = await createPublicWebsiteBookingService().confirm((await params).token);
    return page(result.status === "confirmed" ? "Your booking is confirmed." : "Your email is confirmed. The business will confirm your request.");
  } catch (error) {
    // Never interpolate provider/storage messages into HTML.
    return page("This confirmation could not complete. The link may have expired or the time may have been taken. Contact the business before requesting again.", false, error instanceof PublicBookingError ? error.status : 503);
  }
}
