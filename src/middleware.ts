import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const MARKETING_HOSTS = new Set([
  "scaffoldweb.com",
  "www.scaffoldweb.com",
  "localhost",
  "localhost:3000",
  "localhost:3001",
  "reb-studio.vercel.app",
]);

const isPublicRoute = createRouteMatcher([
  "/",
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
  "/api/sanity/webhook",
  "/api/internal/(.*)",
  "/((?!api|dashboard|admin|studio).*)",
]);

const isCronRoute = createRouteMatcher(["/api/cron/(.*)"]);

function extractTenantFromHost(host: string): { tenant: string | null; isAdminSubdomain: boolean } {
  const hostWithoutPort = host.split(":")[0];

  if (MARKETING_HOSTS.has(host) || MARKETING_HOSTS.has(hostWithoutPort)) {
    return { tenant: null, isAdminSubdomain: false };
  }

  // Production: tenant.scaffoldweb.com
  if (hostWithoutPort.endsWith(".scaffoldweb.com")) {
    const subdomain = hostWithoutPort.replace(".scaffoldweb.com", "");
    if (subdomain && subdomain !== "www" && subdomain !== "admin") {
      return { tenant: subdomain, isAdminSubdomain: false };
    }
    return { tenant: null, isAdminSubdomain: false };
  }

  // Local dev: tenant.localhost (e.g., gldf.localhost:3000)
  if (hostWithoutPort.endsWith(".localhost")) {
    const subdomain = hostWithoutPort.replace(".localhost", "");
    if (subdomain) {
      return { tenant: subdomain, isAdminSubdomain: false };
    }
    return { tenant: null, isAdminSubdomain: false };
  }

  if (hostWithoutPort.endsWith(".vercel.app")) {
    return { tenant: null, isAdminSubdomain: false };
  }

  return { tenant: null, isAdminSubdomain: false };
}

// Custom domain → tenant mapping from env var (Edge-compatible fallback)
// Format: {"example.com":"tenant1","other.com":"tenant2"}
function getEnvDomainMap(): Record<string, string> {
  try {
    const raw = process.env.CUSTOM_DOMAIN_MAP || "{}";
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// In-memory cache for domain lookups (refreshed via internal API)
const domainCache = new Map<string, { tenant: string | null; isAdmin: boolean; ts: number }>();
const DOMAIN_CACHE_TTL_MS = 60_000; // 1 minute

async function resolveTenantFromCustomDomain(
  domain: string,
  req: NextRequest
): Promise<{ tenant: string | null; isAdminSubdomain: boolean }> {
  const normalized = domain.toLowerCase();
  const isAdminPrefix = normalized.startsWith("admin.");
  const bare = normalized.replace(/^(www|admin)\./, "");

  // Check in-memory cache first
  const cached = domainCache.get(bare) || domainCache.get(normalized);
  if (cached && Date.now() - cached.ts < DOMAIN_CACHE_TTL_MS) {
    return { tenant: cached.tenant, isAdminSubdomain: cached.isAdmin };
  }

  // Try internal API lookup (fetches from Sanity/Redis tenant config)
  try {
    const baseUrl = req.nextUrl.origin;
    const res = await fetch(`${baseUrl}/api/internal/domain-map?domain=${encodeURIComponent(bare)}`, {
      headers: { "x-internal-request": "1" },
    });
    if (res.ok) {
      const data = await res.json();
      const result = {
        tenant: data.tenant || null,
        isAdmin: data.isAdmin || isAdminPrefix,
        ts: Date.now(),
      };
      domainCache.set(bare, result);
      if (data.tenant) {
        return { tenant: data.tenant, isAdminSubdomain: result.isAdmin };
      }
    }
  } catch {
    // API call failed, fall through to env var fallback
  }

  // Fallback to env var for cold starts or when API is unavailable
  const envMap = getEnvDomainMap();
  const tenant = envMap[normalized] || envMap[bare] || null;
  return { tenant, isAdminSubdomain: isAdminPrefix && tenant !== null };
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

  let tenantId: string | null = null;
  let isAdminSubdomain = false;

  const extraction = extractTenantFromHost(host);
  tenantId = extraction.tenant;
  isAdminSubdomain = extraction.isAdminSubdomain;

  if (!tenantId) {
    const customDomainResult = await resolveTenantFromCustomDomain(hostWithoutPort, req);
    tenantId = customDomainResult.tenant;
    isAdminSubdomain = customDomainResult.isAdminSubdomain;
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

    // Check for preview mode (dashboard iframe access)
    const isPreviewMode = req.nextUrl.searchParams.get("preview") === "true";
    if (isPreviewMode) {
      headers.set("x-preview-mode", "true");
    }

    // Admin subdomains (e.g., admin.{tenantdomain}.com) require auth for all routes
    if (isAdminSubdomain) {
      await auth.protect();
    }

    const response = NextResponse.next({
      request: { headers },
    });

    return response;
  }

  if (!isPublicRoute(req)) {
    const signInUrl = new URL("/sign-in", req.url);
    await auth.protect({
      unauthenticatedUrl: signInUrl.toString(),
    });
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
