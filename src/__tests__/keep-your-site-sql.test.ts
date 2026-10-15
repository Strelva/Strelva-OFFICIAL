import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dir = path.join(process.cwd(), "supabase/migrations");
const read = (name: string) => readFileSync(path.join(dir, name), "utf8");

describe("20261027160100 keep your site: health", () => {
  const sql = read("20261027160100_keep_your_site_changes.sql");
  it("adds the five columns", () => {
    for (const column of ["last_checked_at timestamptz", "last_check_result text", "detected_platform text", "detected_evidence text[]", "detected_at timestamptz"]) expect(sql).toContain(column);
  });
  it("carries the check in connected_site_json and keeps it stable", () => {
    const body = sql.slice(sql.indexOf("create or replace function public.connected_site_json"));
    expect(body.slice(0, 400)).toContain("language sql stable");
    expect(body.slice(0, 1800)).toContain("'lastCheckResult', s.last_check_result");
  });
  it("grants record_connected_site_check to service_role only and does not declare it stable", () => {
    const start = sql.indexOf("create function public.record_connected_site_check");
    const fn = sql.slice(start, sql.indexOf("$$;", sql.indexOf("$$;", start) + 3));
    expect(fn).not.toMatch(/\bstable\b/);
    expect(fn).toContain("language plpgsql volatile security definer");
    expect(sql).toContain("grant execute on function public.record_connected_site_check(uuid, uuid, text, uuid, text, text, text[]) to service_role;");
    expect(sql).toContain("revoke all on function public.record_connected_site_check(uuid, uuid, text, uuid, text, text, text[]) from public, anon, authenticated;");
  });
  it("has a rollback that restores the saved definition", () => {
    const rollback = read("rollback-20261027160100_keep_your_site_changes.sql");
    expect(rollback).toContain("keep_your_site_rollback.functions");
    expect(rollback).toContain("drop column last_checked_at");
  });
});
