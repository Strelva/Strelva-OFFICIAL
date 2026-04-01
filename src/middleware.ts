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
]);

// APIs where GET is public (content is visible on the site) but writes are protected in-route
const isWriteProtectedApi = createRouteMatcher([
  "/api/content(.*)",
  "/api/page-config(.*)",
]);

// Custom domain → tenant mapping (from centralized tenant config)
import { getCustomDomainMap } from "@/lib/tenants";
const CUSTOM_DOMAINS = getCustomDomainMap();

function extractTenant(request: NextRequest): string {
  // Dev fallback: ?tenant=gldf
  const paramTenant = request.nextUrl.searchParams.get("tenant");
  if (paramTenant) return paramTenant;

  const host = (request.headers.get("host") || "").split(":")[0];

  // Custom domain check
  if (CUSTOM_DOMAINS[host]) return CUSTOM_DOMAINS[host];

  // Subdomain extraction: rohlax.reb.studio → rohlax
  const parts = host.split(".");
  if (parts.length >= 3 && parts[0] !== "www") {
    return parts[0];
  }

  return DEFAULT_TENANT;
}

// Domains where the marketing/agency landing page should show at /
const AGENCY_DOMAINS = ["reb.studio", "www.reb.studio"];

function isAgencyDomain(request: NextRequest): boolean {
  const host = (request.headers.get("host") || "").split(":")[0]; // strip port
  return AGENCY_DOMAINS.includes(host);
}

// Detect admin.* custom domains → rewrite to /dashboard
function isAdminSubdomain(request: NextRequest): boolean {
  const host = (request.headers.get("host") || "").split(":")[0];
  return host.startsWith("admin.");
}

export default clerkMiddleware(async (auth, request) => {
  // admin.greatlakesdriedfruit.com → rewrite to /dashboard (tenant extracted from custom domain map)
  if (isAdminSubdomain(request) && !request.nextUrl.pathname.startsWith("/dashboard") && !request.nextUrl.pathname.startsWith("/api") && !request.nextUrl.pathname.startsWith("/sign-in") && !request.nextUrl.pathname.startsWith("/sign-up")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard" + (request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname);
    return NextResponse.rewrite(url);
  }

  // Rewrite root of agency domain to the marketing page
  if (
    isAgencyDomain(request) &&
    request.nextUrl.pathname === "/"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/agency";
    return NextResponse.rewrite(url);
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

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads/).*)"],
};
