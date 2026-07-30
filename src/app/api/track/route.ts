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
  "health-view",
  "gbp-view",
  "brand-kit-view",
  "store-view",
  "referral-click",
]);

function isAllowedEvent(event: string): boolean {
  return ALLOWED_EVENTS.has(event) || /^booking-click:[a-z0-9][a-z0-9_-]{0,79}$/i.test(event);
}

/** Accept only same-origin requests: the Origin or Referer header must match
 *  the app's own host (NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_SITE_URL). Cross-origin
 *  POSTs with no Origin/Referer are also rejected. This stops arbitrary external
 *  callers from inflating tenant metrics without requiring a session cookie
 *  (which browser tracker components don't carry on public pages). */
function isSameOriginRequest(req: Request): boolean {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
  if (!appUrl) return true; // unconfigured env — fail open in dev
  let appHost: string;
  try {
    appHost = new URL(appUrl).host;
  } catch {
    return true;
  }

  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === appHost;
    } catch {
      return false;
    }
  }

  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === appHost;
    } catch {
      return false;
    }
  }

  // No Origin and no Referer — reject: a legitimate browser request always sends one.
  return false;
}

export async function POST(req: Request) {
  try {
    if (await isRateLimitedAsync(rateLimitKey(req, "track"), 30)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    if (!isSameOriginRequest(req)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
