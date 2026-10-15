import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(join(process.cwd(), "supabase/migrations", name), "utf8");
const up = read("20261026160000_sites_atomic_publish.sql");
const down = read("rollback-20261026160000_sites_atomic_publish.sql");

describe("atomic site publish migration", () => {
  it("publishes sections, versions, page layout and drafts in one function", () => {
    expect(up).toContain("security definer");
    expect(up).toContain("pg_advisory_xact_lock");
    expect(up).toContain("insert into public.content_versions");
    expect(up).toContain("delete from public.draft_content");
    expect(up).toContain("delete from public.draft_page_config");
  });

  it("writes receipts only when asked", () => {
    expect(up).toMatch(/if p_with_receipts then\s+receipt := public\.write_operator_content/);
  });

  it("is executable by service_role only", () => {
    expect(up).toContain("revoke all on function public.publish_site_drafts(text,jsonb,jsonb,text,boolean) from public, anon, authenticated");
    expect(up).toContain("grant execute on function public.publish_site_drafts(text,jsonb,jsonb,text,boolean) to service_role");
    expect(up).not.toMatch(/grant execute[^;]*to (anon|authenticated)/);
  });

  it("keeps content.updated_at current", () => {
    expect(up).toContain("create trigger content_touch_updated_at before update on public.content");
    expect(up).toContain("create trigger page_config_touch_updated_at before update on public.page_config");
  });

  it("rolls back the function and both triggers", () => {
    expect(down).toContain("drop function if exists public.publish_site_drafts");
    expect(down).toContain("drop trigger if exists content_touch_updated_at");
    expect(down).toContain("drop trigger if exists page_config_touch_updated_at");
    expect(down).toContain("drop function if exists public.touch_content_updated_at");
  });
});
