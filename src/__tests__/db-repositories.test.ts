import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Reads and explicit migration mirrors degrade when Supabase is unavailable.
// Postgres-authoritative writes must reject so a caller never reports success
// for tenant/content/identity data that was not persisted.

import { getSupabase, isSupabaseConfigured } from "../lib/db/client";
import * as repos from "../lib/db/repositories";

describe("Supabase data layer — degrades gracefully when unconfigured", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("getSupabase() is null and isSupabaseConfigured() is false with no env", () => {
    expect(getSupabase()).toBeNull();
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("reads return safe empty/null defaults (no throw)", async () => {
    await expect(repos.getTenant("gldf")).resolves.toBeNull();
    await expect(repos.listActiveTenants()).resolves.toEqual([]);
    await expect(repos.listAllDomainClaims()).resolves.toEqual([]);
    await expect(repos.listDomainClaims("gldf")).resolves.toEqual([]);
    await expect(repos.listEvents("gldf")).resolves.toEqual([]);
    await expect(repos.listLeads()).resolves.toEqual([]);
    await expect(repos.listBuildPayments()).resolves.toEqual([]);
    await expect(repos.getMailLogPg("gldf")).resolves.toEqual([]);
  });

  it("best-effort migration mirrors remain no-ops and inserts return null id", async () => {
    await expect(
      repos.insertEvent({ id: "evt_test_1", tenant_id: "gldf", source: "ai", type: "content_update" })
    ).resolves.toBeNull();
    await expect(repos.setEventStatus("evt_1", "approved")).resolves.toBeUndefined();
    await expect(
      repos.upsertLead({ email: "x@y.com" })
    ).resolves.toBeUndefined();
    await expect(
      repos.recordBuildPayment({ session_id: "cs_1", amount_cents: 200000 })
    ).resolves.toBeUndefined();
    await expect(
      repos.recordMailSendPg({ tenant_id: "gldf", kind: "weekly_report", ok: true })
    ).resolves.toBeUndefined();
  });

  it("authoritative writes reject when Postgres is unavailable", async () => {
    await expect(
      repos.upsertTenant({ id: "gldf", site_name: "GLDF", created_at: "2026-01-01" })
    ).rejects.toThrow("Supabase is not configured");
    await expect(repos.replaceDomainClaims("gldf", [])).rejects.toThrow("Supabase is not configured");
    await expect(
      repos.upsertMembership({
        user_id: "00000000-0000-0000-0000-000000000001",
        tenant_id: "gldf",
        role: "owner",
      })
    ).rejects.toThrow("Supabase is not configured");
    await expect(
      repos.upsertDraftContentData("gldf", "hero", { heading: "Hello" })
    ).rejects.toThrow("Supabase is not configured");
  });
});
