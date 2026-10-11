import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (file: string) => readFileSync(`${process.cwd()}/supabase/migrations/${file}`, "utf8");
const forward = read("20261022174500_private_source_exit_lock_order.sql");
const inverse = read("rollback-20261022174500_private_source_exit_lock_order.sql");
const predecessor = read("20261022174000_private_source_exit_admission.sql");
const capture = (match: RegExpMatchArray | null, index: number): string => {
 const value = match?.[index];
 if (value === undefined) throw new Error("Required migration contract fragment is missing");
 return value;
};
const definition = (sql: string, name: string) => capture(sql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?end \\$\\$;`)), 0);
const body = (sql: string) => capture(sql.match(/as \$\$([\s\S]*?)\$\$;/), 1);
const md5 = (value: string) => createHash("md5").update(value).digest("hex");
const managerName = "system_version_assert_source_manager";
const listingName = "register_neutral_creator_listing";
describe("isolated source lock-order successor, native execution UNRUN", () => {
 it("takes supported route advisory before any actor/workspace/membership row locks", () => {
  const b = body(definition(forward, managerName));
  expect(b).toContain("if route_kind in('agency','customer') then");
  expect(b.indexOf("pg_advisory_xact_lock")).toBeLessThan(b.indexOf("public.users"));
  expect(b.indexOf("public.users")).toBeLessThan(b.indexOf("where w.id=p_workspace_id for share"));
  expect(b.indexOf("where w.id=p_workspace_id for share")).toBeLessThan(b.indexOf("kind is distinct from route_kind"));
  expect(b.indexOf("kind is distinct from route_kind")).toBeLessThan(b.indexOf("public.workspace_memberships"));
  expect(b).toContain("m.role in ('owner','admin') for share");
 });
 it("retains exact customer branch and current verified identity", () => {
  const customer = (s: string) => capture(body(definition(s,managerName)).match(/if kind='customer'([\s\S]*?)elsif kind='agency'/), 1);
  expect(customer(forward)).toBe(customer(predecessor));
  expect(body(definition(forward,managerName))).toContain("lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share");
 });
 it("retains fresh agency exit and unsupported snapshot refusals after every lock", () => {
  const b=body(definition(forward,managerName));
  expect(b.indexOf("public.workspace_memberships")).toBeLessThan(b.indexOf("current_setting('transaction_isolation')"));
  expect(b).toContain("private_source_snapshot_unsupported");
  expect(b).toContain("state->>'status'='completed'");
  expect(b).toContain("workspace_exit_future_work_blocked");
  expect(b).not.toContain("public.workspace_exit_completed");
 });
 it("fixes outer listing prelock while retaining every original authority step", () => {
  const b=body(definition(forward,listingName));
  const original=body(definition(inverse,listingName));
  expect(b.indexOf("pg_advisory_xact_lock")).toBeLessThan(b.indexOf("public.users"));
  expect(b).toContain("kind=route_kind and kind in('agency','customer') for share");
  const tail=" perform public.connect_assert_manager";
  expect(b.slice(b.indexOf(tail))).toBe(original.slice(original.indexOf(tail)));
  expect(b.indexOf("jsonb_typeof(p_command)")).toBeLessThan(b.indexOf("select kind into route_kind"));
 });
 it("guards two exact predecessor/successor bodies and restores frozen1740/1730 bodies", () => {
  expect(definition(inverse,managerName)).toBe(definition(predecessor,managerName));
  expect(md5(body(definition(inverse,listingName)))).toBe("65070ed346aaff39df0c08a56c1afe2f");
  for(const name of [managerName,listingName]) {
   expect(forward).toContain(`md5(p.prosrc)<>'${md5(body(definition(inverse,name)))}'`);
   expect(inverse).toContain(`md5(p.prosrc)<>'${md5(body(definition(forward,name)))}'`);
  }
 });
 it.each([forward,inverse])("preserves OIDs/ACLs with complete guards and no data or ports", s => {
  expect((s.match(/create or replace function/g)??[])).toHaveLength(2);
  for(const property of ["proowner","lanname","prokind","prorettype","proretset","proisstrict","prosecdef","proleakproof","provolatile","proparallel","proconfig","provariadic","prosupport","protrftypes","probin","prosqlbody","procost","prorows","pronargdefaults","proargdefaults","proargmodes","proallargtypes","proargnames","pronargs","proacl"]) expect((s.match(new RegExp(`p\\.${property}`,"g"))??[]).length).toBeGreaterThanOrEqual(2);
  expect(s).toContain("(select count(*) from aclexplode(p.proacl))<>1");
  expect(s).toContain("(select count(*) from aclexplode(p.proacl))<>2");
  expect(s).not.toMatch(/create (?:table|schema|policy)|grant execute|delete from|update public\.|alter function/i);
  expect(s.trim().endsWith("commit;")).toBe(true);
 });
});
