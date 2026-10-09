import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (file: string) => readFileSync(`${process.cwd()}/supabase/migrations/${file}`, "utf8");
const historical = read("20261020090024_package_management.sql");
const forward = read("20261022174000_private_source_exit_admission.sql");
const inverse = read("rollback-20261022174000_private_source_exit_admission.sql");
const capture = (match: RegExpMatchArray | null, index: number): string => {
 const value = match?.[index];
 if (value === undefined) throw new Error("Required migration contract fragment is missing");
 return value;
};
const manager = (sql: string) => capture(sql.match(/create or replace function public\.system_version_assert_source_manager\([\s\S]*?end \$\$;/), 0);
const body = (sql: string) => capture(manager(sql).match(/as \$\$([\s\S]*?)\$\$;/), 1);
const md5 = (value: string) => createHash("md5").update(value).digest("hex");
describe("prepared agency source exit successor contract (not native proof)", () => {
 it("retains canonical customer authority and source-manager lock order", () => {
  const customer = (sql: string) => capture(body(sql).match(/if kind='customer'([\s\S]*?)elsif kind='agency'/), 1);
  expect(customer(forward)).toBe(customer(historical));
  const next = body(forward);
  expect(next.indexOf("public.users")).toBeLessThan(next.indexOf("public.workspaces"));
  expect(next.indexOf("public.workspaces")).toBeLessThan(next.indexOf("public.workspace_memberships"));
  expect(next.indexOf("pg_advisory_xact_lock")).toBeLessThan(next.indexOf("public.workspace_exit_requests"));
  expect(next).toContain("where w.id=p_workspace_id for share");
  expect(next).toContain("state->>'status'='completed'");
  expect(next).toContain("raise exception 'workspace_exit_future_work_blocked'");
 });
 it("makes the post-wait query volatile and refuses unsupported agency snapshot isolation", () => {
  expect(manager(forward)).toContain("language plpgsql volatile security definer");
  expect(body(forward)).toContain("current_setting('transaction_isolation') not in ('read committed','read uncommitted')");
  expect(body(forward)).toContain("private_source_snapshot_unsupported");
  expect(body(forward)).not.toContain("public.workspace_exit_completed");
 });
 it("pins both predecessor and successor bodies and restores the exact canonical body", () => {
  expect(forward).toContain(`md5(p.prosrc)<>'${md5(body(historical))}'`);
  expect(inverse).toContain(`md5(p.prosrc)<>'${md5(body(forward))}'`);
  expect(manager(inverse)).toBe(manager(historical));
  expect(md5(body(historical))).toBe("c38d391dfc5030244639e5a60d3aeafa");
 });
 it.each([forward, inverse])("guards the complete relevant catalog and owner-only ACL atomically", sql => {
  for (const property of ["proowner","lanname","prokind","prorettype","proretset","proisstrict","prosecdef","proleakproof","provolatile","proparallel","proconfig","provariadic","prosupport","protrftypes","probin","prosqlbody","procost","prorows","pronargdefaults","proargdefaults","proargmodes","proallargtypes","proargnames","pronargs","proacl"]) expect(sql).toContain(`p.${property}`);
  expect(sql).toContain("(select count(*) from aclexplode(p.proacl))<>1");
  expect(sql).toContain("a.grantor<>migrator or a.grantee<>migrator");
  expect(sql).toContain("a.is_grantable");
  expect(sql.trim().startsWith("--")).toBe(true);
  expect(sql.indexOf("begin;")).toBeLessThan(sql.indexOf("do $catalog$"));
  expect(sql.indexOf("private_source_exit_catalog_drift")).toBeLessThan(sql.indexOf("create or replace function"));
  expect(sql.trim().endsWith("commit;")).toBe(true);
  expect(sql).not.toMatch(/create (?:table|schema|policy)|grant execute|delete from|update public\./i);
 });
});
