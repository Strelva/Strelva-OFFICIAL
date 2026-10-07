import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compareCounts, rehearse, type TableCounts } from "../../scripts/rehearse-database-restore";
import { databaseUrl, isLocalUrl, pgEnv } from "../../scripts/release-safety/postgres";

const temps: string[] = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), "strelva-restore-test-")); temps.push(dir); return dir; };
afterEach(() => { vi.unstubAllEnvs(); for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("dump/restore safety", () => {
  it("recognizes loopback/socket targets and refuses libpq routing overrides", () => {
    for (const url of ["postgresql://localhost/test", "postgres://127.0.0.1:5432/test", "postgresql://[::1]/test", "postgresql:///test?host=/tmp/local-socket&port=5432"]) expect(isLocalUrl(url)).toBe(true);
    for (const url of ["postgresql://prod.example/test", "postgresql://localhost.evil/test", "postgresql://localhost/test?host=prod.example", "postgresql://localhost/test?hostaddr=1.2.3.4", "postgresql://localhost/test?service=production", "postgresql://localhost/test?dbname=other", "postgresql://localhost/test?options=-c", "postgresql:///test?host=/tmp/a,prod.example", "postgresql:///test", "not a url", "postgresql://localhost/test?port=5432&port=5433"]) expect(isLocalUrl(url)).toBe(false);
  });
  it("refuses a nonlocal source OR target before making an artifact or connection", async () => {
    const out = join(temp(), "backup");
    await expect(rehearse("postgresql://prod.example/db", "postgresql://localhost/db", out)).rejects.toThrow(/non-local/);
    await expect(rehearse("postgresql://localhost/db", "postgresql://prod.example/db", out)).rejects.toThrow(/non-local/);
    expect(existsSync(out)).toBe(false);
  });
  it("never reuses backup output or writes a dump inside the checkout", async () => {
    await expect(rehearse("postgresql://localhost/db", "postgresql://localhost/db", temp())).rejects.toThrow();
    await expect(rehearse("postgresql://localhost/db", "postgresql://localhost/db", join(process.cwd(), "dump"))).rejects.toThrow(/outside/);
    const linked = join(temp(), "checkout-link");
    symlinkSync(process.cwd(), linked, "dir");
    await expect(rehearse("postgresql://localhost/db", "postgresql://localhost/db", join(linked, "dump"))).rejects.toThrow(/outside/);
    expect(existsSync(join(process.cwd(), "dump"))).toBe(false);
  });
  it("requires every table and exact row count, including counts beyond JS integer precision", () => {
    const before = { a: "9007199254740993", b: "0" };
    compareCounts(before, { ...before });
    const mismatches: TableCounts[] = [{ a: "9007199254740992", b: "0" }, { a: before.a }, { ...before, extra: "1" }];
    for (const after of mismatches) expect(() => compareCounts(before, after)).toThrow(/mismatch/);
  });
  it("removes ambient libpq routing and changes only the database name for the fresh target", () => {
    vi.stubEnv("PGHOST", "production"); vi.stubEnv("PGSERVICE", "production"); vi.stubEnv("PGPASSFILE", "production");
    expect(pgEnv()).not.toHaveProperty("PGHOST");
    expect(pgEnv()).not.toHaveProperty("PGSERVICE");
    expect(pgEnv()).not.toHaveProperty("PGPASSFILE");
    const target = new URL(databaseUrl("postgresql:///source?host=/tmp/fixture&port=5432", "fresh_restore"));
    expect(target.pathname).toBe("/fresh_restore");
    expect(target.searchParams.get("host")).toBe("/tmp/fixture");
    expect(target.searchParams.get("port")).toBe("5432");
  });
});
