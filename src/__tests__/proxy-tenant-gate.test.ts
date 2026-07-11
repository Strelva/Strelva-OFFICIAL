import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mockConfigured = vi.fn(() => true);
const mockCreate = vi.fn();

vi.mock("@/lib/db/server-client", () => ({
  isSupabaseAuthConfigured: () => mockConfigured(),
}));
vi.mock("@/lib/db/middleware-client", () => ({
  createMiddlewareSupabase: () => mockCreate(),
}));

import { requestIsSuperAdmin } from "../proxy";

/** Minimal Supabase double: getUser + the super_admins select chain. */
function supa(opts: { user?: unknown; row?: unknown; throws?: boolean }) {
  return {
    auth: { getUser: async () => ({ data: { user: opts.user ?? null } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            maybeSingle: async () => {
              if (opts.throws) throw new Error("db down");
              return { data: opts.row ?? null };
            },
          }),
        }),
      }),
    }),
  };
}

const req = {} as NextRequest;
const verified = { id: "u1", email_confirmed_at: "2026-01-01T00:00:00Z" };

beforeEach(() => {
  mockConfigured.mockReturnValue(true);
  mockCreate.mockReset();
});

describe("requestIsSuperAdmin — the ?tenant= proxy gate", () => {
  it("true when a verified user has a super_admins row", async () => {
    mockCreate.mockReturnValue(supa({ user: verified, row: { user_id: "u1" } }));
    expect(await requestIsSuperAdmin(req)).toBe(true);
  });

  it("false when the user has no super_admins row (non-admin)", async () => {
    mockCreate.mockReturnValue(supa({ user: verified, row: null }));
    expect(await requestIsSuperAdmin(req)).toBe(false);
  });

  it("false for an unverified email even with a row", async () => {
    mockCreate.mockReturnValue(supa({ user: { id: "u1", email_confirmed_at: null }, row: { user_id: "u1" } }));
    expect(await requestIsSuperAdmin(req)).toBe(false);
  });

  it("false when there is no session user", async () => {
    mockCreate.mockReturnValue(supa({ user: null }));
    expect(await requestIsSuperAdmin(req)).toBe(false);
  });

  it("fail-closed: false when the super_admins query throws", async () => {
    mockCreate.mockReturnValue(supa({ user: verified, throws: true }));
    expect(await requestIsSuperAdmin(req)).toBe(false);
  });

  it("false when Supabase auth isn't configured", async () => {
    mockConfigured.mockReturnValue(false);
    expect(await requestIsSuperAdmin(req)).toBe(false);
  });

  it("false when the middleware client can't be created", async () => {
    mockCreate.mockReturnValue(null);
    expect(await requestIsSuperAdmin(req)).toBe(false);
  });
});
