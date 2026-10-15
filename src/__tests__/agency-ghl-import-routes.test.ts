import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ session: vi.fn(), rate: vi.fn(), eligibility: vi.fn(), tables: {} as Record<string, unknown> }));
vi.mock("@/platform/connections/server", () => ({ connectionEligibilityFor: mocks.eligibility }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.rate }));
vi.mock("@/platform/infra/db/client", () => ({
  getSupabase: () => ({
    from(table: string) {
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "or", "gte", "order", "limit", "insert", "update", "delete", "single"]) builder[method] = () => builder;
      builder.maybeSingle = () => builder;
      builder.then = (resolve: (value: unknown) => unknown) => resolve({ data: mocks.tables[table] ?? null, error: null });
      return builder;
    },
  }),
}));

import { GET as start } from "@/app/api/workspace/agency-clients/gohighlevel/oauth/route";
import { GET as callback } from "@/app/api/workspace/agency-clients/gohighlevel/oauth/callback/route";
import { DELETE as disconnect, GET as read } from "@/app/api/workspace/agency-clients/gohighlevel/route";
import { POST as webhook } from "@/app/api/webhooks/gohighlevel/route";
import { isPublicRoute } from "@/proxy";
import { createGhlOAuthState, GHL_STATE_COOKIE } from "@/products/agency-clients/gohighlevel";

const ORIGIN = "https://app.example.test";
const AGENCY = "a9100000-0000-4000-8000-000000000020";
const USER = "a9100000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eligibility.mockResolvedValue({ eligible: true, through: { kind: "platform" } });
  mocks.tables = { workspaces: { kind: "agency" }, workspace_memberships: { role: "owner" } };
  mocks.session.mockResolvedValue({ id: USER, email: "owner@agency.example.test", email_confirmed_at: "2026-10-12" });
  mocks.rate.mockResolvedValue(false);
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("APP_URL", ORIGIN);
  vi.stubEnv("INTERNAL_API_SECRET", "ghl-route-test-secret");
});
afterEach(() => vi.unstubAllEnvs());

describe("GoHighLevel import routes", () => {
  it("are all closed while STRELVA_GHL_IMPORT_RELEASE is off", async () => {
    const responses = await Promise.all([
      start(new Request(`${ORIGIN}/api/workspace/agency-clients/gohighlevel/oauth?workspaceId=${AGENCY}`)),
      callback(new Request(`${ORIGIN}/api/workspace/agency-clients/gohighlevel/oauth/callback?code=c`)),
      read(new Request(`${ORIGIN}/api/workspace/agency-clients/gohighlevel?workspaceId=${AGENCY}`)),
      disconnect(new Request(`${ORIGIN}/api/workspace/agency-clients/gohighlevel?workspaceId=${AGENCY}`, { method: "DELETE", headers: { origin: ORIGIN, "content-type": "application/json" } })),
      webhook(new Request(`${ORIGIN}/api/webhooks/gohighlevel`, { method: "POST", body: "{}" })),
    ]);
    expect(responses.map((response) => response.status)).toEqual([503, 503, 503, 503, 503]);
  });

  it("keep the webhook outside session auth and the agency routes inside it", () => {
    const req = (path: string) => ({ nextUrl: new URL(`${ORIGIN}${path}`) }) as unknown as NextRequest;
    expect(isPublicRoute(req("/api/webhooks/gohighlevel"))).toBe(true);
    expect(isPublicRoute(req("/api/workspace/agency-clients/gohighlevel"))).toBe(false);
  });

  describe("with the flag on", () => {
    beforeEach(() => vi.stubEnv("STRELVA_GHL_IMPORT_RELEASE", "1"));

    it("refuses to start without Marketplace app credentials", async () => {
      const response = await start(new Request(`${ORIGIN}/api/workspace/agency-clients/gohighlevel/oauth?workspaceId=${AGENCY}`));
      expect(response.status).toBe(503);
    });

    it("refuses consent when provider access is unavailable, even with the release and credentials on", async () => {
      vi.stubEnv("HIGHLEVEL_CLIENT_ID", "fixture-client");
      vi.stubEnv("HIGHLEVEL_CLIENT_SECRET", "fixture-secret");
      mocks.eligibility.mockResolvedValue({ eligible: false, reason: "not_configured", message: "HighLevel is coming soon." });
      const response = await start(new Request(`${ORIGIN}/api/workspace/agency-clients/gohighlevel/oauth?workspaceId=${AGENCY}`));
      expect(response.status).toBe(503);
      expect(response.headers.get("location")).toBeNull();
      expect(await response.json()).toMatchObject({ error: "HighLevel is coming soon." });
    });

    it("starts the agency consent with state in the URL and in an HttpOnly cookie", async () => {
      vi.stubEnv("HIGHLEVEL_CLIENT_ID", "fixture-client");
      vi.stubEnv("HIGHLEVEL_CLIENT_SECRET", "fixture-secret");
      const response = await start(new Request(`${ORIGIN}/api/workspace/agency-clients/gohighlevel/oauth?workspaceId=${AGENCY}`));
      expect(response.status).toBe(307);
      const target = new URL(response.headers.get("location")!);
      expect(target.hostname).toBe("marketplace.gohighlevel.com");
      expect(target.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/workspace/agency-clients/gohighlevel/oauth/callback`);
      const cookie = response.headers.get("set-cookie") ?? "";
      expect(cookie).toContain(`${GHL_STATE_COOKIE}=`);
      expect(cookie.toLowerCase()).toContain("httponly");
    });

    it("refuses a member who isn't an agency owner or admin", async () => {
      mocks.tables.workspace_memberships = { role: "member" };
      const response = await start(new Request(`${ORIGIN}/api/workspace/agency-clients/gohighlevel/oauth?workspaceId=${AGENCY}`));
      expect(response.status).toBe(403);
    });

    it("refuses a callback that didn't start in Strelva", async () => {
      const response = await callback(new Request(`${ORIGIN}/api/workspace/agency-clients/gohighlevel/oauth/callback?code=c`));
      const target = new URL(response.headers.get("location")!);
      expect(target.searchParams.get("highlevelError")).toMatch(/Start the HighLevel connection from Strelva/);
    });

    it("refuses a cookie state that belongs to someone else", async () => {
      const state = createGhlOAuthState({ workspaceId: AGENCY, userId: "a9100000-0000-4000-8000-000000000099" });
      const response = await callback(new Request(`${ORIGIN}/api/workspace/agency-clients/gohighlevel/oauth/callback?code=c`, { headers: { cookie: `${GHL_STATE_COOKIE}=${encodeURIComponent(state)}` } }));
      expect(new URL(response.headers.get("location")!).searchParams.get("highlevelError")).toMatch(/couldn't be verified/);
    });

    it("reports a missing connection without calling HighLevel", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const response = await read(new Request(`${ORIGIN}/api/workspace/agency-clients/gohighlevel?workspaceId=${AGENCY}&rows=1`));
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: "ghl_not_connected" });
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it("rejects an unsigned delivery", async () => {
      const response = await webhook(new Request(`${ORIGIN}/api/webhooks/gohighlevel`, { method: "POST", body: JSON.stringify({ type: "INSTALL", companyId: "c1", locationId: "l1" }) }));
      expect(response.status).toBe(401);
    });
  });
});
