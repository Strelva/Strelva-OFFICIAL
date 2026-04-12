import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const DEFAULT_TENANT = "rohlax";

// Routes that require authentication
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/admin(.*)",
]);

// APIs that require auth for ALL methods (GET, POST, PUT, DELETE)
const isProtectedApi = createRouteMatcher([
  "/api/upload(.*)",
  "/api/agent(.*)",
  "/api/booking/config(.*)",
  "/api/booking/list(.*)",
  "/api/activity(.*)",
  "/api/admin(.*)",
  "/api/suggestions(.*)",
  "/api/capabilities(.*)",
]);

// APIs where GET is public (content is visible on the site) but writes are protected in-route
const isWriteProtectedApi = createRouteMatcher([
  "/api/content(.*)",
  "/api/page-config(.*)",
]);

const CUSTOM_DOMAINS: Record<string, string> = JSON.parse(
  process.env.CUSTOM_DOMAIN_MAP || "{}"
);

// An "admin host" is a hostname whose first label is `admin` (e.g.
// admin.greatlakesdriedfruit.com). These hosts serve the REB dashboard only —
// `/` is redirected to `/dashboard` and tenant resolution uses the *base*
// domain so the same tenant config that owns the public site owns its admin.
function isAdminHost(host: string): boolean {
  return host.split(".")[0] === "admin";
}

function stripAdminPrefix(host: string): string {
  const parts = host.split(".");
  return parts[0] === "admin" ? parts.slice(1).join(".") : host;
}

function extractTenant(request: NextRequest): string {
  const paramTenant = request.nextUrl.searchParams.get("tenant");
  if (paramTenant) return paramTenant;

  // Check cookie for tenant (set when ?tenant= param is used)
  const cookieTenant = request.cookies.get("reb-tenant")?.value;
  if (cookieTenant) return cookieTenant;

  const host = (request.headers.get("host") || "").split(":")[0];

  // Admin hosts: look up both the full host (explicit mapping wins) and the
  // stripped base domain. This lets ops map admin.example.com directly OR
  // rely on example.com already being mapped to its tenant.
  if (isAdminHost(host)) {
    if (CUSTOM_DOMAINS[host]) return CUSTOM_DOMAINS[host];
    const base = stripAdminPrefix(host);
    if (CUSTOM_DOMAINS[base]) return CUSTOM_DOMAINS[base];
  }

  if (CUSTOM_DOMAINS[host]) return CUSTOM_DOMAINS[host];

  const parts = host.split(".");
  if (parts.length >= 3 && parts[0] !== "www") {
    return parts[0];
  }

  return DEFAULT_TENANT;
}

// Domains where the marketing landing page should show at /
const MARKETING_DOMAINS = (process.env.MARKETING_DOMAINS || "reb.studio,www.reb.studio,localhost,reb-platform.vercel.app").split(",").map(d => d.trim());

function isMarketingDomain(request: NextRequest): boolean {
  const host = (request.headers.get("host") || "").split(":")[0];
  return MARKETING_DOMAINS.includes(host);
}

// Cron routes use CRON_SECRET header auth, not Clerk
// SMS webhook uses Twilio signature verification, not Clerk
const isCronRoute = createRouteMatcher(["/api/cron(.*)", "/api/sms/webhook"]);

const CORS_ORIGINS = (process.env.CORS_ORIGINS || "https://rohlax-wellness.vercel.app,https://rohlaxwellness.com,https://greatlakesdriedfruit.com,https://www.greatlakesdriedfruit.com,http://localhost:3001").split(",").map(d => d.trim());

function corsHeaders(origin: string | null): Record<string, string> {
  if (origin && CORS_ORIGINS.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
  }
  return {};
}

// Next.js 16 proxy convention: renamed from middleware.ts to proxy.ts.
// The function export must be named `proxy` or be a default export.
// clerkMiddleware() returns a NextMiddleware-compatible function that
// Next.js accepts as the default export here.
export default clerkMiddleware(async (auth, request) => {
  const origin = request.headers.get("origin");

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  // Skip Clerk auth for cron routes (they verify CRON_SECRET internally)
  if (isCronRoute(request)) {
    const tenant = extractTenant(request);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-tenant", tenant);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Referral redirect: /refer → onboard with ref param
  if (request.nextUrl.pathname === "/refer") {
    const tenant = extractTenant(request);
    const onboardUrl = new URL("/onboard", request.url);
    onboardUrl.searchParams.set("ref", tenant);
    return NextResponse.redirect(onboardUrl);
  }

  // Rewrite root of marketing domain to the landing page
  if (
    isMarketingDomain(request) &&
    request.nextUrl.pathname === "/"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/agency";
    return NextResponse.rewrite(url);
  }

  // Admin-host shortcut: admin.<domain>/ lands on the dashboard directly,
  // never on the tenant's public site. The subsequent protected-route check
  // will bounce unauthenticated users to /sign-in as normal.
  const rawHost = (request.headers.get("host") || "").split(":")[0];
  if (isAdminHost(rawHost) && request.nextUrl.pathname === "/") {
    const dashboardUrl = new URL("/dashboard", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  const tenant = extractTenant(request);

  // Inject tenant header
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenant", tenant);

  // Check protected routes
  if (isProtectedRoute(request)) {
    const { userId } = await auth();
    if (!userId) {
      const signInUrl = new URL("/sign-in", request.url);
      signInUrl.searchParams.set("redirect_url", request.url);
      return NextResponse.redirect(signInUrl);
    }
  }

  // Check protected API routes (all methods blocked without auth)
  if (isProtectedApi(request)) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Write-protected APIs: GET is public (content is on the site anyway),
  // but PUT/DELETE/POST require auth (enforced in the route handlers)
  if (isWriteProtectedApi(request) && request.method !== "GET") {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Persist tenant to cookie when explicitly set via ?tenant= param
  const paramTenant = request.nextUrl.searchParams.get("tenant");
  if (paramTenant) {
    response.cookies.set("reb-tenant", paramTenant, { path: "/", httpOnly: true, sameSite: "lax" });
  }

  // Add CORS headers to public API responses
  const cors = corsHeaders(origin);
  for (const [key, value] of Object.entries(cors)) {
    response.headers.set(key, value);
  }

  return response;
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads/).*)"],
};
