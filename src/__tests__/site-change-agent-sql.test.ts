import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(process.cwd(), "supabase/migrations");
const NAME = "20261027120200_site_change_agent_tools.sql";
const up = readFileSync(join(dir, NAME), "utf8");
const down = readFileSync(join(dir, `rollback-${NAME}`), "utf8");

describe("site change agent tools migration", () => {
  it("sorts after the connections migrations it builds on, and is unique", () => {
    const forwards = readdirSync(dir).filter((file) => /^20\d{12}_/.test(file));
    expect(NAME > "20261026130000_conn_apps_declarations.sql").toBe(true);
    expect(forwards.filter((file) => file.startsWith("20261027120200_"))).toEqual([NAME]);
  });

  it("keeps the step internal and the web path a delegate with no connection", () => {
    expect(up).toContain("revoke all on function public.website_change_record_step(uuid, uuid, text, uuid, text, jsonb, uuid) from public, anon, authenticated, service_role");
    expect(up).toMatch(/function public\.record_website_change_receipt[\s\S]*?return public\.website_change_record_step\(p_workspace_id, p_user_id, p_verified_email, p_request_id, p_kind, p_details, null\);/);
    expect(up).toContain("grant execute on function public.record_website_change_receipt(uuid, uuid, text, uuid, text, jsonb) to service_role");
  });

  it("lets an agent record only previews and deploys, only for an agency principal, on the website:code scope", () => {
    const record = /create function public\.agent_record_website_change[\s\S]*?\n\$\$;/.exec(up)?.[0] ?? "";
    expect(record).toContain("'website:code'");
    expect(record).toMatch(/if t\.agency_id is null then raise exception 'website_change_operator_required'/);
    expect(record).toContain("p_kind not in ('preview', 'deployed')");
    expect(record).toContain("t.connection_id");
    expect(up).toContain("raise exception 'website_change_not_accepted'");
    expect(up).toContain("perform public.acting_provider_assert(p_workspace_id, p_user_id, 'publish', 'website', system_text)");
  });

  it("grants an agency exactly business:read and website:code", () => {
    expect(up).toContain("(p_agency_id is not null and not p_scopes<@array['business:read','website:code']::text[])");
    expect(up).toContain("array['business:read','website:read','website:propose','website:code','inquiries:read','quotes:approve']");
  });

  it("reads Needs you with a volatile function that answers only an owner", () => {
    const reviews = /create function public\.list_website_change_reviews[\s\S]*?\n\$\$;/.exec(up)?.[0] ?? "";
    expect(reviews).not.toMatch(/\bstable\b/i);
    expect(reviews).toContain("is distinct from 'owner' then return '[]'::jsonb");
  });

  it("records what it replaces and has a guarded rollback that drops every new function", () => {
    expect(up).toContain("create schema sites_by_code_rollback");
    expect(up).toContain("after_fingerprint");
    expect(down).toContain("sites_by_code_rollback_later_function_or_acl");
    for (const fn of ["agent_list_website_change_requests", "agent_record_website_change", "website_change_may_deploy", "list_website_change_reviews", "website_change_record_step", "website_change_receipts_json"]) {
      expect(down).toMatch(new RegExp(`drop function public\\.${fn}\\(`));
    }
    expect(down).toContain("'website:code'=any(scopes)");
    expect(down).toContain("drop constraint website_change_receipts_preview_fields");
  });
});
