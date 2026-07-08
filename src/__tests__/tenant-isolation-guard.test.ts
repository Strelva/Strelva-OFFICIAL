import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

/**
 * Tenant-isolation guard.
 *
 * RLS is off in prod (AGENTS.md: tenant isolation is "enforced at the APPLICATION layer …
 * the service-role client BYPASSES row-level security"). So the ONLY thing stopping one
 * tenant from reading another's data is that every membership-scoped API route calls
 * `requireTenantAccess` / `requireTenantPermission`. A single route that derives the tenant
 * from the request (`getTenantFromHeaders` / `requireTenantFromHeaders`) but forgets the
 * guard is a silent cross-tenant data leak — the audit's #1 reliability/security risk.
 *
 * This test fails closed: any route that reads the tenant from the request must carry a
 * guard, unless it's an explicit, commented public-storefront exception below. A new tenant
 * route without a guard breaks the build and forces a deliberate classification.
 *
 * Signal choice: we key on the tenant-derivation call, not a path-prefix heuristic — that's
 * the exact failure mode and has ~zero false positives (admin routes gate on `isSuperAdmin`,
 * cron on `validateCronRequest`, `/api/v1/*` on a validated path slug, webhooks on a
 * signature — none of those derive a membership tenant from headers, so they're not in scope
 * here). Residual limitation (matches the strength of the existing route-scan tests in
 * production-readiness-rules): it's textual — the guard is mentioned, not proven awaited on
 * every exported HTTP method — and it does not catch a route that illegitimately scopes by a
 * request-BODY tenantId (separately forbidden by AGENTS.md: "never from request input").
 */

const API_DIR = path.join(process.cwd(), "src/app/api");

// Deriving the tenant from the request context ⇒ the route is membership-scoped.
const TENANT_FROM_REQUEST = /getTenantFromHeaders|requireTenantFromHeaders/;
const GUARD = /requireTenantAccess\(|requireTenantPermission\(/;

// Public, unauthenticated storefront endpoints. They legitimately derive the tenant from the
// trusted host header but serve anonymous VISITORS (no membership), so `requireTenantAccess`
// would wrongly 403 them. They protect via rate-limiting + input validation instead. Keep this
// list TINY and justified — every entry is a deliberate exception to the isolation rule.
const PUBLIC_STOREFRONT_ALLOWLIST = new Set([
  "booking/route.ts", // public booking submission
  "booking/availability/route.ts", // public availability lookup
  "checkout/route.ts", // public storefront checkout
  "newsletter/subscribe/route.ts", // public newsletter opt-in
  "track/route.ts", // public page-view beacon (legacy sibling of /api/v1/track)
]);

function allRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...allRouteFiles(full));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

describe("tenant-isolation guard", () => {
  const routes = allRouteFiles(API_DIR);

  it("discovers the API route files (sanity)", () => {
    expect(routes.length).toBeGreaterThan(100);
  });

  it("every route that derives the tenant from the request calls a tenant guard", () => {
    const unguarded: string[] = [];
    for (const file of routes) {
      const rel = path.relative(API_DIR, file);
      const source = readFileSync(file, "utf8");
      if (!TENANT_FROM_REQUEST.test(source)) continue; // not membership-scoped
      if (GUARD.test(source)) continue; // guarded — good
      if (PUBLIC_STOREFRONT_ALLOWLIST.has(rel)) continue; // explicit public exception
      unguarded.push(rel);
    }
    expect(
      unguarded,
      "these routes read the tenant from the request but never call requireTenantAccess/requireTenantPermission — a cross-tenant leak. Add the guard, or (if the route is genuinely public) add it to PUBLIC_STOREFRONT_ALLOWLIST with a reason.",
    ).toEqual([]);
  });

  it("keeps the public-storefront allowlist honest (no stale entries)", () => {
    for (const rel of PUBLIC_STOREFRONT_ALLOWLIST) {
      const source = readFileSync(path.join(API_DIR, rel), "utf8"); // throws if moved/deleted
      // If an allowlisted route GAINED a guard, it's no longer an exception — drop it.
      expect(
        GUARD.test(source),
        `${rel} is allowlisted as public but now calls a tenant guard — remove it from PUBLIC_STOREFRONT_ALLOWLIST.`,
      ).toBe(false);
      // And it must still derive the tenant from the request (else it doesn't belong here).
      expect(
        TENANT_FROM_REQUEST.test(source),
        `${rel} no longer derives the tenant from the request — remove it from PUBLIC_STOREFRONT_ALLOWLIST.`,
      ).toBe(true);
    }
  });
});
