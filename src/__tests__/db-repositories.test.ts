import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The migration's dual-write design hinges on: when Supabase is NOT configured,
// the client is null and every repository degrades (reads -> empty/null, writes
// -> no-op) WITHOUT throwing. This locks that contract so a caller can dual-write
// to Redis + Postgres safely while Postgres is still dark.

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
    await expect(repos.listEvents("gldf")).resolves.toEqual([]);
    await expect(repos.listLeads()).resolves.toEqual([]);
    await expect(repos.listBuildPayments()).resolves.toEqual([]);
    await expect(repos.getMailLogPg("gldf")).resolves.toEqual([]);
  });

  it("writes are no-ops that resolve (no throw) and inserts return null id", async () => {
    await expect(
      repos.upsertTenant({ id: "gldf", site_name: "GLDF", created_at: "2026-01-01" })
    ).resolves.toBeUndefined();
    await expect(
      repos.insertEvent({ tenant_id: "gldf", source: "ai", type: "content_update" })
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
});
