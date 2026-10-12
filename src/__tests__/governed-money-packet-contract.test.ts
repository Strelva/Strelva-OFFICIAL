import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const forward = readFileSync("supabase/migrations/20261022172000_governed_money_operations.sql", "utf8");
const inverse = readFileSync("supabase/migrations/rollback-20261022172000_governed_money_operations.sql", "utf8");
describe("governed money source packet", () => {
  it("uses a non-keyword payout authorization row identifier throughout immutable replay validation", () => {
    expect(forward).not.toMatch(/\bauthorization\s+public\.|\binto authorization\b|\bauthorization\./);
    const configuration = forward.slice(forward.indexOf("create function public.record_governed_money_configuration"), forward.indexOf("create function public.read_governed_money_configuration"));
    expect(configuration).not.toMatch(/\bauthorization\s+public\.|\binto authorization\b|\bauthorization\./);
    expect(configuration).toContain("payout_authorization public.split_payout_authorizations");
    expect(configuration).toContain("payout_authorization.approved_by is distinct from p_user_id");
    expect(configuration).toContain("payout_authorization.profile_version is distinct from p_command->>'profileVersion'");
  });
  it("binds inverse to all six actual current bodies, owners, ACLs and properties", () => {
    const bodies = [...forward.matchAll(/create function public\.(\w+)\((.*?)\)\nreturns jsonb language plpgsql( stable)? security definer set search_path=public,pg_temp as \$\$([\s\S]*?)\$\$;/g)];
    expect(bodies).toHaveLength(6);
    for (const match of bodies) { const hash = createHash("md5").update(match[4]!).digest("hex"); expect(forward).toContain(hash); expect(inverse).toContain(hash); expect(inverse).toContain(`drop function public.${match[1]}(`); }
    for (const needle of ["p.proowner<>migrator", "count(*) from aclexplode(p.proacl))<>2", "a.is_grantable", "p.pronargdefaults<>0", "p.proargnames is distinct from expected.arg_names", "p.provolatile::text<>expected.volatility"]) expect(inverse).toContain(needle);
    expect(inverse).not.toMatch(/drop table|delete from|update public\.|execute .*definition|create or replace/i);
  });
  it("does not widen existing actor-supplied ACLs or alter any historical producer", () => {
    expect(forward).not.toMatch(/create or replace|alter function|rename to|grant .*authenticated|grant .*anon|insert into public\.super_admins|default.*rate_bps|default.*amount_cents/i);
    expect(forward).toContain("grant execute on function %s to service_role");
    expect(forward).toContain("lower(btrim(s.email))=lower(btrim(p_verified_email)) and s.revoked_at is null for share of u,s");
  });
  it("derives listing identity and collection payer from current native rows, checking current clocks after waits", () => {
    expect(forward).toContain("select s.definition_id into definition from public.offering_package_sources"); expect(forward).toContain("r.creator_workspace_id=workspace for share of r,s"); expect(forward).toContain("public.lock_system_revision_qualification(revision)");
    expect(forward).toContain("a.stripe_customer_id,price.version"); expect(forward).not.toContain("p_command->>'customerId'");
    const owner = forward.slice(forward.indexOf("create function public.prepare_governed_collection_terms"), forward.indexOf("create function public.register_governed_creator_listing"));
    expect(owner.indexOf("price.effective_until<=clock_timestamp()")).toBeGreaterThan(owner.indexOf("perform pg_advisory_xact_lock"));
    expect(owner.indexOf("public.accept_platform_collection_terms")).toBeLessThan(owner.indexOf("public.freeze_platform_collection_period"));
    expect(owner).toContain("m.role='owner' for share of m,w");
  });
  it("locks the exact creator workspace before membership/source waits and rechecks exit before inserting", () => {
    const listing = forward.slice(forward.indexOf("create function public.register_governed_creator_listing"), forward.indexOf("create function public.assert_governed_payout_dispatch"));
    const workspaceLock = listing.indexOf("from public.workspaces where id=workspace for share");
    expect(workspaceLock).toBeGreaterThan(0);
    expect(workspaceLock).toBeLessThan(listing.indexOf("public.connect_assert_manager"));
    const exitCheck = listing.indexOf("public.workspace_exit_completed(workspace)");
    expect(exitCheck).toBeGreaterThan(listing.indexOf("public.lock_system_revision_qualification"));
    expect(exitCheck).toBeGreaterThan(workspaceLock);
    expect(exitCheck).toBeLessThan(listing.indexOf("listing:=public.register_creator_listing"));
    const exit = readFileSync("supabase/migrations/20260920100000_workspace_exit.sql", "utf8");
    expect(exit).toContain("from public.workspaces where id = p_workspace_id for update");
  });
  it("returns recorded payout authorization separately from the recipient's current profile", () => {
    const reader = forward.slice(forward.indexOf("create function public.read_governed_money_configuration"), forward.indexOf("create function public.read_governed_money_preparation"));
    expect(reader).toContain("'authorizationProfileVersion',a.profile_version");
    expect(reader).toContain("'recipientProfileVersion',c.profile_version");
  });
  it("counts existing restored recovery reservations using the declared net-capacity contract", () => {
    const dispatch = forward.slice(forward.indexOf("create function public.assert_governed_payout_dispatch"), forward.indexOf("do $$declare f regprocedure"));
    expect(dispatch).toContain("coalesce(sum(public.split_reserved_net(split_id)),0)");
    expect(dispatch.indexOf("coalesce(sum(public.split_reserved_net(split_id)),0)")).toBeGreaterThan(dispatch.indexOf("8814"));
    const recovery = readFileSync("supabase/migrations/20261020090013_recovery_payouts.sql", "utf8");
    expect(recovery).toContain("split_recovery_payouts"); expect(recovery).toContain("split_recovery_reversal_receipts");
  });
});
