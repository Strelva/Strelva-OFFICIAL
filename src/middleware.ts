import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const DEFAULT_TENANT = "rohlax";

// Routes that require authentication
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
]);

const isProtectedApi = createRouteMatcher([
  "/api/content(.*)",
  "/api/upload(.*)",
  "/api/agent(.*)",
  "/api/booking/config(.*)",
  "/api/booking/list(.*)",
  "/api/activity(.*)",
]);

// Custom domain → tenant mapping
const CUSTOM_DOMAINS: Record<string, string> = {
  "greatlakesdriedfruit.com": "gldf",
  "www.greatlakesdriedfruit.com": "gldf",
};

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

export default clerkMiddleware(async (auth, request) => {
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

  // Check protected API routes
  if (isProtectedApi(request)) {
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
