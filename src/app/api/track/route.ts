import { NextResponse } from "next/server";
import { trackClick } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { isRateLimitedAsync, rateLimitKey } from "@/lib/rate-limit";

const ALLOWED_EVENTS = new Set([
  "page-view",
  "booking-click",
  "phone-click",
  "email-click",
  "social-click",
  "cta-click",
  "menu-click",
  "map-click",
  "directions-click",
]);

export async function POST(req: Request) {
  try {
    if (await isRateLimitedAsync(rateLimitKey(req, "track"), 30)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { event } = await req.json();
    if (typeof event !== "string" || !ALLOWED_EVENTS.has(event)) {
      return NextResponse.json({ error: "Invalid event" }, { status: 400 });
    }
    const tenant = await getTenantFromHeaders();
    await trackClick(event, tenant);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
