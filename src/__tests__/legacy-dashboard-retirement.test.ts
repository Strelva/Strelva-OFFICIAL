/**
 * October 16, 2026: the legacy /dashboard is retired as a second owner app.
 * One table per tenant state, run through the same server function the
 * dashboard layout and every page call (dashboardRoutingFor), with the
 * session, the tenant's owner-entry resolution and the per-business flags
 * mocked. No database, no tenant data.
 *
 * Rule under test:
 * - A tenant with no business workspace keeps /dashboard ("render").
 * - A person on a linked tenant who is a member of that workspace, with owner
 *   entry on for them, is redirected on every /dashboard page: to the exact
 *   workspace home when that home is on, otherwise to workspace Home.
 * - Anyone who could not open the workspace (no membership, entry off for
 *   them, signed out, read failed, the public demo) is never redirected.
 * - Only an operator's ?legacy=1 renders the old page for a moved person.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { systemOriginId } from "@/platform/systems/invariants";

const mocks = vi.hoisted(() => ({ session: vi.fn(), resolve: vi.fn(), flag: vi.fn(), headers: vi.fn() }));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: (location: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { location }); } }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/platform/release-flags/store", () => ({ resolveTenantOwnerEntry: mocks.resolve, workspaceReleaseFlagEnabled: mocks.flag }));
vi.mock("@/platform/workspaces/business-ownership", () => ({ claimPendingBusinessOwner: vi.fn().mockResolvedValue(null), pendingOwnerInvitationTenants: vi.fn().mockResolvedValue([]) }));

import { dashboardRoutingFor, ownerEntryForTenant, redirectIfDashboardPageMoved, DASHBOARD_PATH_HEADER } from "@/platform/owner-entry/server";

const WS = "7f000000-0000-4000-8000-000000000010";
const STABLE = "7f000000-0000-4000-8000-0000000000b2";
const SYSTEM = systemOriginId(WS, { kind: "tenant", ref: STABLE });
const HOME = `/workspace?workspaceId=${WS}`;
const owner = { id: "7f000000-0000-4000-8000-000000000002", email: "owner@example.test", email_confirmed_at: "2026-10-07T00:00:00Z" };
const linked = { workspaceId: WS, tenantStableId: STABLE, ownerEntry: "on", role: "owner", operator: false, tester: false };

/** The deep links an owner actually has in bookmarks, emails and client sites. */
const DEEP_LINKS: Array<[string, string]> = [
  ["/dashboard", HOME],
  ["/dashboard/review", HOME],
  ["/dashboard/chat", `/workspace?view=ask&workspaceId=${WS}`],
  ["/dashboard/site", `/workspace/site?workspaceId=${WS}&system=${SYSTEM}`],
  ["/dashboard/assets", `/workspace/site?workspaceId=${WS}&system=${SYSTEM}&tab=photos`],
  ["/dashboard/history?request=evt_42", `/workspace/site?workspaceId=${WS}&system=${SYSTEM}&tab=history&request=evt_42`],
  ["/dashboard/sources/google", `/workspace/site?workspaceId=${WS}&system=${SYSTEM}&tab=source&source=google`],
  ["/dashboard/leads", `/workspace/inquiries?workspaceId=${WS}`],
  ["/dashboard/reviews", `/workspace/reviews?workspaceId=${WS}`],
  ["/dashboard/analytics?range=month", `/workspace/results?workspaceId=${WS}&range=month`],
  ["/dashboard/reports?view=monthly", `/workspace/recaps?workspaceId=${WS}&period=month`],
  ["/dashboard/schedule", `/workspace/bookings?workspaceId=${WS}&view=week`],
  ["/dashboard/settings", `/workspace/business-details?workspaceId=${WS}`],
  ["/dashboard/settings?checkout=success", `/workspace?view=settings&workspaceId=${WS}`],
  ["/dashboard/ownership", `/workspace/business-details?workspaceId=${WS}#ownership`],
  ["/dashboard/no/such/page", HOME],
];

function allOn() {
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_OWNER_ENTRY", "1");
  vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "1");
  vi.stubEnv("STRELVA_NEEDS_YOU_RELEASE", "1");
  vi.stubEnv("STRELVA_ASK_RELEASE", "1");
}

beforeEach(() => {
  vi.resetAllMocks();
  allOn();
  mocks.session.mockResolvedValue(owner);
  mocks.resolve.mockResolvedValue(linked);
  mocks.flag.mockResolvedValue(true);
  mocks.headers.mockResolvedValue(new Headers());
});
afterEach(() => vi.unstubAllEnvs());

describe("a tenant with a business workspace: every /dashboard page redirects", () => {
  it.each(DEEP_LINKS)("%s goes to its exact workspace home", async (path, location) => {
    expect(await dashboardRoutingFor("fictional", path)).toMatchObject({ kind: "redirect", location });
  });

  it.each(["member", "admin"])("a %s of the workspace is moved the same way as the owner", async (role) => {
    mocks.resolve.mockResolvedValue({ ...linked, role });
    expect(await dashboardRoutingFor("fictional", "/dashboard/leads")).toMatchObject({ kind: "redirect", location: `/workspace/inquiries?workspaceId=${WS}` });
  });

  it("lands on Home, never the old page, where the business's exact home is not on yet", async () => {
    mocks.flag.mockResolvedValue(false); // systems off for this business
    vi.stubEnv("STRELVA_NEEDS_YOU_RELEASE", "0");
    vi.stubEnv("STRELVA_ASK_RELEASE", "0");
    for (const path of ["/dashboard", "/dashboard/review", "/dashboard/chat", "/dashboard/site", "/dashboard/assets", "/dashboard/store", "/dashboard/members", "/dashboard/roster"]) {
      expect(await dashboardRoutingFor("fictional", path), path).toMatchObject({ kind: "redirect", location: HOME });
    }
    // Pages with no gate keep their exact home.
    expect(await dashboardRoutingFor("fictional", "/dashboard/leads")).toMatchObject({ kind: "redirect", location: `/workspace/inquiries?workspaceId=${WS}` });
  });

  it("reads the trusted path the proxy saw when the caller passes none", async () => {
    mocks.headers.mockResolvedValue(new Headers({ [DASHBOARD_PATH_HEADER]: "/dashboard/reviews" }));
    expect(await dashboardRoutingFor("fictional")).toMatchObject({ kind: "redirect", location: `/workspace/reviews?workspaceId=${WS}` });
  });

  it("redirects a soft navigation from inside a page too", async () => {
    mocks.headers.mockResolvedValue(new Headers({ [DASHBOARD_PATH_HEADER]: "/dashboard/analytics?range=week" }));
    await expect(redirectIfDashboardPageMoved("fictional", "/analytics")).rejects.toMatchObject({ location: `/workspace/results?workspaceId=${WS}&range=week` });
  });

  it("keeps the old page only for an operator who asks with ?legacy=1", async () => {
    mocks.resolve.mockResolvedValue({ ...linked, role: "admin", operator: true });
    expect(await dashboardRoutingFor("fictional", "/dashboard/leads?legacy=1")).toMatchObject({ kind: "render-with-back", homeHref: HOME });
    mocks.resolve.mockResolvedValue(linked);
    expect(await dashboardRoutingFor("fictional", "/dashboard/leads?legacy=1")).toMatchObject({ kind: "redirect" });
  });
});

describe("tenant states that keep /dashboard", () => {
  const stays: Array<[string, () => void]> = [
    ["a tenant with no business workspace", () => mocks.resolve.mockResolvedValue({ workspaceId: null, tenantStableId: null, ownerEntry: null, role: null, operator: false, tester: false })],
    ["a signed-in person who is not a member of the linked workspace", () => mocks.resolve.mockResolvedValue({ ...linked, role: null })],
    ["an operator who is not a member", () => mocks.resolve.mockResolvedValue({ ...linked, role: null, operator: true })],
    ["a business whose owner entry is switched off", () => mocks.resolve.mockResolvedValue({ ...linked, ownerEntry: "off" })],
    ["a business open to operators only, for a client", () => mocks.resolve.mockResolvedValue({ ...linked, ownerEntry: "operators" })],
    ["a business with no owner-entry row while the env is per-business", () => { vi.stubEnv("STRELVA_OWNER_ENTRY", "workspace"); mocks.resolve.mockResolvedValue({ ...linked, ownerEntry: null }); }],
    ["owner entry switched off everywhere", () => vi.stubEnv("STRELVA_OWNER_ENTRY", "0")],
    ["the workspace release off", () => vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0")],
    ["a signed-out visitor", () => mocks.session.mockResolvedValue(null)],
    ["an unconfirmed email", () => mocks.session.mockResolvedValue({ ...owner, email_confirmed_at: null })],
    ["a failed owner-entry read", () => mocks.resolve.mockRejectedValue(new Error("database unavailable"))],
  ];
  it.each(stays)("%s", async (_name, arrange) => {
    arrange();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const [path] of DEEP_LINKS) expect(await dashboardRoutingFor("fictional", path), path).toEqual({ kind: "render" });
  });

  it("the public demo never redirects and never reads a session", async () => {
    expect(await ownerEntryForTenant("demo")).toEqual({ kind: "dashboard", reason: "demo" });
    expect(await dashboardRoutingFor("demo", "/dashboard/site")).toEqual({ kind: "render" });
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("reads nothing and writes nothing about a tenant while owner entry is off", async () => {
    vi.stubEnv("STRELVA_OWNER_ENTRY", "0");
    await dashboardRoutingFor("fictional", "/dashboard");
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.flag).not.toHaveBeenCalled();
  });
});
