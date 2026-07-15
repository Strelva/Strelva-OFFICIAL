import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Guards scripts/deprovision-tenant.ts against schema drift: every public table
 * that carries a tenant_id MUST be in the script's TENANT_SCOPED_TABLES sweep,
 * or a deprovisioned client's rows in a new table would be silently orphaned.
 * (We read both files as text rather than import the script — importing it runs
 * its main()/process.exit.)
 */
describe("deprovision-tenant table coverage", () => {
  const root = process.cwd();
  const types = readFileSync(join(root, "src/lib/db/database.types.ts"), "utf8");
  const script = readFileSync(join(root, "scripts/deprovision-tenant.ts"), "utf8");

  // Tenant-scoped tables = every `Tables` entry whose Row block contains tenant_id.
  // Scan the whole file, not a Tables:..Views: slice: the multi-schema generated
  // format (graphql_public) puts an empty Tables:/Views: pair first, which a naive
  // indexOf slice would grab. Non-public schemas here have no tenant_id rows, so a
  // whole-file scan is both correct and robust to that.
  const tablesBlock = types;
  const tenantTables: string[] = [];
  const re = /\n {6}([a-z_]+): \{\n {8}Row: \{([\s\S]*?)\n {8}\}/g;
  for (let m = re.exec(tablesBlock); m; m = re.exec(tablesBlock)) {
    if (/\btenant_id\b/.test(m[2])) tenantTables.push(m[1]);
  }

  it("found a sane set of tenant-scoped tables to check against", () => {
    expect(tenantTables.length).toBeGreaterThan(20);
  });

  it("sweeps every tenant_id table (plus the tenants row itself)", () => {
    const missing = tenantTables.filter((t) => !new RegExp(`"${t}"`).test(script));
    expect(missing, `deprovision-tenant.ts is missing tenant_id tables: ${missing.join(", ")}`).toEqual([]);
  });
});
