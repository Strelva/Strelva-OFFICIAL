/**
 * Security coverage for the auth route matcher (`isPublicRoute` / `isCronRoute`)
 * that replaced Clerk's `createRouteMatcher`. The middleware skips the auth gate
 * for a public route, so a path wrongly classified public is an AUTH BYPASS.
 * These lock in the faithful behavior + the path-normalization that stops
 * `//dashboard`-style bypasses.
 */
import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { isPublicRoute, isCronRoute } from "@/proxy";

const req = (pathname: string): NextRequest =>
  ({ nextUrl: { pathname } }) as unknown as NextRequest;

describe("isPublicRoute", () => {
  it("lets only the exact workspace API enforce its own session and JSON errors", () => {
    expect(isPublicRoute(req("/api/workspace"))).toBe(true);
    expect(isPublicRoute(req("/api/workspace/admin"))).toBe(false);
    expect(isPublicRoute(req("/api/workspaces"))).toBe(false);
  });
  it("treats exact public paths as public", () => {
    for (const p of ["/", "/no-access", "/api/health", "/api/track", "/api/billing/webhook"]) {
      expect(isPublicRoute(req(p))).toBe(true);
    }
  });

  it("treats public prefixes (and their sub-paths) as public", () => {
    for (const p of ["/sign-in", "/sign-in/foo", "/sign-up", "/access-request/abc", "/api/v1/content/gldf/hero", "/api/pay/xyz", "/api/internal/domain-map", "/api/webhooks/resend"]) {
      expect(isPublicRoute(req(p))).toBe(true);
    }
  });

  it("treats non-control-plane marketing paths as public (catch-all)", () => {
    for (const p of ["/pricing", "/about", "/guides/seo", "/client/gldf/dashboard"]) {
      expect(isPublicRoute(req(p))).toBe(true);
    }
  });

  it("PROTECTS the control plane (dashboard/admin/api/studio)", () => {
    for (const p of ["/dashboard", "/dashboard/site", "/admin", "/admin/clients", "/api/content/hero", "/api/agent", "/studio", "/api/admin/tenants"]) {
      expect(isPublicRoute(req(p))).toBe(false);
    }
  });

  it("does NOT let a duplicate-slash path bypass the gate (//dashboard → /dashboard)", () => {
    // Without slash-collapse, `//dashboard` would slip past the catch-all as public.
    expect(isPublicRoute(req("//dashboard"))).toBe(false);
    expect(isPublicRoute(req("///admin/clients"))).toBe(false);
    expect(isPublicRoute(req("/api//content/hero"))).toBe(false);
  });

  it("does NOT let percent-encoding hide a protected prefix (/%64ashboard → /dashboard)", () => {
    // decodeURI decodes unreserved chars, so an encoded 'd' can't mask /dashboard.
    expect(isPublicRoute(req("/%64ashboard"))).toBe(false);
  });

  it("fails closed (not public) on a malformed-encoding path", () => {
    expect(isPublicRoute(req("/%ZZ"))).toBe(false);
    expect(isPublicRoute(req("/dashboard/%E0%A4%A"))).toBe(false);
  });

  it("mirrors Clerk's literal-prefix lookahead: /apixyz and /administrator are protected", () => {
    expect(isPublicRoute(req("/apixyz"))).toBe(false);
    expect(isPublicRoute(req("/administrator"))).toBe(false);
  });
});

describe("isCronRoute", () => {
  it("matches only /api/cron/* (after normalization)", () => {
    expect(isCronRoute(req("/api/cron/heartbeat"))).toBe(true);
    expect(isCronRoute(req("//api/cron/heartbeat"))).toBe(true);
    expect(isCronRoute(req("/api/cronjob"))).toBe(false);
    expect(isCronRoute(req("/api/other"))).toBe(false);
    expect(isCronRoute(req("/%ZZ"))).toBe(false);
  });
});
