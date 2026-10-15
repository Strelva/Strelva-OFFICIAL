import { readFileSync, readdirSync } from "node:fs";
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

/** The text of one `create function public.<name>` … `end $$;` / `$$;` block. */
function fn(sql: string, name: string): string {
  const start = sql.indexOf(`create function public.${name}(`);
  if (start < 0) throw new Error(`missing ${name}`);
  const closers = [sql.indexOf("\nend $$;", start), sql.indexOf("\n$$;", start)].filter(index => index >= 0);
  return sql.slice(start, Math.min(...closers) + 8);
}

describe("20261027160100 keep your site: changes", () => {
  const sql = read("20261027160100_keep_your_site_changes.sql");
  const rpcs = [
    "list_connected_site_changes", "plan_connected_site_change", "decide_connected_site_change", "mark_connected_site_change_done",
    "record_connected_site_change_check", "release_connected_site_change_unconfirmed", "withdraw_connected_site_change",
    "list_connected_site_change_reviews", "read_connected_site_change_for_request", "read_connected_site_change_releases",
    "record_connected_site_detection", "read_agency_client_sites",
  ];
  it("defines and grants every RPC to service_role only", () => {
    for (const name of rpcs) {
      expect(sql).toContain(`create function public.${name}(`);
      expect(sql).toContain(`'${name}(`);
    }
    expect(sql).toMatch(/revoke all on function public\.%s from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.%s to service_role/);
  });
  it("closes the three tables and keeps helpers internal", () => {
    expect(sql).toContain("alter table public.connected_site_changes enable row level security;");
    expect(sql).toContain("alter table public.connected_site_change_steps enable row level security;");
    expect(sql).toContain("alter table public.connected_site_detections enable row level security;");
    expect(sql).toContain("revoke all on public.connected_site_changes, public.connected_site_change_steps, public.connected_site_detections from public, anon, authenticated, service_role;");
    expect(sql).toContain("revoke all on function public.connected_site_change_release(public.connected_site_changes, uuid, text, text, uuid) from public, anon, authenticated, service_role;");
  });
  it("makes steps append-only with before-update triggers", () => {
    expect(sql).toContain("create trigger connected_site_change_steps_immutable before update on public.connected_site_change_steps");
    expect(sql).toContain("create trigger connected_site_changes_immutable before update on public.connected_site_changes");
    expect(sql).not.toMatch(/before delete on public\.connected_site_change/);
    expect(sql).toContain("raise exception 'connected_site_change_immutable'");
  });
  it("lets only a direct owner say yes, never through a provider seat", () => {
    const body = fn(sql, "decide_connected_site_change");
    expect(body).toContain("workspace_memberships");
    expect(body).toContain("role = 'owner'");
    expect(body).not.toContain("provider_seat_role");
    expect(body).not.toContain("acting_provider");
    expect(body).toContain("connected_site_change_owner_required");
  });
  it("plans only for the accepted agency", () => {
    const body = fn(sql, "plan_connected_site_change");
    expect(body).toContain("provider_acceptance <> 'accepted'");
    expect(body).toContain("provider_agency_workspace_id is distinct from v_agency");
    expect(body).toContain("connected_site_change_agency_required");
    expect(body).toContain("allowed_origins");
  });
  it("records a Release through the existing append path with an idempotent key", () => {
    const body = fn(sql, "connected_site_change_release");
    expect(body).toContain("public.append_website_system_release(");
    expect(body).toContain("'connected-change:'");
    expect(body).toContain("'kind', 'connected_site'");
    expect(sql).not.toMatch(/website_change_receipts|record_website_change_receipt|reconcile_website_system_releases/);
  });
  it("declares only the lock-free readers stable", () => {
    for (const name of ["connected_site_change_stage", "connected_site_change_request_stage"]) {
      const body = fn(sql, name);
      expect(body).toMatch(/\bstable\b/);
      expect(body).not.toMatch(/for (share|update)/i);
    }
    for (const name of rpcs.filter(item => item !== "read_agency_client_sites")) {
      const body = fn(sql, name);
      if (/connected_site_assert_actor|acting_provider/.test(body)) expect(body).not.toMatch(/\bstable\b/);
    }
    for (const name of ["list_connected_site_changes", "mark_connected_site_change_done", "record_connected_site_change_check"]) expect(fn(sql, name)).toMatch(/\bvolatile\b/);
  });
  it("counts the stage the way the TypeScript stage machine does", () => {
    const body = fn(sql, "connected_site_change_stage");
    for (const [kind, stage] of [["approved", "ready_to_make"], ["declined", "declined"], ["marked_done", "checking"], ["withdrawn", "withdrawn"]]) {
      expect(body).toContain(`when '${kind}' then '${stage}'`);
    }
    expect(body).toContain("when 'planned' then case when s.owner_facing then 'planned_waiting' else 'ready_to_make' end");
    expect(body).toContain("when 'checked' then case when s.check_result = 'visible' then 'checking' else 'not_seen' end");
    expect(body).toContain("when 'released' then case when s.read_back = 'confirmed' then 'done' else 'done_unconfirmed' end");
  });
  it("keeps the rollback honest about Releases", () => {
    const rollback = read("rollback-20261027160100_keep_your_site_changes.sql");
    expect(rollback).toContain("kind='released'");
    expect(rollback).toContain("keep_your_site_rollback_has_releases");
    for (const name of rpcs) expect(rollback).toContain(`drop function public.${name}(`);
  });
});

describe("20261027160100 keep your site: agency client websites", () => {
  const sql = read("20261027160100_keep_your_site_changes.sql");
  const body = fn(sql, "read_agency_client_sites");
  it("is a lock-free reader of staffed clients only", () => {
    expect(body).toMatch(/\bstable\b/);
    expect(body).not.toMatch(/for (share|update)/i);
    expect(body).toContain("st.status = 'active'");
    expect(body).toContain("s.status = 'active'");
    expect(body).toContain("agency_client_staff");
  });
  it("never selects a site key or verification token", () => {
    expect(body).not.toContain("public_key");
    expect(body).not.toContain("verification_token");
  });
});

describe("20261027160200 keep your site: agency Home", () => {
  const sql = read("20261027160200_keep_your_site_agency_home.sql");
  const original = read("20261024123500_ux_chrome_recorded_actors.sql");
  const squash = (text: string) => text.replace(/\s+/g, " ").trim();
  const functionOf = (text: string) => {
    const start = text.indexOf("create or replace function public.read_agency_client_home(");
    return text.slice(start, text.indexOf("end $$;", start) + 7);
  };
  const stageBranch = "when r.context->>'source'='connected_site_change' and r.provider_acceptance='accepted' and public.connected_site_change_request_stage(r.id) is not null then public.connected_site_change_request_stage(r.id)";
  const releaseUnion = "union all select 'site:'||st.id,'Website change on '||cs.site_host,c.system_id,'not_confirmed',st.recorded_at from public.connected_site_change_steps st join public.connected_site_changes c on c.id=st.change_id join public.connected_sites cs on cs.id=c.connected_site_id where c.business_workspace_id=p_workspace_id and st.kind='released' and st.read_back='not_confirmed' and exists(select 1 from public.systems s where s.id=c.system_id and s.business_workspace_id=p_workspace_id and public.system_in_scope(p_workspace_id,s.origin_kind,s.origin_ref,scope.work_ids))";
  it("is the newest definition it copies", () => {
    const definitions = readdirSync(dir).filter(name => /^\d{14}_.*\.sql$/.test(name) && read(name).includes("function public.read_agency_client_home("));
    expect(definitions.at(-2)).toBe("20261024123500_ux_chrome_recorded_actors.sql");
    expect(definitions.at(-1)).toBe("20261027160200_keep_your_site_agency_home.sql");
  });
  it("equals the original body except for the two inserted fragments", () => {
    const body = squash(functionOf(sql));
    expect(body).toContain(stageBranch);
    expect(body).toContain(releaseUnion);
    expect(body.replace(stageBranch, "").replace(releaseUnion, "").replace(/\s+/g, " ")).toBe(squash(functionOf(original)));
  });
  it("is still stable and security definer", () => {
    expect(functionOf(sql)).toContain("returns jsonb language plpgsql stable security definer");
  });
  it("rolls back only an untouched function", () => {
    const rollback = read("rollback-20261027160200_keep_your_site_agency_home.sql");
    expect(rollback).toContain("keep_your_site_home_rollback_drift");
    expect(rollback).toContain("after_fingerprint");
    expect(sql).toContain("md5(pg_get_functiondef(p.oid)||':'||p.proowner::text||':'||coalesce(p.proacl::text,''))");
  });
});
