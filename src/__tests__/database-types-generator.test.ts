import { describe, expect, it } from "vitest";
import { render, type Catalog } from "../../scripts/generate-database-types";

// scripts/generate-database-types.ts renders the catalog of a local cluster
// with every migration into the shape `supabase gen types` writes. The
// committed file was produced by it (Strelva Reborn section 7); 66 of the 70
// tables the previous file had came out byte-identical.

const T = { text: 25, int4: 23, uuid: 2950, bool: 16, jsonb: 3802, timestamptz: 1184, textArray: 1009, void: 2278, rowtype: 90001, enum: 90002 };
const catalog: Catalog = {
  types: [
    { oid: T.text, name: "text", type: "b", category: "S", elem: 0, base: 0, relid: 0, labels: null },
    { oid: T.int4, name: "int4", type: "b", category: "N", elem: 0, base: 0, relid: 0, labels: null },
    { oid: T.uuid, name: "uuid", type: "b", category: "U", elem: 0, base: 0, relid: 0, labels: null },
    { oid: T.bool, name: "bool", type: "b", category: "B", elem: 0, base: 0, relid: 0, labels: null },
    { oid: T.jsonb, name: "jsonb", type: "b", category: "U", elem: 0, base: 0, relid: 0, labels: null },
    { oid: T.timestamptz, name: "timestamptz", type: "b", category: "D", elem: 0, base: 0, relid: 0, labels: null },
    { oid: T.textArray, name: "_text", type: "b", category: "A", elem: T.text, base: 0, relid: 0, labels: null },
    { oid: T.void, name: "void", type: "p", category: "P", elem: 0, base: 0, relid: 0, labels: null },
    { oid: T.rowtype, name: "widgets", type: "c", category: "C", elem: 0, base: 0, relid: 5, labels: null },
    { oid: T.enum, name: "widget_kind", type: "e", category: "E", elem: 0, base: 0, relid: 0, labels: ["small", "large"] },
  ],
  relations: [{
    name: "widgets", kind: "r", updatable: true, triggerFilled: ["tenant_stable_id"],
    columns: [
      { name: "id", type: T.uuid, notnull: true, hasdef: true, identity: "", generated: "" },
      { name: "key", type: T.text, notnull: true, hasdef: false, identity: "", generated: "s" },
      { name: "kind", type: T.enum, notnull: true, hasdef: false, identity: "", generated: "" },
      { name: "note", type: T.text, notnull: false, hasdef: false, identity: "", generated: "" },
      { name: "tags", type: T.textArray, notnull: true, hasdef: false, identity: "", generated: "" },
      { name: "tenant_stable_id", type: T.uuid, notnull: true, hasdef: false, identity: "", generated: "" },
      { name: "workspace_id", type: T.uuid, notnull: true, hasdef: false, identity: "", generated: "" },
    ],
  }],
  fks: [{ name: "widgets_workspace_id_fkey", table: "widgets", columns: ["workspace_id"], ref: "workspaces", refColumns: ["id"], oneToOne: false }],
  functions: [
    { name: "read_widgets", oid: 1, retset: true, rettype: T.rowtype, argnames: ["p_workspace_id", "p_limit"], argmodes: null, alltypes: null, argtypes: [T.uuid, T.int4], ndefaults: 1 },
    { name: "widget_kinds", oid: 2, retset: true, rettype: T.text, argnames: null, argmodes: null, alltypes: null, argtypes: [], ndefaults: 0 },
    { name: "touch", oid: 3, retset: false, rettype: T.void, argnames: ["p_id"], argmodes: null, alltypes: null, argtypes: [T.uuid], ndefaults: 0 },
    { name: "touch", oid: 4, retset: false, rettype: T.bool, argnames: ["p_id", "p_flag"], argmodes: null, alltypes: null, argtypes: [T.uuid, T.bool], ndefaults: 0 },
    { name: "stats", oid: 5, retset: true, rettype: 2249, argnames: ["p_id", "total", "at"], argmodes: ["i", "t", "t"], alltypes: [T.uuid, T.int4, T.timestamptz], argtypes: [T.uuid], ndefaults: 0 },
  ],
};

describe("generate-database-types render", () => {
  const out = render(catalog);

  it("writes Row, Insert and Update the way supabase gen types does", () => {
    expect(out).toContain(`      widgets: {
        Row: {
          id: string
          key: string
          kind: Database["public"]["Enums"]["widget_kind"]
          note: string | null
          tags: string[]
          tenant_stable_id: string
          workspace_id: string
        }
        Insert: {
          id?: string
          key?: never
          kind: Database["public"]["Enums"]["widget_kind"]
          note?: string | null
          tags: string[]
          tenant_stable_id?: string
          workspace_id: string
        }`);
    expect(out).toContain(`            foreignKeyName: "widgets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]`);
  });

  it("types functions: defaults optional, setof rows, setof scalars, RETURNS TABLE, void, overloads", () => {
    expect(out).toMatch(/read_widgets: \{\n\s+Args: \{\n\s+p_limit\?: number\n\s+p_workspace_id: string\n\s+\}\n\s+Returns: \{[\s\S]*?tenant_stable_id: string[\s\S]*?\}\[\]/);
    expect(out).toMatch(/widget_kinds: \{\n\s+Args: never\n\s+Returns: string\[\]/);
    expect(out).toMatch(/stats: \{\n\s+Args: \{\n\s+p_id: string\n\s+\}\n\s+Returns: \{\n\s+at: string\n\s+total: number\n\s+\}\[\]/);
    expect(out).toMatch(/touch:\n\s+\| \{\n\s+Args: \{\n\s+p_id: string\n\s+\}\n\s+Returns: undefined\n\s+\}\n\s+\| \{/);
    expect(out).toContain(`widget_kind: "small" | "large"`);
    expect(out).toContain(`widget_kind: ["small", "large"],`);
  });

  it("preserves the explicit signing-key clear contract without widening other RPC arguments", () => {
    const generated = render({ ...catalog, functions: [...catalog.functions, {
      name: "rotate_tenant_track_signing_key", oid: 6, retset: false, rettype: T.void,
      argnames: ["p_tenant_id", "p_public_key"], argmodes: null, alltypes: null,
      argtypes: [T.text, T.text], ndefaults: 0,
    }] });
    expect(generated).toMatch(/rotate_tenant_track_signing_key: \{[\s\S]*?p_public_key: string \| null[\s\S]*?p_tenant_id: string/);
    expect(generated).toMatch(/touch:[\s\S]*?p_id: string\n/);
  });

  it("keeps the helper types the app imports", () => {
    for (const name of ["export type Tables<", "export type TablesInsert<", "export type TablesUpdate<", "export type Enums<", "export const Constants"]) {
      expect(out).toContain(name);
    }
  });

  it("models the exact creator takeover null agreement/reference without widening actor or source", () => {
    const generated = render({ ...catalog, functions: [{
      name: "record_creator_maintenance_from_workspace", oid: 7, retset: false, rettype: T.jsonb,
      argnames: ["p_workspace_id", "p_listing_id", "p_source_revision_id", "p_user_id", "p_verified_email", "p_state", "p_agreement", "p_rate", "p_effective"],
      argmodes: null, alltypes: null, argtypes: [T.uuid, T.uuid, T.uuid, T.uuid, T.text, T.text, T.text, T.text, T.timestamptz], ndefaults: 0,
    }] });
    expect(generated).toContain("p_agreement: string | null");
    expect(generated).toContain("p_rate: string | null");
    for (const name of ["p_workspace_id", "p_listing_id", "p_source_revision_id", "p_user_id", "p_verified_email", "p_state", "p_effective"]) {
      expect(generated).toContain(`${name}: string\n`);
      expect(generated).not.toContain(`${name}: string | null`);
    }
    expect(generated).toContain("Returns: Json");
  });
  it("requires exact Checkout merchant/payment inputs while allowing explicit absent public agency context", () => {
    const generated=render({...catalog,functions:[{name:"assert_business_checkout_admission",oid:8,retset:false,rettype:T.bool,argnames:["p_payment_id","p_account","p_generation","p_actor_id","p_verified_email","p_accepted_email"],argmodes:null,alltypes:null,argtypes:[T.uuid,T.text,T.int4,T.uuid,T.text,T.text],ndefaults:0}]});
    for(const name of ["p_actor_id","p_verified_email","p_accepted_email"])expect(generated).toContain(`${name}: string | null`);
    expect(generated).toContain("p_payment_id: string\n");expect(generated).toContain("p_account: string\n");expect(generated).toContain("p_generation: number\n");expect(generated).not.toContain("p_actor_id?:");expect(generated).toContain("Returns: boolean");
  });
  it("keeps governed money actor/source/profile/amount arguments required and command nullability inside typed JSON", () => {
    const functions = [
      ...["record_governed_money_configuration", "prepare_governed_collection_terms", "register_governed_creator_listing"].map((name, i) => ({ name, oid: 10 + i, retset: false, rettype: T.jsonb, argnames: ["p_user_id", "p_verified_email", "p_command"], argmodes: null, alltypes: null, argtypes: [T.uuid, T.text, T.jsonb], ndefaults: 0 })),
      ...["read_governed_money_configuration", "read_governed_money_preparation"].map((name, i) => ({ name, oid: 13 + i, retset: false, rettype: T.jsonb, argnames: ["p_workspace_id", "p_user_id", "p_verified_email"], argmodes: null, alltypes: null, argtypes: [T.uuid, T.uuid, T.text], ndefaults: 0 })),
      { name: "assert_governed_payout_dispatch", oid: 15, retset: false, rettype: T.jsonb, argnames: ["p_payout_id", "p_user_id", "p_verified_email", "p_profile_version", "p_recipient", "p_charge", "p_amount", "p_currency", "p_available"], argmodes: null, alltypes: null, argtypes: [T.uuid, T.uuid, T.text, T.text, T.text, T.text, T.int4, T.text, T.int4], ndefaults: 0 },
    ];
    const generated = render({ ...catalog, functions });
    for (const f of functions) {
      expect(generated).toContain(`${f.name}: {`);
      for (const name of f.argnames) expect(generated).not.toContain(`${name}?:`);
    }
    expect(generated).toContain("p_command: Json\n");
    for (const name of ["p_workspace_id", "p_user_id", "p_verified_email", "p_profile_version", "p_recipient", "p_charge", "p_currency"]) { expect(generated).toContain(`${name}: string\n`); expect(generated).not.toContain(`${name}: string | null`); }
    expect(generated).toContain("p_amount: number\n"); expect(generated).toContain("p_available: number\n");
  });
});
