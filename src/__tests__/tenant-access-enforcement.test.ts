import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tenant access-control ENFORCEMENT LOGIC.
 *
 * Completes the isolation story alongside its two siblings:
 *  - tenant-isolation.test.ts        — content STORAGE is scoped per tenant (data layer)
 *  - tenant-isolation-guard.test.ts  — every request-scoped route CALLS the guard (structural)
 *  - this file                       — the guard FUNCTION returns the right allow/deny (logic layer)
 *
 * The gap this closes: the guard test proves routes call `requireTenantAccess`, and the
 * storage test proves data is filed per tenant — but if someone inverted the membership check
 * in `hasTenantAccess` (returned true on a null role, dropped the verified-email gate, etc.),
 * BOTH siblings would still pass while cross-tenant access silently opened. This pins the exact
 * invariant: a member of tenant A can NOT reach tenant B.
 *
 * It exercises the REAL auth functions with the auth primitives mocked (session user, membership
 * role, super-admin flag, dev bypass) — no two-user login harness against the shared prod
 * Supabase. The dev-access bypass short-circuits the whole check, which is precisely why the
 * ungated Playwright harness can't test this and this integration test exists instead.
 */

let bypass = false;
let sessionUser: { id: string; email_confirmed_at: string | null } | null = null;
const superAdminIds = new Set<string>();
const memberships = new Map<string, string>(); // `${userId}:${tenant}` -> role

vi.mock("@/lib/dev-access", () => ({
  isDevAccessBypassEnabled: () => bypass,
}));
vi.mock("@/lib/db/server-client", () => ({
  getSessionUser: () => Promise.resolve(sessionUser),
}));
vi.mock("@/lib/db/repositories", () => ({
  getMembershipRole: (userId: string, tenant: string) =>
    Promise.resolve(memberships.get(`${userId}:${tenant}`) ?? null),
  isSuperAdminUser: (userId: string) => Promise.resolve(superAdminIds.has(userId)),
  // Unused by the isolation path — stubbed so importing the module doesn't pull the DB client.
  listMembershipsForUser: vi.fn(),
  listTenantOwnerIds: vi.fn(),
  upsertMembership: vi.fn(),
  getPendingInvite: vi.fn(),
  markInviteClaimed: vi.fn(),
  getUserByEmail: vi.fn(),
}));
vi.mock("@/lib/redis", () => ({ getRedis: () => null }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: () => Promise.resolve(undefined) }));

import { hasTenantAccess, isSuperAdmin, requireTenantAccess } from "@/lib/auth";

const CONFIRMED = "2026-01-01T00:00:00.000Z";

beforeEach(() => {
  bypass = false;
  sessionUser = null;
  superAdminIds.clear();
  memberships.clear();
});

describe("tenant access enforcement (hasTenantAccess / requireTenantAccess)", () => {
  it("lets a member reach their own tenant but not another", async () => {
    sessionUser = { id: "user-a", email_confirmed_at: CONFIRMED };
    memberships.set("user-a:tenant-a", "owner");

    expect(await hasTenantAccess("tenant-a")).toBe(true);
    expect(await hasTenantAccess("tenant-b")).toBe(false);
  });

  it("returns a 403 from requireTenantAccess for a cross-tenant request", async () => {
    sessionUser = { id: "user-a", email_confirmed_at: CONFIRMED };
    memberships.set("user-a:tenant-a", "owner");

    // Same tenant -> allowed (null = no rejection response).
    expect(await requireTenantAccess("tenant-a")).toBeNull();

    // Other tenant -> a 403 Forbidden response, never null.
    const denied = await requireTenantAccess("tenant-b");
    expect(denied).not.toBeNull();
    expect(denied?.status).toBe(403);
  });

  it("denies an unauthenticated request to any tenant", async () => {
    sessionUser = null;
    expect(await hasTenantAccess("tenant-a")).toBe(false);
    // Unauthenticated (no session) -> 401 Unauthorized, not 403 Forbidden.
    // 403 is reserved for authenticated-but-unauthorized requests.
    expect((await requireTenantAccess("tenant-a"))?.status).toBe(401);
  });

  it("lets a super-admin reach any tenant (cross-tenant is intentional for operators)", async () => {
    sessionUser = { id: "root", email_confirmed_at: CONFIRMED };
    superAdminIds.add("root");

    expect(await isSuperAdmin()).toBe(true);
    expect(await hasTenantAccess("tenant-a")).toBe(true);
    expect(await hasTenantAccess("tenant-b")).toBe(true);
  });

  it("does NOT grant super-admin to an unconfirmed email (verified-email gate)", async () => {
    sessionUser = { id: "root", email_confirmed_at: null };
    superAdminIds.add("root");
    // No membership anywhere -> unconfirmed super-admin falls through to no access.
    expect(await isSuperAdmin()).toBe(false);
    expect(await hasTenantAccess("tenant-a")).toBe(false);
  });

  it("dev-access bypass grants everything (documents why the isolation e2e must run with it OFF)", async () => {
    bypass = true;
    sessionUser = null; // no session at all
    expect(await hasTenantAccess("tenant-a")).toBe(true);
    expect(await hasTenantAccess("tenant-b")).toBe(true);
    expect(await requireTenantAccess("tenant-b")).toBeNull();
  });
});
