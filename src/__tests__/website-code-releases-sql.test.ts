import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(join(process.cwd(), "supabase/migrations", name), "utf8");
const NAME = "20261027120300_website_code_releases.sql";
const up = read(NAME);
const down = read(`rollback-${NAME}`);
const earlier = read("20261010113000_website_system_releases.sql");

describe("website code releases migration", () => {
  it("sorts after the agent tools migration and keeps the table immutable, private and RLS-on", () => {
    expect(NAME > "20261027120200_site_change_agent_tools.sql").toBe(true);
    expect(up).toContain("alter table public.website_code_releases enable row level security");
    expect(up).toContain("revoke all on public.website_code_releases from public,anon,authenticated,service_role");
    expect(up).toMatch(/create trigger website_code_release_immutable_trg before update or delete on public\.website_code_releases\s+for each row execute function public\.website_document_immutable\(\)/);
    expect(up).toContain("unique (workspace_id, request_key)");
  });

  it("lets only an owner principal record, on the website:code scope, and only service_role execute", () => {
    for (const fn of ["agent_website_code_release_target", "agent_record_website_code_release"]) {
      const body = new RegExp(`create function public\\.${fn}[\\s\\S]*?end \\$\\$;`).exec(up)?.[0] ?? "";
      expect(body, fn).toContain("'website:code'");
      expect(body, fn).toContain("if t.agency_id is not null then raise exception 'website_change_operator_required'");
      expect(up).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role`));
      expect(up).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public,anon,authenticated`));
    }
    expect(up).toContain("raise exception 'website_release_conflict'");
  });

  it("keeps every earlier source branch of reconcile and adds the code: branch before the cutover undo", () => {
    for (const branch of ["website_document_receipts", "website_change_receipts", "website_cutover_undos", "content_versions", "website_document_publications"]) {
      expect(up, branch).toContain(branch);
    }
    const body = (text: string) => text.slice(text.indexOf("function public.reconcile_website_system_releases(") + "function ".length, text.indexOf("return n;"));
    const strip = (text: string) => text.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
    // Take the new branch out and the rest is the earlier definition, word for word.
    const withoutBranch = body(up).replace(/select 'code:'[\s\S]*?cr\.system_id=p_system_id\s+union all\s+/, "");
    expect(withoutBranch).not.toContain("website_code_releases");
    expect(strip(withoutBranch)).toBe(strip(body(earlier)));
    expect(up.indexOf("'code:'||cr.id::text")).toBeLessThan(up.indexOf("'undo:'||u.command_id::text"));
    expect(up).toContain("grant execute on function public.reconcile_website_system_releases(uuid,uuid,text,uuid,text,text,boolean) to service_role");
  });

  it("has a guarded rollback that restores reconcile, drops the functions and refuses to drop recorded releases", () => {
    expect(down).toContain("website_code_releases_rollback_later_function_or_acl");
    expect(down).toContain("current_setting('sites_by_code.allow_drop', true)");
    expect(down).toContain("website_code_releases_rollback_rows_retained");
    expect(down).toContain("drop function public.agent_record_website_code_release");
    expect(down).toContain("drop function public.agent_website_code_release_target");
    expect(down.indexOf("before_definition")).toBeLessThan(down.indexOf("drop table public.website_code_releases"));
  });
});
