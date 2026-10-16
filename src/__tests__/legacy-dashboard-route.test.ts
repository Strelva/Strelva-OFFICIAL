/**
 * Route-level proof of the /dashboard retirement (October 16): a real Next
 * request goes through the real proxy, whose forwarded request headers (the
 * tenant and the trusted dashboard path) become the headers the real
 * /dashboard layout reads. The layout calls Next's own redirect(), and the
 * thrown redirect carries status 307 and the workspace Location.
 *
 * Mocked: the session, the tenant's owner-entry resolution, the per-business
 * flags, and the layout's tenant access check (a sentinel: reaching it means
 * the layout went on to render the page). No database, no tenant data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getRedirectStatusCodeFromError, getURLFromRedirectError } from "next/dist/client/components/redirect";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { systemOriginId } from "@/platform/systems/invariants";

const mocks = vi.hoisted(() => ({
  forwarded: new Headers(),
  session: vi.fn(),
  resolve: vi.fn(),
  flag: vi.fn(),
  userId: vi.fn(),
  access: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.forwarded, cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => undefined }) }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/platform/release-flags/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/platform/release-flags/store")>()),
  resolveTenantOwnerEntry: mocks.resolve,
  workspaceReleaseFlagEnabled: mocks.flag,
}));
vi.mock("@/platform/workspaces/business-ownership", () => ({ claimPendingBusinessOwner: vi.fn().mockResolvedValue(null), pendingOwnerInvitationTenants: vi.fn().mockResolvedValue([]) }));
vi.mock("@/platform/infra/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/platform/infra/auth")>()),
  getAuthUserId: mocks.userId,
  hasTenantAccess: mocks.access,
}));
vi.mock("@/products/websites/document-store", () => ({ getPublishedSiteDocument: vi.fn() }));

import proxy from "@/proxy";
import DashboardLayout from "@/app/dashboard/layout";

const WS = "7f000000-0000-4000-8000-000000000010";
const STABLE = "7f000000-0000-4000-8000-0000000000b2";
const SYSTEM = systemOriginId(WS, { kind: "tenant", ref: STABLE });
const owner = { id: "7f000000-0000-4000-8000-000000000002", email: "owner@example.test", email_confirmed_at: "2026-10-07T00:00:00Z" };
const RENDERED = new Error("the layout went on to render the page");

/** Runs one request through the proxy and hands its forwarded headers to the layout. */
async function request(url: string) {
  const response = await proxy(new NextRequest(url, { headers: { host: new URL(url).host } }));
  const forwarded = new Headers();
  for (const [key, value] of response.headers) {
    if (key.startsWith("x-middleware-request-")) forwarded.set(key.slice("x-middleware-request-".length), value);
  }
  mocks.forwarded = forwarded;
  try {
    await DashboardLayout({ children: null });
  } catch (error) {
    if (isRedirectError(error)) return { status: getRedirectStatusCodeFromError(error), location: getURLFromRedirectError(error) };
    if (error === RENDERED) return { status: 200, location: null };
    throw error;
  }
  return { status: 200, location: null };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SCAFFOLD_DEV_UNGATED_ACCESS", "1");
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_OWNER_ENTRY", "1");
  vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "1");
  vi.stubEnv("STRELVA_NEEDS_YOU_RELEASE", "1");
  vi.stubEnv("STRELVA_ASK_RELEASE", "1");
  mocks.session.mockResolvedValue(owner);
  mocks.userId.mockResolvedValue(owner.id);
  mocks.resolve.mockResolvedValue({ workspaceId: WS, tenantStableId: STABLE, ownerEntry: "on", role: "owner", operator: false, tester: false });
  mocks.flag.mockResolvedValue(true);
  mocks.access.mockRejectedValue(RENDERED);
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /client/<tenant>/dashboard/* through the proxy and the /dashboard layout", () => {
  it.each([
    ["/dashboard/leads", `/workspace/inquiries?workspaceId=${WS}`],
    ["/dashboard/reports?view=monthly", `/workspace/recaps?workspaceId=${WS}&period=month`],
    ["/dashboard/site", `/workspace/site?workspaceId=${WS}&system=${SYSTEM}`],
    ["/dashboard", `/workspace?workspaceId=${WS}`],
  ])("%s answers 307 with the workspace Location", async (path, location) => {
    expect(await request(`https://app.strelva.com/client/fictional${path}`)).toEqual({ status: 307, location });
  });

  it("renders the restyled page, not a redirect to Home, when the page's gate is off", async () => {
    mocks.flag.mockImplementation(async (flag: string) => flag !== "systems");
    expect(await request("https://app.strelva.com/client/fictional/dashboard/site")).toEqual({ status: 200, location: null });
    // An ungated page on the same business still moves.
    expect(await request("https://app.strelva.com/client/fictional/dashboard/leads")).toEqual({ status: 307, location: `/workspace/inquiries?workspaceId=${WS}` });
  });

  it("renders /dashboard for a tenant with no business workspace", async () => {
    mocks.resolve.mockResolvedValue({ workspaceId: null, tenantStableId: null, ownerEntry: null, role: null, operator: false, tester: false });
    expect(await request("https://app.strelva.com/client/fictional/dashboard/leads")).toEqual({ status: 200, location: null });
  });
});
