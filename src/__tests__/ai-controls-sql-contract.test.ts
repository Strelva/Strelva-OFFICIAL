import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const name = "20261026170000_ai_controls.sql";
const forward = readFileSync(`supabase/migrations/${name}`, "utf8");
const inverse = readFileSync(`supabase/migrations/rollback-${name}`, "utf8");

function fn(source: string, signature: string): string {
  const start = source.indexOf(`create function public.${signature}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n$$;", start);
  return source.slice(start, end);
}

describe("per-client usage controls SQL contract", () => {
  it("sorts after the migrations it builds on", () => {
    // Later lanes take later timestamps; this one must follow the budget and Connections migrations.
    const builtOn = readdirSync("supabase/migrations").filter(file => /^\d/.test(file) && file <= "20261026130000_conn_apps_declarations.sql");
    expect(builtOn.length).toBeGreaterThan(0);
    expect(builtOn.filter(file => file > name)).toEqual([]);
    expect(name > "20261026130000_conn_apps_declarations.sql").toBe(true);
  });

  it("leaves the v1 budget functions alone", () => {
    expect(forward).not.toMatch(/function public\.business_ai_budget\(/);
    expect(forward).not.toMatch(/function public\.reserve_business_ai_budget\(/);
  });

  it("serializes admissions and control changes on one workspace lock", () => {
    const key = "hashtextextended(p_workspace_id::text, 202610241215)";
    const reserve = fn(forward, "reserve_business_ai_budget_v2");
    expect(reserve.indexOf(key)).toBeGreaterThan(0);
    expect(reserve.indexOf(key)).toBeLessThan(reserve.indexOf("business_ai_budget_v2(p_workspace_id)"));
    for (const setter of ["set_agency_ai_controls", "set_operator_ai_controls"]) {
      const body = fn(forward, setter);
      expect(body.indexOf(key)).toBeGreaterThan(0);
      expect(body.indexOf(key)).toBeLessThan(body.indexOf("from public.business_ai_controls where workspace_id = p_workspace_id for update"));
    }
  });

  it("revokes every new function from anon and authenticated, and never grants the scope helper", () => {
    const created = [...forward.matchAll(/create function public\.(\w+)\(/g)].map(match => match[1]!);
    expect(created.length).toBe(9);
    const revoke = forward.slice(forward.indexOf("revoke all on function"), forward.indexOf("grant execute on function"));
    for (const fnName of created) expect(revoke).toContain(`public.${fnName}(`);
    expect(revoke).toContain("from public, anon, authenticated");
    const grant = forward.slice(forward.indexOf("grant execute on function"), forward.indexOf("-- The scope helper"));
    expect(grant).not.toContain("agency_ai_controls_scope");
    expect(forward).toContain("revoke all on function public.agency_ai_controls_scope(uuid,uuid,uuid,text,boolean) from service_role");
  });

  it("scopes an agency to an active seat, a finished exit check and an owner or admin write", () => {
    const scope = fn(forward, "agency_ai_controls_scope");
    for (const expression of ["s.status = 'active'", "workspace_exit_completed(p_workspace_id)", "member_role in ('owner','admin')", "if p_write then raise exception 'workspace_access_denied'", "agency_client_staff"]) expect(scope).toContain(expression);
  });

  it("releases a list-price hold once its cost is known", () => {
    expect(fn(forward, "business_ai_budget_v2")).toContain("r.ceiling_source = 'list_price' and c.cost is not null then 0");
  });

  it("rolls back everything it created, refusing while controls or list-price holds are live", () => {
    const tables = [...forward.matchAll(/create table public\.(\w+)/g)].map(match => match[1]!);
    for (const table of tables) expect(inverse).toContain(`drop table public.${table}`);
    for (const created of forward.matchAll(/create function public\.(\w+)\(([^)]*)\)/g)) expect(inverse).toContain(`drop function public.${created[1]}(`);
    expect(inverse).toContain("drop column ceiling_source");
    expect(inverse).toContain("ai_controls_rollback_has_active_controls");
    expect(inverse).toContain("ai_controls_rollback_has_list_price_reservations");
  });
});
