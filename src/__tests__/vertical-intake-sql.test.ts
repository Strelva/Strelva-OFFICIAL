import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dir = path.join(process.cwd(), "supabase/migrations");
const read = (name: string) => readFileSync(path.join(dir, name), "utf8");
const forward = read("20261028100700_vertical_intake.sql");
const rollback = read("rollback-20261028100700_vertical_intake.sql");
const TABLES = ["app_intake_installs", "app_intake_releases", "app_intake_submissions", "app_intake_sensitive", "app_intake_sensitive_reads"];
const RPCS = [
  "read_app_intake", "save_app_intake_draft", "request_app_intake_live", "pause_app_intake", "read_app_intake_sensitive",
  "make_app_intake_live", "withdraw_app_intake_live_request", "list_app_intake_live_requests", "record_app_intake_live_check",
  "resolve_public_app_intake", "record_app_intake_submission", "list_open_app_intake_visits", "read_app_intake_visit",
  "decide_app_intake_visit", "purge_app_intake_sensitive",
];

function body(name: string): string {
  const start = forward.indexOf(`create function public.${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const end = forward.indexOf("end $$;", start);
  return forward.slice(start, end);
}

describe("vertical intake migration", () => {
  it("revokes every function from all four roles and grants service_role only", () => {
    const created = [...forward.matchAll(/create function public\.(\w+)\(/g)].map(match => match[1]!);
    expect(created.length).toBeGreaterThanOrEqual(RPCS.length);
    const revoked = forward.slice(forward.indexOf("revoke all on function public.app_intake_visit_json"));
    for (const name of created) {
      if (name === "app_intake_release_immutable" || name === "app_intake_json") continue;
      expect(forward, name).toMatch(new RegExp(`public\\.${name}\\(`));
    }
    for (const name of RPCS) expect(revoked, name).toContain(`public.${name}(`);
    expect(forward).toContain("from public, anon, authenticated, service_role;");
    const grant = forward.slice(forward.indexOf("grant execute on function"));
    for (const name of RPCS) expect(grant, name).toContain(`public.${name}(`);
    expect(grant).toContain("to service_role;");
    expect(forward).not.toMatch(/grant [^;]*\b(anon|authenticated)\b/i);
    expect(grant).not.toContain("app_intake_assert_writer");
  });

  it("enables RLS on all five tables and revokes every table privilege", () => {
    for (const table of TABLES) expect(forward, table).toContain(`alter table public.${table} enable row level security;`);
    const revoke = forward.slice(forward.indexOf("revoke all on public.app_intake_installs"), forward.indexOf("-- ---- helpers"));
    for (const table of TABLES) expect(revoke, table).toContain(`public.${table}`);
    expect(revoke).toContain("service_role");
  });

  it("binds the public write to a verified connected site and its Origin", () => {
    expect(body("record_app_intake_submission")).toContain("public.connected_site_for_write(p_public_key, p_origin)");
    expect(body("record_app_intake_submission")).toContain("connected_site_id = v_site.id");
    expect(body("resolve_public_app_intake")).toContain("verified_at is not null");
  });

  it("lets only actual owner or admin members read sensitive values, and audits it", () => {
    const read = body("read_app_intake_sensitive");
    expect(read).toContain("app_intake_assert_customer_role(p_workspace_id, p_user_id, p_verified_email, array['owner','admin'])");
    expect(read).toContain("insert into public.app_intake_sensitive_reads");
    expect(read.indexOf("app_intake_assert_customer_role")).toBeLessThan(read.indexOf("insert into public.app_intake_sensitive_reads"));
  });

  it("requires the owner role to make an install live, and keeps Releases append-only", () => {
    expect(body("make_app_intake_live")).toContain("array['owner']");
    expect(forward).toContain("app_intake_release_immutable");
    expect(forward).toMatch(/create trigger app_intake_releases_immutable_trg before update on public\.app_intake_releases/);
  });

  it("stores ciphertext only and purges after 30 days", () => {
    expect(forward).toContain("ciphertext like 'enc:v1:%'");
    expect(forward).toContain("interval '30 days'");
    expect(body("purge_app_intake_sensitive")).toContain("least(greatest(coalesce(p_limit, 1), 1), 5000)");
  });

  it("returns the confirmed facts from the same call that lists work", () => {
    for (const name of ["list_app_intake_live_requests", "list_open_app_intake_visits", "read_app_intake_visit"]) {
      expect(body(name), name).toContain("business_confirmed_public_facts(p_workspace_id)->'facts'");
    }
  });

  it("makes every actor-checked read and write volatile", () => {
    for (const name of ["read_app_intake", "read_app_intake_sensitive", "save_app_intake_draft", "make_app_intake_live"]) {
      expect(body(name), name).not.toMatch(/\bstable\b|\bimmutable\b/);
    }
  });

  it("rolls back only while no Release exists", () => {
    expect(rollback).toContain("app_intake_rollback_has_releases");
    expect(rollback.indexOf("app_intake_rollback_has_releases")).toBeLessThan(rollback.indexOf("drop function"));
    for (const table of TABLES) expect(rollback, table).toContain(`drop table public.${table};`);
  });
});

describe("vertical intake flag migration", () => {
  it("appends vertical_intake with the distinct-append idiom, and the rollback removes it", () => {
    const flag = read("20261028100500_vertical_intake_flag.sql");
    expect(flag).toContain("unnest(previous||array['vertical_intake'])");
    expect(flag).toContain("revoke all on function public.workspace_release_flag_names()");
    expect(read("rollback-20261028100500_vertical_intake_flag.sql")).toContain("key<>'vertical_intake'");
  });
});
