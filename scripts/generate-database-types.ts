/**
 * Regenerate src/platform/infra/db/database.types.ts from a LOCAL Postgres
 * that has every migration applied, in the shape `supabase gen types
 * typescript` writes (public schema: Tables with Row/Insert/Update/
 * Relationships, Views, Functions, Enums, CompositeTypes, and the same helper
 * types). Used because the Supabase CLI is not installed here.
 *
 * Never production: it refuses any host that is not a local socket
 * directory, localhost or 127.0.0.1, and only reads the catalog.
 *
 *   # 1. A throwaway cluster with every migration (the upgrade rehearsal keeps it):
 *   mkdir -p /private/tmp/claude-501/types && TMPDIR=/private/tmp/claude-501/types \
 *     PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-upgrade
 *   # 2. Start it on a private socket (the path printed as "cluster preserved at"):
 *   pg_ctl -D <cluster>/data -o "-k <socket-dir> -c listen_addresses='' -p 6543" -w start
 *   # 3. Generate, then stop the cluster and delete the temp dir:
 *   PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm db:types --host <socket-dir> --port 6543
 *   pg_ctl -D <cluster>/data -m fast stop && rm -rf /private/tmp/claude-501/types
 *
 * Flags: --host, --port, --dbname (default postgres), --out (default the
 * types file), --check (exit 1 if the file would change; writes nothing).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";

const DEFAULT_OUT = "src/platform/infra/db/database.types.ts";

// pg_proc has no argument-nullability metadata. This existing RPC explicitly
// accepts NULL to clear a signing key (20261012120000_track_signing_key_rotation).
const nullableRpcArguments: Readonly<Record<string, readonly string[]>> = {
  rotate_tenant_track_signing_key: ["p_public_key"],
  // Takeover intentionally supplies no creator agreement/reference.
  record_creator_maintenance_from_workspace: ["p_agreement", "p_rate"],
  // Public Checkout has no agency actor; pay-link admission requires all three.
  assert_business_checkout_admission: ["p_actor_id", "p_verified_email", "p_accepted_email"],
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

export interface PgType { oid: number; name: string; type: string; category: string; elem: number; base: number; relid: number; labels: string[] | null }
export interface PgColumn { name: string; type: number; notnull: boolean; hasdef: boolean; identity: string; generated: string }
export interface PgRelation { name: string; kind: string; columns: PgColumn[]; updatable: boolean; triggerFilled: string[] }
export interface PgForeignKey { name: string; table: string; columns: string[]; ref: string; refColumns: string[]; oneToOne: boolean }
export interface PgFunction { name: string; oid: number; retset: boolean; rettype: number; argnames: string[] | null; argmodes: string[] | null; alltypes: number[] | null; argtypes: number[]; ndefaults: number }
export interface Catalog { types: PgType[]; relations: PgRelation[]; fks: PgForeignKey[]; functions: PgFunction[] }

const CATALOG_SQL = String.raw`
select json_build_object(
  'types', (select coalesce(json_agg(json_build_object(
      'oid', t.oid::int, 'name', t.typname, 'type', t.typtype, 'category', t.typcategory,
      'elem', t.typelem::int, 'base', t.typbasetype::int, 'relid', t.typrelid::int,
      'labels', (select json_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid))), '[]')
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname in ('pg_catalog', 'public')),
  'relations', (select coalesce(json_agg(json_build_object(
      'name', c.relname, 'kind', c.relkind,
      'triggerFilled', (select coalesce(json_agg(distinct 'tenant_stable_id'::text), '[]') from pg_trigger tg join pg_proc tp on tp.oid = tg.tgfoid
        where tg.tgrelid = c.oid and not tg.tgisinternal and tp.proname = 'set_tenant_stable_id'),
      'updatable', c.relkind in ('r', 'p') or (pg_relation_is_updatable(c.oid, false) & 20) = 20,
      'columns', (select coalesce(json_agg(json_build_object(
          'name', a.attname, 'type', a.atttypid::int, 'notnull', a.attnotnull, 'hasdef', a.atthasdef,
          'identity', a.attidentity, 'generated', a.attgenerated) order by a.attname), '[]')
        from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)) order by c.relname), '[]')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')),
  'fks', (select coalesce(json_agg(json_build_object(
      'name', con.conname, 'table', src.relname, 'ref', tgt.relname,
      'columns', (select json_agg(a.attname order by k.ord) from unnest(con.conkey) with ordinality k(attnum, ord)
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum),
      'refColumns', (select json_agg(a.attname order by k.ord) from unnest(con.confkey) with ordinality k(attnum, ord)
        join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum),
      'oneToOne', exists (select 1 from pg_index i where i.indrelid = con.conrelid and i.indisunique
        and i.indkey::int2[] @> con.conkey and con.conkey @> i.indkey::int2[])) order by con.conname), '[]')
    from pg_constraint con
    join pg_class src on src.oid = con.conrelid join pg_namespace sn on sn.oid = src.relnamespace
    join pg_class tgt on tgt.oid = con.confrelid join pg_namespace tn on tn.oid = tgt.relnamespace
    where con.contype = 'f' and sn.nspname = 'public' and tn.nspname = 'public'),
  'functions', (select coalesce(json_agg(json_build_object(
      'name', p.proname, 'oid', p.oid::int, 'retset', p.proretset, 'rettype', p.prorettype::int,
      'argnames', p.proargnames, 'argmodes', p.proargmodes, 'alltypes', p.proallargtypes::int[],
      'argtypes', p.proargtypes::int[], 'ndefaults', p.pronargdefaults) order by p.proname, p.oid), '[]')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type rt on rt.oid = p.prorettype
    where n.nspname = 'public' and p.prokind = 'f' and rt.typname not in ('trigger', 'event_trigger')
      -- Extension members (pgcrypto, btree_gist, dblink) live in Supabase's extensions schema.
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'))
)`;

function readCatalog(): Catalog {
  const host = arg("--host") ?? process.env.PGHOST ?? "";
  const port = arg("--port") ?? process.env.PGPORT ?? "5432";
  const dbname = arg("--dbname") ?? "postgres";
  const local = host.startsWith("/") || host === "localhost" || host === "127.0.0.1";
  if (!local) throw new Error(`Refusing host "${host}": generate only from a local throwaway cluster (socket directory, localhost or 127.0.0.1).`);
  const out = execFileSync("psql", [
    `--host=${host}`, `--port=${port}`, `--username=${process.env.PGUSER ?? userInfo().username}`, `--dbname=${dbname}`,
    "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--tuples-only", "--no-align", "--command", CATALOG_SQL,
  ], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return JSON.parse(out) as Catalog;
}

const STRING_TYPES = new Set(["bytea", "bpchar", "varchar", "date", "text", "citext", "time", "timetz", "timestamp", "timestamptz", "uuid", "vector"]);
const NUMBER_TYPES = new Set(["int2", "int4", "int8", "float4", "float8", "numeric"]);

/** The types file for one catalog; the helper types are kept from the current file. */
export function render(catalog: Catalog): string {
  const types = new Map(catalog.types.map((t) => [t.oid, t]));
  const relationByTypeRelid = new Map<number, PgRelation>();
  for (const t of catalog.types) {
    if (t.relid) {
      const rel = catalog.relations.find((r) => r.name === t.name);
      if (rel) relationByTypeRelid.set(t.oid, rel);
    }
  }
  const enums = catalog.types.filter((t) => t.type === "e" && t.labels).sort((a, b) => a.name.localeCompare(b.name));
  const enumNames = new Set(enums.map((t) => t.oid));

  const ts = (oid: number): string => {
    const t = types.get(oid);
    if (!t) return "unknown";
    if (t.category === "A" && t.elem) {
      const inner = ts(t.elem);
      return /[ |]/.test(inner) ? `(${inner})[]` : `${inner}[]`;
    }
    if (t.type === "d" && t.base) return ts(t.base);
    if (enumNames.has(oid)) return `Database["public"]["Enums"]["${t.name}"]`;
    if (t.name === "bool") return "boolean";
    if (NUMBER_TYPES.has(t.name)) return "number";
    if (STRING_TYPES.has(t.name)) return "string";
    if (t.name === "json" || t.name === "jsonb") return "Json";
    if (t.name === "void") return "undefined";
    if (t.name === "record") return "Record<string, unknown>";
    return "unknown";
  };

  const lines: string[] = [];
  const push = (indent: number, text: string) => lines.push(`${" ".repeat(indent)}${text}`);
  const objectOf = (indent: number, entries: [string, string][]) => {
    if (!entries.length) return "Record<string, never>";
    const body = entries.map(([k, v]) => `${" ".repeat(indent + 2)}${k}: ${v}`).join("\n");
    return `{\n${body}\n${" ".repeat(indent)}}`;
  };
  const rowEntries = (rel: PgRelation): [string, string][] =>
    rel.columns.map((c) => [c.name, `${ts(c.type)}${c.notnull ? "" : " | null"}`]);

  const tables = catalog.relations.filter((r) => r.kind === "r" || r.kind === "p");
  const views = catalog.relations.filter((r) => r.kind === "v" || r.kind === "m");

  const writeRelation = (rel: PgRelation, withWrites: boolean) => {
    push(6, `${rel.name}: {`);
    push(8, "Row: {");
    for (const [k, v] of rowEntries(rel)) push(10, `${k}: ${v}`);
    push(8, "}");
    if (withWrites) {
      push(8, "Insert: {");
      for (const c of rel.columns) {
        if (c.generated === "s" || c.identity === "a") push(10, `${c.name}?: never`);
        // A column the identity-spine trigger (set_tenant_stable_id) fills is optional on insert.
        else push(10, `${c.name}${!c.notnull || c.hasdef || c.identity === "d" || rel.triggerFilled.includes(c.name) ? "?" : ""}: ${ts(c.type)}${c.notnull ? "" : " | null"}`);
      }
      push(8, "}");
      push(8, "Update: {");
      for (const c of rel.columns) {
        if (c.generated === "s" || c.identity === "a") push(10, `${c.name}?: never`);
        else push(10, `${c.name}?: ${ts(c.type)}${c.notnull ? "" : " | null"}`);
      }
      push(8, "}");
    }
    const fks = catalog.fks.filter((fk) => fk.table === rel.name);
    if (!fks.length) {
      push(8, "Relationships: []");
    } else {
      push(8, "Relationships: [");
      for (const fk of fks) {
        push(10, "{");
        push(12, `foreignKeyName: "${fk.name}"`);
        push(12, `columns: [${fk.columns.map((c) => `"${c}"`).join(", ")}]`);
        push(12, `isOneToOne: ${fk.oneToOne}`);
        push(12, `referencedRelation: "${fk.ref}"`);
        push(12, `referencedColumns: [${fk.refColumns.map((c) => `"${c}"`).join(", ")}]`);
        push(10, "},");
      }
      push(8, "]");
    }
    push(6, "}");
  };

  push(0, "export type Json =");
  push(2, "| string");
  push(2, "| number");
  push(2, "| boolean");
  push(2, "| null");
  push(2, "| { [key: string]: Json | undefined }");
  push(2, "| Json[]");
  push(0, "");
  push(0, "export type Database = {");
  push(2, "// Allows to automatically instantiate createClient with right options");
  push(2, "// instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)");
  push(2, "__InternalSupabase: {");
  push(4, 'PostgrestVersion: "14.5"');
  push(2, "}");
  push(2, "public: {");
  push(4, "Tables: {");
  for (const rel of tables) writeRelation(rel, true);
  push(4, "}");
  push(4, "Views: {");
  if (!views.length) push(6, "[_ in never]: never");
  for (const rel of views) writeRelation(rel, rel.updatable);
  push(4, "}");

  push(4, "Functions: {");
  const byName = new Map<string, PgFunction[]>();
  for (const fn of catalog.functions) byName.set(fn.name, [...(byName.get(fn.name) ?? []), fn]);
  const signature = (fn: PgFunction, indent: number): string => {
    const modes = fn.argmodes ?? fn.argtypes.map(() => "i");
    const allTypes = fn.alltypes ?? fn.argtypes;
    const names = fn.argnames ?? [];
    const inArgs = allTypes.map((type, i) => ({ type, name: names[i] ?? "", mode: modes[i] ?? "i" }))
      .filter((a) => a.mode === "i" || a.mode === "b" || a.mode === "v");
    const optionalFrom = inArgs.length - fn.ndefaults;
    const args = inArgs.map((a, i) => [`${a.name || '""'}${i >= optionalFrom ? "?" : ""}`, nullableRpcArguments[fn.name]?.includes(a.name) ? `${ts(a.type)} | null` : ts(a.type)] as [string, string])
      .sort(([a], [b]) => a.localeCompare(b));
    const tableOut = allTypes.map((type, i) => ({ type, name: names[i] ?? "", mode: modes[i] ?? "i" })).filter((a) => a.mode === "t");
    let returns: string;
    if (tableOut.length) {
      returns = `${objectOf(indent + 2, tableOut.map((a) => [a.name, ts(a.type)] as [string, string]).sort(([a], [b]) => a.localeCompare(b)))}[]`;
    } else {
      const rel = relationByTypeRelid.get(fn.rettype);
      const base = rel ? objectOf(indent + 2, rowEntries(rel)) : ts(fn.rettype);
      returns = fn.retset ? (/[ |]/.test(base) && !rel ? `(${base})[]` : `${base}[]`) : base;
    }
    const argsText = args.length ? objectOf(indent + 2, args) : "never";
    return `{\n${" ".repeat(indent + 2)}Args: ${argsText}\n${" ".repeat(indent + 2)}Returns: ${returns}\n${" ".repeat(indent)}}`;
  };
  if (!byName.size) push(6, "[_ in never]: never");
  for (const [name, overloads] of [...byName].sort(([a], [b]) => a.localeCompare(b))) {
    if (overloads.length === 1) {
      lines.push(`      ${name}: ${signature(overloads[0]!, 6)}`);
    } else {
      push(6, `${name}:`);
      for (const fn of overloads) lines.push(`        | ${signature(fn, 8)}`);
    }
  }
  push(4, "}");

  push(4, "Enums: {");
  if (!enums.length) push(6, "[_ in never]: never");
  for (const e of enums) push(6, `${e.name}: ${e.labels!.map((l) => `"${l}"`).join(" | ")}`);
  push(4, "}");
  push(4, "CompositeTypes: {");
  push(6, "[_ in never]: never");
  push(4, "}");
  push(2, "}");
  push(0, "}");

  const current = readFileSync(DEFAULT_OUT, "utf8");
  const helpersStart = current.indexOf("\ntype DatabaseWithoutInternals");
  const constantsStart = current.indexOf("\nexport const Constants");
  if (helpersStart < 0 || constantsStart < 0) throw new Error("The helper types block was not found in the current types file.");
  const helpers = current.slice(helpersStart, constantsStart);
  const constants = [
    "export const Constants = {",
    "  public: {",
    enums.length
      ? `    Enums: {\n${enums.map((e) => `      ${e.name}: [${e.labels!.map((l) => `"${l}"`).join(", ")}],`).join("\n")}\n    },`
      : "    Enums: {},",
    "  },",
    "} as const",
  ].join("\n");
  return `${lines.join("\n")}\n${helpers}\n${constants}\n`;
}

function main(): void {
  const out = arg("--out") ?? DEFAULT_OUT;
  const next = render(readCatalog());
  if (process.argv.includes("--check")) {
    const same = readFileSync(out, "utf8") === next;
    console.log(same ? `${out} is current.` : `${out} differs from the local schema. Run pnpm db:types.`);
    if (!same) process.exitCode = 1;
  } else {
    writeFileSync(out, next);
    console.log(`Wrote ${out}.`);
  }
}

if (process.argv[1]?.endsWith("generate-database-types.ts")) main();
