import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FACT_KEYS } from "@/platform/business-record/contracts";

const dir = path.join(process.cwd(), "supabase/migrations");
const forward = readFileSync(path.join(dir, "20261028100600_business_record_insurance_fact.sql"), "utf8");
const rollback = readFileSync(path.join(dir, "rollback-20261028100600_business_record_insurance_fact.sql"), "utf8");

describe("insurance_accepted fact migration", () => {
  it("renames the validator and wraps it, copying no other key's rule", () => {
    expect(forward).toContain("rename to business_record_fact_valid_before_insurance");
    expect(forward).toContain("return public.business_record_fact_valid_before_insurance(p_key, p_value)");
    expect(forward).not.toContain("case p_key");
  });

  it("re-points check constraints through pg_get_constraintdef, and never loops on the wrapper itself", () => {
    expect(forward).toContain("pg_get_constraintdef(c.oid)");
    // After the rename a constraint prints the renamed function; the wrapper's own name carries "(" right after "valid".
    expect(forward).toContain("like '%business_record_fact_valid_before_insurance(%'");
    expect("business_record_fact_valid_before_insurance(").not.toContain("business_record_fact_valid(");
    expect(rollback).toContain("like '%business_record_fact_valid(%'");
    expect(rollback).not.toContain("like '%business_record_fact_valid_before_insurance(%'");
  });

  it("lists all 17 keys in the fact_key check, matching the TypeScript schema", () => {
    const list = /fact_key in \(([^)]*)\)/.exec(forward)![1]!.split(",").map(item => item.trim().replaceAll("'", ""));
    expect(list).toHaveLength(17);
    expect([...list].sort()).toEqual([...FACT_KEYS].sort());
    const old = /fact_key in \(([^)]*)\)/.exec(rollback)![1]!.split(",").map(item => item.trim().replaceAll("'", ""));
    expect(old).toHaveLength(16);
    expect(old).not.toContain("insurance_accepted");
  });

  it("refuses to roll back while insurance_accepted rows exist", () => {
    expect(rollback).toContain("raise exception 'insurance_accepted facts exist'");
    expect(rollback.indexOf("insurance_accepted facts exist")).toBeLessThan(rollback.indexOf("drop function"));
  });
});
