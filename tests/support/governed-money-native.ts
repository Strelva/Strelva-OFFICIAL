import { execFileSync } from "node:child_process";
import { z } from "zod";
import { localEnvironment } from "./local-auth";
import { localSqlFailure } from "./sql-diagnostic";
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;
/** Privileged fictional fixture only; never provider setup or owner acceptance. */
function localSql(sql: string) {
  localEnvironment();
  const dbUrl = process.env.STRELVA_LOCAL_DB_URL || "";
  if (!dbUrl || !["localhost", "127.0.0.1"].includes(new URL(dbUrl).hostname) || process.env.STRELVA_LOCAL_AUTH_PROOF !== "1") throw Error("Owned loopback Auth proof database required.");
  try { return execFileSync("psql", [dbUrl, "--no-psqlrc", "-At", "--set=ON_ERROR_STOP=1"], { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim(); }
  catch (error) { throw localSqlFailure(error, dbUrl); }
}
export function seedFictionalGovernedCustomer(workspaceId: string, ownerId: string) {
  z.uuid().parse(workspaceId); z.uuid().parse(ownerId);
  return JSON.parse(localSql(`do $$begin if not exists(select 1 from public.workspaces w join public.workspace_memberships m on m.workspace_id=w.id where w.id=${literal(workspaceId)}::uuid and w.created_by=${literal(ownerId)}::uuid and m.user_id=${literal(ownerId)}::uuid and m.role='owner') then raise exception 'owned_governed_fixture_required';end if;update public.accounts set stripe_customer_id='cus_FictionalGovernedAuthOnly' where workspace_id=${literal(workspaceId)}::uuid and billing_home_kind='business';if not found then raise exception 'owned_governed_home_required';end if;end$$;select jsonb_build_object('configured',stripe_customer_id='cus_FictionalGovernedAuthOnly') from public.accounts where workspace_id=${literal(workspaceId)}::uuid and billing_home_kind='business';`));
}
export function readNativeGovernedTerms(workspaceId: string) {
  z.uuid().parse(workspaceId);
  return JSON.parse(localSql(`select jsonb_build_object('terms',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('period',to_jsonb(p))) from public.platform_collection_terms t left join public.platform_collection_periods p on p.line_id=t.line_id where t.business_workspace_id=${literal(workspaceId)}::uuid),'[]'::jsonb),'collections',(select count(*) from public.platform_collections where business_workspace_id=${literal(workspaceId)}::uuid));`));
}
export function withdrawFictionalGovernedOwner(workspaceId: string, ownerId: string) {
  z.uuid().parse(workspaceId); z.uuid().parse(ownerId);
  localSql(`delete from public.workspace_memberships where workspace_id=${literal(workspaceId)}::uuid and user_id=${literal(ownerId)}::uuid and role='owner' and exists(select 1 from public.workspaces w where w.id=${literal(workspaceId)}::uuid and w.created_by=${literal(ownerId)}::uuid);`);
}
