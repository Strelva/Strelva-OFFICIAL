import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ getSupabase: () => null }));

import {
  WorkspaceAccessError,
  WorkspaceStoreError,
  ensurePersonalWorkspace,
} from "@/platform/workspaces";

const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260905190000_release_one_workspaces.sql"),
  "utf8",
);

describe("release-one workspace persistence boundary", () => {
  it("fails closed when durable Postgres storage is unavailable", async () => {
    await expect(ensurePersonalWorkspace({
      userId: "11111111-1111-4111-8111-111111111111",
      verifiedEmail: "owner@example.com",
    })).rejects.toBeInstanceOf(WorkspaceStoreError);
  });

  it("rejects actors without a verified-email-shaped identity before storage", async () => {
    await expect(ensurePersonalWorkspace({
      userId: "11111111-1111-4111-8111-111111111111",
      verifiedEmail: "",
    })).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("keeps handoffs recipient-bound and stores only a token digest", () => {
    expect(migration).toContain("token_hash text not null unique");
    expect(migration).toContain("h.recipient_email <> normalized_email");
    expect(migration).toContain("u.verified_at is not null");
    expect(migration).not.toMatch(/\btoken\s+text\b/);
  });

  it("delegates only the accepted copy and preserves it on revocation", () => {
    expect(migration).toContain("foreign key (customer_work_id, customer_workspace_id)");
    expect(migration).toContain("references public.saved_product_work(id, workspace_id) on delete cascade");
    expect(migration).toContain("customer_id, copied_id, h.agency_workspace_id");
    expect(migration).toContain("scope = array['work:read']::text[]");
    expect(migration).toContain("status in ('active', 'revoked')");
    expect(migration).not.toMatch(/customer_work_id uuid[^\n]*on delete set null/);
  });

  it("leaves every workspace table deny-by-default and limits RPC execution", () => {
    for (const table of [
      "workspaces",
      "workspace_memberships",
      "saved_product_work",
      "workspace_delegations",
      "workspace_handoffs",
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("revoke all on function public.accept_workspace_handoff");
    expect(migration).toContain("grant execute on function public.accept_workspace_handoff");
    expect(migration).not.toMatch(/create policy/i);
  });
});
