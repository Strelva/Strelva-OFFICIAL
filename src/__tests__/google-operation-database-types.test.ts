import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import { render, type Catalog } from "../../scripts/generate-database-types";
import type { Database } from "@/platform/infra/db/database.types";

// Fictional source catalog only. This neither reads PostgreSQL nor claims the
// source-authored additions have been generated from an applied database.
const sql = readFileSync("supabase/migrations/20261022175100_legacy_google_operation_authority.sql", "utf8");
const committed = readFileSync("src/platform/infra/db/database.types.ts", "utf8");
const oids: Record<string, number> = { uuid: 2950, text: 25, jsonb: 3802, timestamptz: 1184 };
const signatures = [...sql.matchAll(/create function public\.([a-z_]+)\(([\s\S]*?)\)\s+returns (text|jsonb)\b/g)];
const catalog: Catalog = {
  types: Object.entries(oids).map(([name, oid]) => ({ oid, name, type: "b", category: "U", elem: 0, base: 0, relid: 0, labels: null })),
  relations: [{
    name: "legacy_google_operation_watermarks", kind: "r", updatable: true, triggerFilled: [],
    columns: ["latest_started_at", "tenant_stable_id"].map(name => ({ name, type: oids[name === "tenant_stable_id" ? "uuid" : "timestamptz"]!, notnull: true, hasdef: false, identity: "", generated: "" })),
  }],
  fks: [{ name: "legacy_google_operation_watermarks_tenant_stable_id_fkey", table: "legacy_google_operation_watermarks", columns: ["tenant_stable_id"], ref: "tenants", refColumns: ["stable_id"], oneToOne: true }],
  functions: signatures.map((signature, i) => {
    const args = signature[2]!.split(",").map(value => value.trim().split(/\s+/));
    return { name: signature[1]!, oid: 100 + i, retset: false, rettype: oids[signature[3]!]!, argnames: args.map(arg => arg[0]!), argmodes: null, alltypes: null, argtypes: args.map(arg => oids[arg[1]!]!), ndefaults: 0 };
  }),
};
function block(source: string, name: string): string {
  const result = source.match(new RegExp(`^      ${name}: \\{[\\s\\S]*?^      \\}\\n`, "m"));
  expect(result, name).not.toBeNull();
  return result![0];
}

describe("source-authored legacy Google database types", () => {
  it("matches all six actual SQL signatures and the existing catalog renderer", () => {
    expect(signatures).toHaveLength(6);
    const generated = render(catalog);
    for (const fn of catalog.functions) {
      expect(fn.argtypes.every(oid => oid !== undefined)).toBe(true);
      expect(block(committed, fn.name)).toBe(block(generated, fn.name));
      expect(block(committed, fn.name)).not.toMatch(/p_\w+\?:/);
    }
  });

  it("retains the precise private NULL dispatch without widening actor-facing admission", () => {
    type Functions = Database["public"]["Functions"];
    expectTypeOf<Functions["legacy_google_commit"]["Args"]>().toEqualTypeOf<{ p_input: Database["public"]["Functions"]["commit_legacy_google_binding_operation"]["Args"]["p_input"]; p_kind: string | null; p_pin: Functions["commit_legacy_google_binding_operation"]["Args"]["p_pin"]; p_user_id: string | null; p_verified_email: string | null }>();
    expectTypeOf<Functions["legacy_google_location_digest"]["Args"]["p_binding_id"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Functions["apply_legacy_google_operation"]["Args"]["p_user_id"]>().toEqualTypeOf<string>();
    expectTypeOf<Functions["apply_legacy_google_operation"]["Args"]["p_verified_email"]>().toEqualTypeOf<string>();
    expectTypeOf<Functions["apply_legacy_google_operation"]["Args"]["p_kind"]>().toEqualTypeOf<string>();
  });

  it("models required watermark columns and the unique tenant foreign key without adding database authority", () => {
    expect(sql).toMatch(/tenant_stable_id uuid primary key references public\.tenants\(stable_id\) on delete cascade/);
    expect(sql).toMatch(/latest_started_at timestamptz not null check \(isfinite\(latest_started_at\)\)/);
    expect(sql).toContain("revoke all on public.legacy_google_operation_watermarks from public,anon,authenticated,service_role");
    expect(block(committed, "legacy_google_operation_watermarks")).toBe(block(render(catalog), "legacy_google_operation_watermarks"));
    type Table = Database["public"]["Tables"]["legacy_google_operation_watermarks"];
    expectTypeOf<Table["Row"]>().toEqualTypeOf<{ latest_started_at: string; tenant_stable_id: string }>();
    expectTypeOf<Table["Insert"]>().toEqualTypeOf<Table["Row"]>();
    expectTypeOf<Table["Update"]>().toEqualTypeOf<Partial<Table["Row"]>>();
  });
});
