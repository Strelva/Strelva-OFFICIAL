import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDevAccessTenant, isDevAccessBypassEnabled } from "./lib/dev-access";
import { MARKETING_HOSTS, isMarketingHost } from "./lib/marketing-hosts";

export { isMarketingHost } from "./lib/marketing-hosts";

const LEGACY_PUBLIC_SITE_REDIRECTS: Record<string, string> = {
  "gldf.scaffoldweb.com": "https://greatlakesdriedfruit.com",
};

const cspBaseDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://clerk.scaffoldweb.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.unsplash.com https://cdn.sanity.io https://*.public.blob.vercel-storage.com https://img.clerk.com https://*.clerk.com https://clerk.scaffoldweb.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://clerk.scaffoldweb.com https://api.stripe.com https://*.supabase.co https://*.upstash.io https://generativelanguage.googleapis.com https://api.resend.com",
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
];

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/no-access",
  "/onboard(.*)",
  "/api/onboard/(.*)",
  "/api/health",
  "/api/public/(.*)",
  "/api/v1/(.*)",
  "/api/newsletter/subscribe",
  "/api/track",
  "/api/cron/(.*)",
  "/api/billing/webhook",
  "/api/sms/webhook",
  "/api/sanity/webhook",
  "/api/clerk/webhook",
  "/api/internal/(.*)",
  "/((?!api|dashboard|admin|studio).*)",
]);

const isCronRoute = createRouteMatcher(["/api/cron/(.*)"]);

export function shouldResolveCustomDomain(host: string): boolean {
  const hostWithoutPort = host.toLowerCase().split(":")[0];
  return (
    !isMarketingHost(host) &&
    !hostWithoutPort.endsWith(".localhost") &&
    !hostWithoutPort.endsWith(".scaffoldweb.com") &&
    !hostWithoutPort.endsWith(".vercel.app")
  );
}

export function extractTenantFromHost(host: string): { tenant: string | null; isAdminSubdomain: boolean } {
  const normalizedHost = host.toLowerCase();
  const hostWithoutPort = normalizedHost.split(":")[0];

  if (isMarketingHost(host)) {
    return { tenant: null, isAdminSubdomain: false };
  }

  // Production: tenant.scaffoldweb.com
  if (hostWithoutPort.endsWith(".scaffoldweb.com")) {
    const subdomain = hostWithoutPort.replace(".scaffoldweb.com", "");
    if (subdomain.startsWith("admin.")) {
      const tenant = subdomain.replace(/^admin\./, "");
      return tenant
        ? { tenant, isAdminSubdomain: true }
        : { tenant: null, isAdminSubdomain: false };
    }
    if (subdomain && subdomain !== "www" && subdomain !== "admin") {
      return { tenant: subdomain, isAdminSubdomain: false };
    }
    return { tenant: null, isAdminSubdomain: false };
  }

  // Local dev: tenant.localhost (e.g., gldf.localhost:3000)
  if (hostWithoutPort.endsWith(".localhost")) {
    const subdomain = hostWithoutPort.replace(".localhost", "");
    if (subdomain.startsWith("admin.")) {
      const tenant = subdomain.replace(/^admin\./, "");
      return tenant
        ? { tenant, isAdminSubdomain: true }
        : { tenant: null, isAdminSubdomain: false };
    }
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
export function getEnvDomainMap(raw = process.env.CUSTOM_DOMAIN_MAP || "{}"): Record<string, string> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function resolveTenantFromDomainMap(
  domain: string,
  envMap: Record<string, string>
): { tenant: string | null; isAdminSubdomain: boolean } {
  const normalized = domain.toLowerCase();
  const isAdminPrefix = normalized.startsWith("admin.");
  const bare = normalized.replace(/^(www|admin)\./, "");
  const tenant = envMap[normalized] || envMap[bare] || null;
  return { tenant, isAdminSubdomain: isAdminPrefix && tenant !== null };
}

export function shouldRewriteMarketingRoot(host: string, pathname: string): boolean {
  return isMarketingHost(host) && pathname === "/";
}

export function getLegacyPublicSiteRedirect(host: string): string | null {
  const normalizedHost = host.toLowerCase().split(":")[0];
  return LEGACY_PUBLIC_SITE_REDIRECTS[normalizedHost] || null;
}

export function shouldRedirectAdminRoot(isAdminSubdomain: boolean, pathname: string): boolean {
  return isAdminSubdomain && pathname === "/";
}

export function validateCronRequest(expectedSecret: string | undefined, authorization: string | null) {
  if (!expectedSecret) {
    return { allowed: false, status: 500, message: "CRON_SECRET not configured" };
  }

  const cronSecret = authorization?.replace("Bearer ", "");
  if (cronSecret === expectedSecret) {
    return { allowed: true, status: 200, message: "OK" };
  }

  return { allowed: false, status: 401, message: "Unauthorized" };
}

function isPreviewRequest(req: NextRequest): boolean {
  return req.nextUrl.searchParams.get("preview") === "true";
}

function getPreviewFrameAncestors(host: string, protocol: string): string[] {
  const ancestors = new Set([
    "'self'",
    "https://scaffoldweb.com",
    "https://www.scaffoldweb.com",
    "https://admin.scaffoldweb.com",
    "https://reb-studio.vercel.app",
    "http://localhost:3000",
    "http://localhost:3001",
  ]);

  if (host && !MARKETING_HOSTS.has(host) && !host.endsWith(".scaffoldweb.com")) {
    const bare = host.replace(/^(www|admin)\./, "");
    ancestors.add(`${protocol}//${bare}`);
    ancestors.add(`${protocol}//www.${bare}`);
    ancestors.add(`${protocol}//admin.${bare}`);
  }

  return [...ancestors];
}

export function buildContentSecurityPolicy(params: {
  isPreview: boolean;
  host: string;
  protocol: string;
}): string {
  const host = params.host.split(":")[0].toLowerCase();
  const frameAncestors = params.isPreview
    ? getPreviewFrameAncestors(host, params.protocol).join(" ")
    : "'none'";

  return [...cspBaseDirectives, `frame-ancestors ${frameAncestors}`].join("; ");
}

function applySecurityHeaders(response: NextResponse, req: NextRequest): NextResponse {
  response.headers.set(
    "Content-Security-Policy",
    buildContentSecurityPolicy({
      isPreview: isPreviewRequest(req),
      host: req.headers.get("host") || "",
      protocol: req.nextUrl.protocol,
    })
  );
  if (isPreviewRequest(req)) {
    response.headers.delete("X-Frame-Options");
  } else {
    response.headers.set("X-Frame-Options", "DENY");
  }

  return response;
}

// In-memory cache for domain lookups (refreshed via internal API)
const domainCache = new Map<string, { tenant: string | null; isAdmin: boolean; ts: number }>();
const DOMAIN_CACHE_TTL_MS = 60_000; // 1 minute

export function clearDomainResolutionCacheForTests(): void {
  if (process.env.NODE_ENV === "test") domainCache.clear();
}

async function fetchDomainMapResult(
  domain: string,
  req: NextRequest,
  isAdminPrefix: boolean
): Promise<{ tenant: string | null; isAdminSubdomain: boolean } | null> {
  const baseUrl = req.nextUrl.origin;
  const res = await fetch(`${baseUrl}/api/internal/domain-map?domain=${encodeURIComponent(domain)}`, {
    headers: {
      "x-internal-request": "1",
      "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
    },
  });

  if (!res.ok) return null;

  const data = await res.json();
  if (!data.tenant) return { tenant: null, isAdminSubdomain: false };

  return {
    tenant: data.tenant,
    isAdminSubdomain: Boolean(data.isAdmin || isAdminPrefix),
  };
}

export async function resolveTenantFromCustomDomain(
  domain: string,
  req: NextRequest
): Promise<{ tenant: string | null; isAdminSubdomain: boolean }> {
  const normalized = domain.toLowerCase();
  const isAdminPrefix = normalized.startsWith("admin.");
  const bare = normalized.replace(/^(www|admin)\./, "");

  // Cache per requested host. Public and admin hosts must not share an isAdmin value.
  const cached = domainCache.get(normalized);
  if (cached && Date.now() - cached.ts < DOMAIN_CACHE_TTL_MS) {
    return { tenant: cached.tenant, isAdminSubdomain: cached.isAdmin };
  }

  // Try exact host first so explicit adminDomain/customDomains entries win.
  // For derived admin.<apex> hosts, fall back to the apex domain and mark it admin.
  try {
    const exact = await fetchDomainMapResult(normalized, req, isAdminPrefix);
    if (exact?.tenant) {
      domainCache.set(normalized, { tenant: exact.tenant, isAdmin: exact.isAdminSubdomain, ts: Date.now() });
      return exact;
    }

    if (bare !== normalized) {
      const fallback = await fetchDomainMapResult(bare, req, isAdminPrefix);
      if (fallback?.tenant) {
        domainCache.set(normalized, { tenant: fallback.tenant, isAdmin: fallback.isAdminSubdomain, ts: Date.now() });
        return fallback;
      }
    }
  } catch {
    // API call failed, fall through to env var fallback
  }

  // Fallback to env var for cold starts or when API is unavailable
  const envMap = getEnvDomainMap();
  return resolveTenantFromDomainMap(normalized, envMap);
}

export default clerkMiddleware(async (auth, req: NextRequest) => {
  const host = req.headers.get("host") || "";
  const pathname = req.nextUrl.pathname;
  const devAccessBypass = isDevAccessBypassEnabled();
  const devPreviewRequest = devAccessBypass && req.nextUrl.searchParams.get("preview") === "true";

  const legacyPublicSiteRedirect = getLegacyPublicSiteRedirect(host);
  if (legacyPublicSiteRedirect) {
    const url = new URL(req.nextUrl.pathname + req.nextUrl.search, legacyPublicSiteRedirect);
    return applySecurityHeaders(NextResponse.redirect(url, 308), req);
  }

  // Bypass internal API routes immediately to prevent recursion.
  // The proxy fetches /api/internal/domain-map for custom domain resolution,
  // so these routes must skip tenant resolution entirely.
  if (pathname.startsWith("/api/internal/")) {
    return applySecurityHeaders(NextResponse.next(), req);
  }

  if (isCronRoute(req)) {
    const cron = validateCronRequest(process.env.CRON_SECRET, req.headers.get("authorization"));
    if (!cron.allowed && cron.status === 500) {
      console.error("[proxy] CRON_SECRET env var not set - blocking cron route");
    }
    if (cron.allowed) {
      return applySecurityHeaders(NextResponse.next(), req);
    }
    return applySecurityHeaders(new NextResponse(cron.message, { status: cron.status }), req);
  }

  // Rewrite marketing host root to /home to avoid route conflict with tenant pages
  const hostWithoutPort = host.split(":")[0];
  if (!devPreviewRequest && shouldRewriteMarketingRoot(host, pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/home";
    return applySecurityHeaders(NextResponse.rewrite(url), req);
  }

  let tenantId: string | null = null;
  let isAdminSubdomain = false;

  const extraction = extractTenantFromHost(host);
  tenantId = extraction.tenant;
  isAdminSubdomain = extraction.isAdminSubdomain;

  if (!tenantId && shouldResolveCustomDomain(host)) {
    const customDomainResult = await resolveTenantFromCustomDomain(hostWithoutPort, req);
    tenantId = customDomainResult.tenant;
    isAdminSubdomain = customDomainResult.isAdminSubdomain;
  }

  // Fallback: extract tenant from ?tenant= query param (for super admin access only)
  // This requires authentication to prevent tenant spoofing
  let tenantFromQueryParam = false;
  if (!tenantId) {
    const tenantParam = req.nextUrl.searchParams.get("tenant");
    if (tenantParam && /^[a-z0-9-]+$/.test(tenantParam)) {
      tenantId = tenantParam;
      tenantFromQueryParam = true;
    }
  }

  if (!tenantId && devAccessBypass && (pathname.startsWith("/dashboard") || pathname.startsWith("/api/") || devPreviewRequest)) {
    tenantId = getDevAccessTenant();
  }

  if (tenantId) {
    if (shouldRedirectAdminRoot(isAdminSubdomain, pathname)) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      return applySecurityHeaders(NextResponse.redirect(url), req);
    }

    const headers = new Headers(req.headers);
    headers.set("x-tenant", tenantId);

    // Check for preview mode (dashboard iframe access)
    const isPreviewMode = req.nextUrl.searchParams.get("preview") === "true";
    if (isPreviewMode) {
      headers.set("x-preview-mode", "true");
    }

    // Require auth for protected admin subdomain routes, while still allowing
    // Clerk's sign-in/sign-up routes to render on admin.<tenant-domain>.
    const routeIsPublic = isPublicRoute(req);
    const needsAuth = !devAccessBypass && ((isAdminSubdomain && !routeIsPublic) || (tenantFromQueryParam && !routeIsPublic));
    if (needsAuth) {
      const signInUrl = new URL("/sign-in", req.url);
      await auth.protect({
        unauthenticatedUrl: signInUrl.toString(),
      });
    }

    const response = NextResponse.next({
      request: { headers },
    });

    return applySecurityHeaders(response, req);
  }

  if (!devAccessBypass && !isPublicRoute(req)) {
    const signInUrl = new URL("/sign-in", req.url);
    await auth.protect({
      unauthenticatedUrl: signInUrl.toString(),
    });
  }

  return applySecurityHeaders(NextResponse.next(), req);
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
