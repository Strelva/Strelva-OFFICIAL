import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  rpc: vi.fn(),
  user: { id: "verified-user-id", email: "first@example.test", verified_at: "2026-10-07T12:00:00Z" as string | null },
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { parseArgs, runManageSuperAdmin, usage } from "../../scripts/manage-super-admin";

describe("manage-super-admin CLI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "local-service-role-test-key");
    mocks.user = {
      id: "verified-user-id",
      email: "first@example.test",
      verified_at: "2026-10-07T12:00:00Z",
    };
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.createClient.mockReturnValue({
      from: vi.fn(() => {
        const query = {
          select: vi.fn(() => query),
          ilike: vi.fn(() => query),
          limit: vi.fn(async () => ({ data: [mocks.user], error: null })),
        };
        return query;
      }),
      rpc: mocks.rpc,
    });
  });

  it("documents bootstrap as a service-role, zero-active break-glass command", () => {
    expect(usage()).toMatch(/bootstrap <email>/);
    expect(usage()).toMatch(/zero active super-admins/);
    expect(usage()).toMatch(/verified email/);
  });

  it("calls only the bootstrap RPC with the service-role client and records a reason", async () => {
    const parsed = parseArgs([
      "bootstrap",
      "first@example.test",
      "--reason",
      "Initial operator for isolated preview",
      "--apply",
    ]);
    expect(parsed).toMatchObject({ action: "bootstrap", actorEmail: "", apply: true });
    await runManageSuperAdmin(parsed!);

    expect(mocks.createClient).toHaveBeenCalledWith(
      "http://127.0.0.1:54321",
      "local-service-role-test-key",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    expect(mocks.rpc).toHaveBeenCalledWith("bootstrap_super_admin", {
      p_user_id: "verified-user-id",
      p_reason: "Initial operator for isolated preview",
    });
  });

  it("requires a verified target and makes no RPC call otherwise", async () => {
    mocks.user.verified_at = null;
    const parsed = parseArgs([
      "bootstrap",
      "first@example.test",
      "--reason",
      "Initial operator for isolated preview",
      "--apply",
    ]);

    await expect(runManageSuperAdmin(parsed!)).rejects.toThrow(/complete Supabase email verification and have a provisioned verified user row/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires --apply and keeps bootstrap attribution on the target", async () => {
    const parsed = parseArgs([
      "bootstrap",
      "first@example.test",
      "--reason",
      "Initial operator for isolated preview",
    ]);

    await expect(runManageSuperAdmin(parsed!)).rejects.toThrow(/add --apply to call bootstrap_super_admin/);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(() => parseArgs([
      "bootstrap",
      "first@example.test",
      "--actor",
      "other@example.test",
      "--reason",
      "Initial operator for isolated preview",
      "--apply",
    ])).toThrow(/records its target as the actor/);
  });
});
