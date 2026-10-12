import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const original = readFileSync("supabase/migrations/20261020090009_payment_requests.sql", "utf8");
const forward = readFileSync("supabase/migrations/20261024131100_ux_owner2_payment_terms.sql", "utf8");
const rollback = readFileSync("supabase/migrations/rollback-20261024131100_ux_owner2_payment_terms.sql", "utf8");
const body = (sql: string) => sql.match(/create (?:or replace )?function public\.accept_public_payment_request\(p_hash text\).*?as \$\$([\s\S]*?)\$\$;/)?.[1];

describe("payment acceptance forward and guarded inverse", () => {
  it("adds only the issued-term check before the original reservation", () => {
    const added = body(forward)!;
    expect(added.indexOf("payment_request_terms_required")).toBeLessThan(added.indexOf("public.reserve_business_payment"));
    expect(added.replace(/ if jsonb_typeof\(r\.cancellation_policy[^\n]*\n/, "")).toBe(body(original));
    expect(forward).not.toMatch(/update public\.business_payment_requests|insert into public\.business_payment_requests/);
  });
  it("pins each function body before changing it, restores exactly, and retains service-only ACLs", () => {
    expect(body(rollback)).toBe(body(original));
    for (const [migration, expected] of [[forward, body(original)!], [rollback, body(forward)!]] as const) {
      expect(migration).toContain(`md5(p.prosrc)<>'${createHash("md5").update(expected).digest("hex")}'`);
      expect(migration).toContain("payment_terms_function_drift");
      expect(migration).toContain("payment_terms_acl_drift");
      expect(migration).toContain("revoke all on function public.accept_public_payment_request(text) from public,anon,authenticated;");
      expect(migration).toContain("grant execute on function public.accept_public_payment_request(text) to service_role;");
    }
  });
});
