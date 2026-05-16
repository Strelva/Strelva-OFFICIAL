import { NextResponse } from "next/server";
import { trackClick } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { isRateLimitedAsync, rateLimitKey } from "@/lib/rate-limit";
import { readJsonObject } from "@/lib/request-body";

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
  "dashboard-open",
  "ai-chat-open",
  "report-view",
  "referral-click",
]);

function isAllowedEvent(event: string): boolean {
  return ALLOWED_EVENTS.has(event) || /^booking-click:[a-z0-9][a-z0-9_-]{0,79}$/i.test(event);
}

export async function POST(req: Request) {
  try {
    if (await isRateLimitedAsync(rateLimitKey(req, "track"), 30)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { event } = body;
    if (typeof event !== "string" || !isAllowedEvent(event)) {
      return NextResponse.json({ error: "Invalid event" }, { status: 400 });
    }
    const tenant = await getTenantFromHeaders();
    await trackClick(event, tenant);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
