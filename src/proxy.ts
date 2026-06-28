import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { createMiddlewareSupabase } from "@/lib/db/middleware-client";
import { isSupabaseAuthConfigured } from "@/lib/db/server-client";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDevAccessTenant, isDevAccessBypassEnabled } from "./lib/dev-access";
import { MARKETING_HOSTS, isMarketingHost } from "./lib/marketing-hosts";

export { isMarketingHost } from "./lib/marketing-hosts";

const LEGACY_PUBLIC_SITE_REDIRECTS: Record<string, string> = {
  "gldf.strelva.com": "https://greatlakesdriedfruit.com",
};

// Reserved control-plane subdomains under strelva.com that are NOT tenants.
// `app`/`api` matter for the scaffoldweb.com -> app.strelva.com cutover: without
// this, app.strelva.com would resolve to a phantom tenant "app". `www`/`admin`
// were already excluded inline; they live here now so there is one list.
const RESERVED_SUBDOMAINS = new Set(["www", "admin", "app", "api"]);

const cspBaseDirectives = [
  "default-src 'self'",
  // Clerk's live frontend API is still served from clerk.scaffoldweb.com (CLERK_DOMAIN=scaffoldweb.com);
  // clerk.strelva.com is kept for when the rebrand cutover completes. Allow both so clerk.browser.js loads.
  // No 'unsafe-eval' in prod: nothing in the production runtime needs it (Next `next start` doesn't eval —
  // that's a Turbopack/HMR dev artifact; Clerk's remote SDK, Sentry, and Vercel Analytics contain no
  // eval/new Function). The looser dev/live-preview variant below keeps it. 'unsafe-inline' stays for now
  // (Next bootstrap + JSON-LD + Clerk inline); removing it needs a nonce rollout.
  "script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://*.clerk.com https://clerk.scaffoldweb.com https://clerk.strelva.com https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.unsplash.com https://images.squarespace-cdn.com https://cdn.sanity.io https://*.public.blob.vercel-storage.com https://img.clerk.com https://*.clerk.com https://clerk.scaffoldweb.com https://clerk.strelva.com https://www.google.com https://*.gstatic.com",
  "font-src 'self' data:",
  // Prod frame-src: no http://localhost:* (that's a dev/live-preview need only,
  // kept in the looser variant below).
  "frame-src 'self' https:",
  "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://clerk.scaffoldweb.com https://clerk.strelva.com https://clerk-telemetry.com https://api.stripe.com https://*.supabase.co https://*.upstash.io https://generativelanguage.googleapis.com https://api.resend.com",
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
];

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/no-access",
  "/access-request(.*)",
  "/ai-visibility(.*)",
  "/onboard(.*)",
  "/api/access-request/(.*)",
  "/api/ai-visibility",
  "/api/audit/(.*)",
  "/api/onboard/(.*)",
  "/api/pay/(.*)",
  "/api/health",
  "/api/v1/(.*)",
  "/api/newsletter/subscribe",
  "/api/track",
  "/api/cron/(.*)",
  "/api/billing/webhook",
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
    !hostWithoutPort.endsWith(".strelva.com") &&
    !hostWithoutPort.endsWith(".vercel.app")
  );
}

export function extractTenantFromHost(host: string): { tenant: string | null; isAdminSubdomain: boolean } {
  const normalizedHost = host.toLowerCase();
  const hostWithoutPort = normalizedHost.split(":")[0];

  if (isMarketingHost(host)) {
    return { tenant: null, isAdminSubdomain: false };
  }

  // Production: tenant.strelva.com
  if (hostWithoutPort.endsWith(".strelva.com")) {
    const subdomain = hostWithoutPort.replace(".strelva.com", "");
    if (subdomain.startsWith("admin.")) {
      const tenant = subdomain.replace(/^admin\./, "");
      return tenant
        ? { tenant, isAdminSubdomain: true }
        : { tenant: null, isAdminSubdomain: false };
    }
    if (subdomain && !RESERVED_SUBDOMAINS.has(subdomain)) {
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

export function getOwnershipSettingsRedirectPath(pathname: string): string | null {
  if (/^\/dashboard\/ownership\/?$/.test(pathname)) {
    return "/dashboard/settings#ownership";
  }

  const clientMatch = pathname.match(/^\/client\/([a-z0-9-]+)\/dashboard\/ownership\/?$/);
  if (clientMatch) {
    return `/client/${clientMatch[1]}/dashboard/settings#ownership`;
  }

  return null;
}

export function shouldUseFallbackAuthForAdminHost(host: string, isAdminSubdomain: boolean): boolean {
  return isAdminSubdomain && shouldResolveCustomDomain(host);
}

function buildTenantFallbackUrl(req: NextRequest, tenantId: string, path: string): URL {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://strelva.com";
  const url = new URL(`/client/${tenantId}${path}`, base);
  url.search = req.nextUrl.search;
  return url;
}

export function extractTenantFromClientPath(pathname: string): {
  tenant: string | null;
  targetPath: string;
  shouldRedirectToDashboard: boolean;
} {
  const match = pathname.match(/^\/client\/([a-z0-9-]+)(\/.*)?$/);
  if (!match) {
    return { tenant: null, targetPath: pathname, shouldRedirectToDashboard: false };
  }

  const tenant = match[1];
  const rest = match[2] || "";
  if (!rest || rest === "/") {
    return { tenant, targetPath: "/dashboard", shouldRedirectToDashboard: true };
  }

  return { tenant, targetPath: rest, shouldRedirectToDashboard: false };
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

function isLivePreviewRequest(req: NextRequest): boolean {
  const pathname = req.nextUrl.pathname;
  return pathname === "/api/live-preview" ||
    pathname === "/api/edit-preview" ||
    /^\/client\/[a-z0-9-]+\/api\/(live-preview|edit-preview)$/.test(pathname);
}

function getPreviewFrameAncestors(host: string, protocol: string): string[] {
  const ancestors = new Set([
    "'self'",
    "https://strelva.com",
    "https://www.strelva.com",
    "https://admin.strelva.com",
    "http://localhost:3000",
    "http://localhost:3001",
  ]);

  if (host && !MARKETING_HOSTS.has(host) && !host.endsWith(".strelva.com")) {
    const bare = host.replace(/^(www|admin)\./, "");
    ancestors.add(`${protocol}//${bare}`);
    ancestors.add(`${protocol}//www.${bare}`);
    ancestors.add(`${protocol}//admin.${bare}`);
  }

  return [...ancestors];
}

export function buildContentSecurityPolicy(params: {
  isPreview: boolean;
  isLivePreview?: boolean;
  host: string;
  protocol: string;
}): string {
  if (params.isLivePreview) {
    return [
      "default-src 'self' https: data: blob:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: http://localhost:*",
      "style-src 'self' 'unsafe-inline' https:",
      "img-src 'self' data: blob: https: http://localhost:*",
      "font-src 'self' data: https:",
      "connect-src 'self' https: http://localhost:*",
      "frame-src 'self' https: http://localhost:* http://*.localhost:*",
      "base-uri 'self' https:",
      "form-action 'self'",
      "frame-ancestors 'self' http://localhost:3000 http://localhost:3001 https://strelva.com https://admin.strelva.com",
    ].join("; ");
  }

  const host = params.host.split(":")[0].toLowerCase();
  const frameAncestors = params.isPreview
    ? getPreviewFrameAncestors(host, params.protocol).join(" ")
    : "'none'";

  // Dev only: Turbopack/HMR + React dev tooling need 'unsafe-eval' and the HMR
  // websocket. Prod stays strict (no unsafe-eval). This is the dev case the
  // live-preview variant above didn't cover.
  const directives =
    process.env.NODE_ENV === "production"
      ? cspBaseDirectives
      : cspBaseDirectives.map((d) =>
          d.startsWith("script-src")
            ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: http://localhost:*"
            : d.startsWith("connect-src")
              ? `${d} ws://localhost:* http://localhost:*`
              : d
        );

  return [...directives, `frame-ancestors ${frameAncestors}`].join("; ");
}

function applySecurityHeaders(response: NextResponse, req: NextRequest): NextResponse {
  const livePreviewRequest = isLivePreviewRequest(req);
  response.headers.set(
    "Content-Security-Policy",
    buildContentSecurityPolicy({
      isPreview: isPreviewRequest(req),
      isLivePreview: livePreviewRequest,
      host: req.headers.get("host") || "",
      protocol: req.nextUrl.protocol,
    })
  );
  if (isPreviewRequest(req) || livePreviewRequest) {
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

/**
 * Auth gate (migration Phase 4). When Supabase Auth is configured, gate on the
 * Supabase session; otherwise use Clerk's auth.protect(). Returns a redirect
 * Response when the request is unauthenticated, or null when allowed. Keeping the
 * clerkMiddleware wrapper means `auth` is always available for the Clerk path; the
 * Supabase branch ignores it. (Single-host simplification is a separate follow-up.)
 */
async function gateRequest(
  auth: { protect: (opts: { unauthenticatedUrl: string }) => Promise<unknown> },
  req: NextRequest,
  signInUrl: string
): Promise<NextResponse | null> {
  if (isSupabaseAuthConfigured()) {
    const supabase = createMiddlewareSupabase(req);
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        return applySecurityHeaders(NextResponse.redirect(signInUrl), req);
      }
    }
    return null;
  }
  await auth.protect({ unauthenticatedUrl: signInUrl });
  return null;
}

export default clerkMiddleware(async (auth, req: NextRequest) => {
  const host = req.headers.get("host") || "";
  const pathname = req.nextUrl.pathname;
  const devAccessBypass = isDevAccessBypassEnabled();
  const devPreviewRequest = devAccessBypass && req.nextUrl.searchParams.get("preview") === "true";

  // Public demo entry: /demo -> the demo tenant's dashboard (read-only, no auth).
  if (pathname === "/demo" || pathname === "/demo/") {
    const url = req.nextUrl.clone();
    url.pathname = "/client/demo/dashboard";
    return applySecurityHeaders(NextResponse.redirect(url), req);
  }

  const ownershipSettingsRedirectPath = getOwnershipSettingsRedirectPath(pathname);

  if (ownershipSettingsRedirectPath) {
    const url = req.nextUrl.clone();
    const [nextPathname, hash] = ownershipSettingsRedirectPath.split("#");
    url.pathname = nextPathname;
    url.hash = hash || "";
    return applySecurityHeaders(NextResponse.redirect(url), req);
  }

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
  let tenantFromClientPath = false;
  let clientPathTarget = pathname;

  const extraction = extractTenantFromHost(host);
  tenantId = extraction.tenant;
  isAdminSubdomain = extraction.isAdminSubdomain;

  if (!tenantId) {
    const clientPath = extractTenantFromClientPath(pathname);
    if (clientPath.tenant) {
      tenantId = clientPath.tenant;
      tenantFromClientPath = true;
      clientPathTarget = clientPath.targetPath;

      if (clientPath.shouldRedirectToDashboard) {
        const url = req.nextUrl.clone();
        url.pathname = `/client/${tenantId}/dashboard`;
        return applySecurityHeaders(NextResponse.redirect(url), req);
      }
    }
  }

  if (!tenantId && shouldResolveCustomDomain(host)) {
    const customDomainResult = await resolveTenantFromCustomDomain(hostWithoutPort, req);
    tenantId = customDomainResult.tenant;
    isAdminSubdomain = customDomainResult.isAdminSubdomain;
  }

  // Fallback: extract tenant from the ?tenant= query param (super-admin
  // impersonation). NOT for multi-tenant routing — use a subdomain or
  // /client/{tenant} path instead.
  //
  // SECURITY (honest accounting): the proxy only AUTH-gates this (see `needsAuth`
  // below) — it does NOT verify super-admin here. The actual privilege boundary is
  // DOWNSTREAM: every handler derives the tenant from the x-tenant header this sets
  // and calls requireTenantAccess(), which rejects a non-member. So a non-super-admin
  // who appends ?tenant=X is auth-gated and then access-denied per route. The
  // residual risk is a future route that reads x-tenant WITHOUT requireTenantAccess
  // — defense-in-depth TODO: gate ?tenant= on super-admin at the proxy (needs a
  // middleware super_admins lookup; reviewed change to the auth path).
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
      const url = shouldUseFallbackAuthForAdminHost(host, isAdminSubdomain)
        ? buildTenantFallbackUrl(req, tenantId, "/dashboard")
        : req.nextUrl.clone();
      if (!shouldUseFallbackAuthForAdminHost(host, isAdminSubdomain)) {
        url.pathname = "/dashboard";
      }
      return applySecurityHeaders(NextResponse.redirect(url), req);
    }

    const customAdminHostUsesFallbackAuth = shouldUseFallbackAuthForAdminHost(host, isAdminSubdomain);
    if (
      customAdminHostUsesFallbackAuth &&
      (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up") || pathname === "/no-access")
    ) {
      return applySecurityHeaders(NextResponse.redirect(buildTenantFallbackUrl(req, tenantId, pathname)), req);
    }

    const headers = new Headers(req.headers);
    // Strip client-supplied trust headers before the proxy sets them, so a
    // caller can't smuggle x-preview-mode (serve drafts) or x-client-fallback-root
    // (redirect target) past the conditional sets below. x-tenant is always
    // overwritten next, but delete it here too for a single clean rule.
    headers.delete("x-tenant");
    headers.delete("x-preview-mode");
    headers.delete("x-client-fallback-root");
    headers.set("x-tenant", tenantId);
    if (tenantFromClientPath) {
      headers.set("x-client-fallback-root", `/client/${tenantId}`);
    }

    // Check for preview mode (dashboard iframe access)
    const isPreviewMode = req.nextUrl.searchParams.get("preview") === "true";
    if (isPreviewMode) {
      headers.set("x-preview-mode", "true");
    }

    // Require auth for protected admin subdomain routes, while still allowing
    // Clerk's sign-in/sign-up routes to render on admin.<tenant-domain>.
    const routeIsPublic = isPublicRoute(req);
    const clientPathIsAuthPage =
      tenantFromClientPath &&
      (clientPathTarget.startsWith("/sign-in") ||
        clientPathTarget.startsWith("/sign-up") ||
        clientPathTarget === "/no-access");
    // Public demo: the `demo` tenant renders its dashboard read-only without a
    // session, so prospects can see the product. Safe by construction — every
    // write API is auth-gated (no session -> 401), so a demo viewer can read but
    // never mutate, and only this one hardcoded tenant is exposed.
    const isDemoTenant = tenantId === "demo";
    const needsAuth = !devAccessBypass && !isDemoTenant && (
      (isAdminSubdomain && !routeIsPublic) ||
      (tenantFromQueryParam && !routeIsPublic) ||
      (tenantFromClientPath && !clientPathIsAuthPage)
    );
    if (needsAuth) {
      const signInUrl = tenantFromClientPath || customAdminHostUsesFallbackAuth
        ? buildTenantFallbackUrl(req, tenantId, "/sign-in")
        : new URL("/sign-in", req.url);
      const denied = await gateRequest(auth, req, signInUrl.toString());
      if (denied) return denied;
    }

    if (tenantFromClientPath) {
      const url = req.nextUrl.clone();
      url.pathname = clientPathTarget;
      return applySecurityHeaders(NextResponse.rewrite(url, {
        request: { headers },
      }), req);
    }

    const response = NextResponse.next({
      request: { headers },
    });

    return applySecurityHeaders(response, req);
  }

  if (!devAccessBypass && !isPublicRoute(req)) {
    const signInUrl = new URL("/sign-in", req.url);
    const denied = await gateRequest(auth, req, signInUrl.toString());
    if (denied) return denied;
  }

  // No tenant resolved (apex/marketing host). Strip client-supplied trust
  // headers so a request to an apex host can't smuggle x-tenant/x-preview-mode
  // to a header-trusting route. Tenant-scoped routes also re-check access.
  const fallbackHeaders = new Headers(req.headers);
  fallbackHeaders.delete("x-tenant");
  fallbackHeaders.delete("x-preview-mode");
  fallbackHeaders.delete("x-client-fallback-root");
  return applySecurityHeaders(
    NextResponse.next({ request: { headers: fallbackHeaders } }),
    req
  );
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
