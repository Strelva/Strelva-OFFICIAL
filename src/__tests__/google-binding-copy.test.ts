import { describe, expect, it, vi } from "vitest";
import { parseCopyArgs, runGoogleBindingCopy, type CopyDeps, type RedisGrant } from "../../scripts/google-binding-copy";

// The Redis -> Postgres Google grant copy. Every dependency is injected; no
// Redis, Postgres or Google is touched. Tokens below are fictional.

const WS = "ab000000-0000-4000-8000-000000000010";
const grants: Record<string, RedisGrant | null> = {
  mooney: { status: "connected", scopes: ["https://www.googleapis.com/auth/business.manage"], refreshToken: "1//fictional-refresh", accessToken: "ya29.fictional" },
  legacy: { status: "connected", refreshToken: "1//legacy-refresh" },
  gldf: { status: "needs_reauth", scopes: [], refreshToken: "1//gldf-refresh" },
  unlinked: { status: "connected", refreshToken: "1//unlinked-refresh" },
  notoken: { status: "connected" },
  nogoogle: null,
};

function deps(over: Partial<CopyDeps> = {}): CopyDeps & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    tenants: async () => Object.keys(grants).map((id, i) => ({ id, stableId: `ab000000-0000-4000-8000-00000000000${i}` })),
    redisGrant: async (id) => grants[id] ?? null,
    redisMeta: async (id) => (id === "mooney" ? { accountId: "accounts/111", locationId: "333" } : id === "legacy" ? { accountId: "accounts/2" } : null),
    target: async (id) => (id === "unlinked" ? null : { workspaceId: WS, tenantStableId: `stable-${id}` }),
    existing: async (id) => id === "gldf",
    encryptionReady: () => true,
    write: vi.fn(async () => ({ status: "created" as const, id: "binding-1" })),
    writeLocation: vi.fn(async () => undefined),
    verify: vi.fn(async () => ({ ok: true, reason: "accounts_listed" })),
    log: (line) => lines.push(line),
    ...over,
  };
}

describe("copy-google-bindings arguments", () => {
  it("defaults to a dry run and rejects unknown flags", () => {
    expect(parseCopyArgs([])).toMatchObject({ apply: false, verifyGoogle: false, jacobsYes: false });
    expect(() => parseCopyArgs(["--force"])).toThrow("Unknown flag");
    expect(() => parseCopyArgs(["--apply", "--dry-run"])).toThrow("not both");
    expect(() => parseCopyArgs(["Bad_Slug"])).toThrow("not a tenant slug");
  });
});

describe("dry run", () => {
  it("counts without writing, verifying or printing any token", async () => {
    const d = deps();
    const out = await runGoogleBindingCopy({ apply: false, verifyGoogle: false, jacobsYes: false, databaseUrl: "https://prod.supabase.co" }, d);
    expect(d.write).not.toHaveBeenCalled();
    expect(d.writeLocation).not.toHaveBeenCalled();
    expect(d.verify).not.toHaveBeenCalled();
    expect(out.mode).toBe("dry-run");
    expect(out.totals).toMatchObject({ tenants: 6, withGoogle: 5, connected: 4, scopesRecorded: 2, scopesAbsent: 3, withMeta: 1, linked: 4, alreadyCopied: 1, toCopy: 2 });
    expect(out.tenants.find((t) => t.tenantId === "legacy")).toMatchObject({ scopesRecorded: false, meta: "partial", result: "would_copy" });
    expect(out.tenants.find((t) => t.tenantId === "unlinked")?.result).toBe("skipped_unlinked");
    expect(out.tenants.find((t) => t.tenantId === "notoken")?.result).toBe("skipped_no_refresh_token");
    const printed = JSON.stringify(out) + d.lines.join("\n");
    expect(printed).not.toMatch(/1\/\/|ya29/);
  });

  it("works with no SECRETS_ENC_KEY because it writes nothing", async () => {
    const out = await runGoogleBindingCopy({ apply: false, verifyGoogle: false, jacobsYes: false }, deps({ encryptionReady: () => false }));
    expect(out.database).toBe("not configured");
  });
});

describe("--apply guards", () => {
  it("refuses without SECRETS_ENC_KEY, before reading anything", async () => {
    const d = deps({ encryptionReady: () => false, tenants: vi.fn(async () => []) });
    await expect(runGoogleBindingCopy({ apply: true, verifyGoogle: false, jacobsYes: true, databaseUrl: "http://127.0.0.1:54321" }, d))
      .rejects.toThrow("SECRETS_ENC_KEY");
    expect(d.tenants).not.toHaveBeenCalled();
  });

  it("refuses a non-local database without Jacob's yes", async () => {
    await expect(runGoogleBindingCopy({ apply: true, verifyGoogle: false, jacobsYes: false, databaseUrl: "https://prod.supabase.co" }, deps()))
      .rejects.toThrow("--i-have-jacobs-yes");
  });

  it("refuses with no database", async () => {
    await expect(runGoogleBindingCopy({ apply: true, verifyGoogle: false, jacobsYes: true }, deps())).rejects.toThrow("no database");
  });

  it("copies linked grants with a refresh token, keeps legacy scopes absent, and writes the location", async () => {
    const d = deps();
    const out = await runGoogleBindingCopy({ apply: true, verifyGoogle: false, jacobsYes: false, databaseUrl: "http://localhost:54321" }, d);
    expect((d.write as ReturnType<typeof vi.fn>).mock.calls.map(([input]) => input.tenantStableId)).toEqual(["stable-mooney", "stable-legacy"]);
    expect((d.write as ReturnType<typeof vi.fn>).mock.calls[1]![0].grant.scopes).toBeUndefined();
    expect(d.writeLocation).toHaveBeenCalledTimes(1);
    expect(d.writeLocation).toHaveBeenCalledWith("binding-1", { accountId: "accounts/111", locationId: "333" });
    expect(out.totals).toMatchObject({ copied: 2, failed: 0 });
    expect(out.tenants.find((t) => t.tenantId === "gldf")?.result).toBe("exists");
  });

  it("reports a failed copy per tenant and keeps going", async () => {
    const d = deps({ write: vi.fn(async () => { throw new Error("upsert_workspace_account_binding failed: account_binding_tenant_not_linked"); }) });
    const out = await runGoogleBindingCopy({ apply: true, verifyGoogle: false, jacobsYes: false, databaseUrl: "http://localhost:54321" }, d);
    expect(out.totals.failed).toBe(2);
    expect(d.lines.some((line) => line.includes("account_binding_tenant_not_linked"))).toBe(true);
  });
});

describe("--verify-google", () => {
  it("always needs Jacob's yes, even against a local database", async () => {
    const d = deps();
    await expect(runGoogleBindingCopy({ apply: false, verifyGoogle: true, jacobsYes: false, databaseUrl: "http://localhost:54321" }, d))
      .rejects.toThrow("--verify-google");
    expect(d.verify).not.toHaveBeenCalled();
  });

  it("verifies only rows that exist in Postgres, read-only", async () => {
    const d = deps({ verify: vi.fn(async (id: string) => (id === "gldf" ? { ok: false, reason: "invalid_grant" } : { ok: true, reason: "accounts_listed" })) });
    const out = await runGoogleBindingCopy({ apply: false, verifyGoogle: true, jacobsYes: true, databaseUrl: "http://localhost:54321" }, d);
    expect(d.write).not.toHaveBeenCalled();
    expect((d.verify as ReturnType<typeof vi.fn>).mock.calls.map(([id]) => id)).toEqual(["gldf"]);
    expect(out.totals).toMatchObject({ verified: 0, verifyFailed: 1 });
  });
});
