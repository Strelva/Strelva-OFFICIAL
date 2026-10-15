import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// STRELVA_GOOGLE_BINDINGS alone breaks Google reconnects. Real client-records
// durableRecordAuthority runs here; only the store's qualification is stubbed.
const readSource = vi.hoisted(() => vi.fn());
vi.mock("@/lib/workspace-ports", async importOriginal => {
  const original = await importOriginal<typeof import("@/lib/workspace-ports")>();
  return { ...original, workspacePorts: () => ({ ...original.workspacePorts(), clientRecords: async () => ({ clientRecordReadSource: readSource }) }) };
});
vi.mock("@/platform/account-bindings/google-policy", async original => ({ ...await original<object>(), assertGoogleGrantEligible: async () => {} }));

import { googleBindingsFlipPrerequisites, googleBindingsFlipReady } from "@/platform/account-bindings/flip-readiness";
import { beginGoogleReconnectOperation } from "@/lib/google-access";
import { setAccountBindingsDb } from "@/platform/account-bindings/store";
import { parseReadinessArgs, runGoogleBindingsReadiness, type ReadinessDeps } from "../../scripts/google-bindings-readiness-core";

const STABLE = "ab000000-0000-4000-8000-0000000000b1";
const WORKSPACE = "ab000000-0000-4000-8000-000000000010";
const SECRET_VALUE = "fictional-never-printed-value";
const full = {
  SECRETS_ENC_KEY: SECRET_VALUE, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: SECRET_VALUE,
  STRELVA_CLIENT_RECORDS_DUAL_WRITE: "1", STRELVA_CLIENT_RECORDS_READ: "provider_connections,provider_metadata",
};

describe("flip prerequisites", () => {
  it("with STRELVA_GOOGLE_BINDINGS=1 alone, names the missing client-records items", () => {
    const items = googleBindingsFlipPrerequisites({ STRELVA_GOOGLE_BINDINGS: "1" });
    const failing = items.filter(item => !item.ok).map(item => item.key);
    expect(failing).toEqual(expect.arrayContaining([
      "STRELVA_CLIENT_RECORDS_DUAL_WRITE=1",
      "STRELVA_CLIENT_RECORDS_READ includes provider_connections",
      "STRELVA_CLIENT_RECORDS_READ includes provider_metadata",
    ]));
    expect(googleBindingsFlipReady({ STRELVA_GOOGLE_BINDINGS: "1" })).toBe(false);
  });

  it("is ready only with every item, and DUAL_WRITE_PG=0 breaks it", () => {
    expect(googleBindingsFlipReady(full)).toBe(true);
    expect(googleBindingsFlipReady({ ...full, DUAL_WRITE_PG: "0" })).toBe(false);
    expect(googleBindingsFlipReady({ ...full, STRELVA_CLIENT_RECORDS_READ: "provider_connections" })).toBe(false);
    expect(googleBindingsFlipReady({ ...full, SECRETS_ENC_KEY: " " })).toBe(false);
  });

  it("never carries an env value", () => {
    expect(JSON.stringify(googleBindingsFlipPrerequisites(full))).not.toContain(SECRET_VALUE);
  });
});

describe("a Google reconnect with the flag on", () => {
  beforeEach(() => {
    vi.stubEnv("SECRETS_ENC_KEY", "test-only-binding-key");
    readSource.mockResolvedValue("postgres");
    setAccountBindingsDb({ rpc: async name => ({ data: name === "read_legacy_google_operation"
      ? { tenantId: "mooney", tenantStableId: STABLE, workspaceId: WORKSPACE, bindingId: null, bindingUpdatedAt: null, locationDigest: null, startedAt: new Date().toISOString() } : null, error: null }) });
  });
  afterEach(() => { setAccountBindingsDb(undefined); vi.unstubAllEnvs(); });

  it("fails with the flag alone", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1");
    await expect(beginGoogleReconnectOperation("mooney", Date.now())).rejects.toThrow("Google reconnect persistence is unavailable.");
  });

  it("succeeds once every prerequisite is set", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1");
    vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "1");
    vi.stubEnv("STRELVA_CLIENT_RECORDS_READ", "provider_connections,provider_metadata");
    expect(googleBindingsFlipPrerequisites(process.env).every(item => item.ok || item.key.startsWith("GOOGLE_"))).toBe(true);
    await expect(beginGoogleReconnectOperation("mooney", Date.now())).resolves.toMatchObject({ tenantId: "mooney" });
  });
});

describe("the readiness command core", () => {
  const copyTotals = (toCopy: number) => ({ mode: "dry-run" as const, database: "local" as const, tenants: [], totals: { tenants: 3, withGoogle: 3, connected: 3, scopesRecorded: 3, scopesAbsent: 0, withMeta: 3, linked: 3, alreadyCopied: 3 - toCopy, toCopy, copied: 0, failed: 0, verified: 0, verifyFailed: 0 } });
  function deps(over: Partial<ReadinessDeps> = {}): ReadinessDeps & { lines: string[] } {
    const lines: string[] = [];
    return { env: full, fallbacks: async () => Array.from({ length: 30 }, (_, i) => ({ date: `d${i}`, counts: {} })), copyDryRun: async () => copyTotals(0), log: line => lines.push(line), lines, ...over };
  }

  it("is ready when prerequisites hold, 30 days show zero fallbacks and nothing is left to copy", async () => {
    const d = deps();
    const report = await runGoogleBindingsReadiness({ jacobsYes: false, json: false, databaseUrl: "http://127.0.0.1:54321" }, d);
    expect(report).toMatchObject({ database: "local", flipReady: true, fallbacks: { days: 30, total: 0, zero: true }, copy: { toCopy: 0 } });
  });

  it("counts fallbacks by kind and is not ready while any remain", async () => {
    const d = deps({ fallbacks: async (): Promise<Array<{ date: string; counts: Record<string, number> }>> => [{ date: "a", counts: { decrypt_failed: 2 } }, { date: "b", counts: { decrypt_failed: 1, no_binding: 4 } }] });
    const report = await runGoogleBindingsReadiness({ jacobsYes: false, json: false, databaseUrl: "http://localhost:54321" }, d);
    expect(report.fallbacks).toMatchObject({ total: 7, byKind: { decrypt_failed: 3, no_binding: 4 }, zero: false });
    expect(report.flipReady).toBe(false);
  });

  it("prints no token-like value and names only what is absent", async () => {
    const d = deps({ env: { SECRETS_ENC_KEY: SECRET_VALUE, STRELVA_GOOGLE_BINDINGS: "1" } });
    const report = await runGoogleBindingsReadiness({ jacobsYes: false, json: false, databaseUrl: "http://localhost:54321" }, d);
    expect(report.flipReady).toBe(false);
    expect(d.lines.join("\n")).toContain("ABSENT");
    expect(d.lines.join("\n")).not.toContain(SECRET_VALUE);
    expect(JSON.stringify(report)).not.toContain(SECRET_VALUE);
  });

  it("refuses a non-local database without Jacob's yes, before any read", async () => {
    const d = deps({ fallbacks: vi.fn(), copyDryRun: vi.fn() });
    await expect(runGoogleBindingsReadiness({ jacobsYes: false, json: false, databaseUrl: "https://abc.supabase.co" }, d)).rejects.toThrow("i-have-jacobs-yes");
    expect(d.fallbacks).not.toHaveBeenCalled();
    expect(d.copyDryRun).not.toHaveBeenCalled();
    await expect(runGoogleBindingsReadiness({ jacobsYes: true, json: false, databaseUrl: "https://abc.supabase.co" }, deps())).resolves.toMatchObject({ database: "not local" });
  });

  it("reads only prerequisites when no database is configured", async () => {
    const d = deps({ fallbacks: vi.fn(), copyDryRun: vi.fn() });
    const report = await runGoogleBindingsReadiness({ jacobsYes: false, json: false }, d);
    expect(report).toMatchObject({ database: "not configured", fallbacks: null, copy: null, flipReady: false });
    expect(d.fallbacks).not.toHaveBeenCalled();
  });

  it("rejects unknown arguments", () => {
    expect(() => parseReadinessArgs(["--apply"])).toThrow("Unknown argument");
    expect(parseReadinessArgs(["--json", "--i-have-jacobs-yes"])).toEqual({ jacobsYes: true, json: true });
  });
});
