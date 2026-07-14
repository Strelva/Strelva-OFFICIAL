import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("persistence domain contracts", () => {
  it("persists application event and suggestion identifiers as text", () => {
    const migration = readFileSync(
      path.join(process.cwd(), "supabase/migrations/20260714183000_align_domain_identifier_types.sql"),
      "utf8",
    );
    expect(migration).toMatch(/alter table unified_events[\s\S]*alter column id type text/i);
    expect(migration).toMatch(/alter table suggestions[\s\S]*alter column id type text/i);
  });
});
