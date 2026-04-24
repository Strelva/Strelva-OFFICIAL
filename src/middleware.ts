import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const MARKETING_HOSTS = new Set([
  "reb.studio",
  "www.reb.studio",
  "localhost",
  "localhost:3000",
  "localhost:3001",
  "reb-studio.vercel.app",
]);

const isPublicRoute = createRouteMatcher([
  "/",
  "/agency",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/onboard(.*)",
  "/api/onboard/(.*)",
  "/api/health",
  "/api/newsletter/subscribe",
  "/api/track",
  "/api/cron/(.*)",
  "/api/billing/webhook",
  "/api/sms/webhook",
  "/((?!api|dashboard|admin|studio).*)",
]);

const isCronRoute = createRouteMatcher(["/api/cron/(.*)"]);

function extractTenantFromHost(host: string): string | null {
  const hostWithoutPort = host.split(":")[0];

  if (MARKETING_HOSTS.has(host) || MARKETING_HOSTS.has(hostWithoutPort)) {
    return null;
  }

  // Production: tenant.reb.studio
  if (hostWithoutPort.endsWith(".reb.studio")) {
    const subdomain = hostWithoutPort.replace(".reb.studio", "");
    if (subdomain && subdomain !== "www" && subdomain !== "admin") {
      return subdomain;
    }
    return null;
  }

  // Local dev: tenant.localhost (e.g., gldf.localhost:3000)
  if (hostWithoutPort.endsWith(".localhost")) {
    const subdomain = hostWithoutPort.replace(".localhost", "");
    if (subdomain) {
      return subdomain;
    }
    return null;
  }

  if (hostWithoutPort.endsWith(".vercel.app")) {
    return null;
  }

  return null;
}

// Custom domain → tenant mapping from env var (Edge-compatible)
// Format: {"example.com":"tenant1","other.com":"tenant2"}
function getCustomDomainMap(): Record<string, string> {
  try {
    const raw = process.env.CUSTOM_DOMAIN_MAP || "{}";
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function resolveTenantFromCustomDomain(domain: string): string | null {
  const map = getCustomDomainMap();
  const bare = domain.replace(/^(www|admin)\./, "");
  return map[domain] || map[bare] || null;
}

export default clerkMiddleware(async (auth, req: NextRequest) => {
  const host = req.headers.get("host") || "";
  const pathname = req.nextUrl.pathname;

  if (isCronRoute(req)) {
    const cronSecret = req.headers.get("authorization")?.replace("Bearer ", "");
    if (cronSecret === process.env.CRON_SECRET || !process.env.CRON_SECRET) {
      return NextResponse.next();
    }
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Rewrite marketing host root to /home to avoid route conflict with tenant pages
  const hostWithoutPort = host.split(":")[0];
  const isMarketingHost = MARKETING_HOSTS.has(host) || MARKETING_HOSTS.has(hostWithoutPort);
  if (isMarketingHost && pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.rewrite(url);
  }

  let tenantId = extractTenantFromHost(host);

  if (!tenantId) {
    const hostWithoutPort = host.split(":")[0];
    tenantId = resolveTenantFromCustomDomain(hostWithoutPort);
  }

  // Fallback: extract tenant from ?tenant= query param (for marketing host access)
  if (!tenantId) {
    const tenantParam = req.nextUrl.searchParams.get("tenant");
    if (tenantParam && /^[a-z0-9-]+$/.test(tenantParam)) {
      tenantId = tenantParam;
    }
  }

  if (tenantId) {
    const headers = new Headers(req.headers);
    headers.set("x-tenant", tenantId);

    const response = NextResponse.next({
      request: { headers },
    });

    return response;
  }

  if (!isPublicRoute(req)) {
    await auth.protect();
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
