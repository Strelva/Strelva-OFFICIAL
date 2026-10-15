import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const OWNER = "11111111-1111-4111-8111-111111111111";
const BUSINESS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROW_ID = "77777777-7777-4777-8777-777777777777";

const boundary = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  selects: [] as Array<{ table: string; columns: string }>,
  filters: [] as Array<[string, unknown]>,
  rpcs: [] as Array<{ name: string; args: Row }>,
  recorded: [] as Array<Record<string, unknown>>,
  eligibility: [] as Array<Record<string, unknown>>,
}));

function query(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  const run = async () => ({ data: structuredClone((boundary.tables[table] ?? []).filter(row => filters.every(filter => filter(row)))), error: null, count: null });
  const builder = {
    select(columns?: string) { boundary.selects.push({ table, columns: columns ?? "*" }); return builder; },
    eq(key: string, value: unknown) { boundary.filters.push([key, value]); filters.push(row => row[key] === value); return builder; },
    gt() { return builder; }, order() { return builder; }, limit() { return builder; },
    async maybeSingle() { const result = await run(); return { ...result, data: result.data[0] ?? null }; },
    async single() { return builder.maybeSingle(); },
    then(resolve: (value: Awaited<ReturnType<typeof run>>) => unknown, reject?: (error: unknown) => unknown) { return run().then(resolve, reject); },
  };
  return builder;
}

vi.mock("@/platform/infra/db/client", () => ({
  getSupabase: () => ({
    from: (table: string) => query(table),
    async rpc(name: string, args: Row) {
      if (name === "workspace_exit_completed") return { data: false, error: null };
      boundary.rpcs.push({ name, args });
      if (name === "save_workspace_calendar_connection") {
        const now = "2026-10-15T12:00:00.000Z";
        return { data: [{ id: ROW_ID, workspace_id: args.p_workspace_id, provider: args.p_provider, calendar_id: args.p_calendar_id, calendar_name: args.p_calendar_name, time_zone: args.p_time_zone, status: args.p_status, scopes: args.p_scopes, reminder_policy: args.p_reminder_policy, token_expires_at: null, last_checked_at: null, last_error: null, created_at: now, updated_at: now }], error: null };
      }
      return { data: null, error: null };
    },
  }),
}));
vi.mock("@/platform/connections/server", async importOriginal => ({
  ...await importOriginal<typeof import("@/platform/connections/server")>(),
  connectionEligibilityFor: vi.fn(async (_actor: unknown, input: Record<string, unknown>) => { boundary.eligibility.push(input); return { eligible: true, through: { kind: "platform" } }; }),
}));
vi.mock("@/platform/connections/holders", async importOriginal => ({
  ...await importOriginal<typeof import("@/platform/connections/holders")>(),
  recordConnectionHolder: vi.fn(async (input: Record<string, unknown>) => { boundary.recorded.push(input); }),
}));

import { outlookCalendarConnectionSource, googleCalendarConnectionSource } from "@/products/scheduling/calendar/connection-source";
import { saveWorkspaceCalendarConnection } from "@/products/scheduling/calendar/repository";
import { composeWorkspaceConnections } from "@/platform/connections/read-model";
import { providerEligibility } from "@/platform/connections/eligibility";
import { providerKeyStatus, resetProviderKeyWarningsForTests } from "@/platform/connections/provider-keys";

const as = (userId: string) => ({ userId, verifiedEmail: "owner@example.test" });
const platformAccess = { provider: "outlook_calendar" as const, through: { kind: "platform" as const }, approval: "not_required" as const };

beforeEach(() => {
  vi.stubEnv("SECRETS_ENC_KEY", "outlook-test-key");
  boundary.selects = []; boundary.filters = []; boundary.rpcs = []; boundary.recorded = []; boundary.eligibility = [];
  boundary.tables = {
    workspaces: [{ id: BUSINESS, kind: "customer" }],
    workspace_memberships: [{ workspace_id: BUSINESS, user_id: OWNER, role: "owner" }],
    workspace_calendar_connections: [
      { id: ROW_ID, workspace_id: BUSINESS, provider: "outlook", calendar_name: "Harbor Outlook", status: "connected", created_at: "2026-10-15T12:00:00Z" },
      { id: "88888888-8888-4888-8888-888888888888", workspace_id: BUSINESS, provider: "google", calendar_name: "Harbor Google", status: "connected", created_at: "2026-10-15T12:00:00Z" },
    ],
  };
});
afterEach(() => { vi.unstubAllEnvs(); resetProviderKeyWarningsForTests(); });

describe("Outlook calendar as a Connection", () => {
  it("lists only Outlook rows, as outlook_calendar:<id>, without ever selecting token columns", async () => {
    const rows = await outlookCalendarConnectionSource().list({ workspaceId: BUSINESS, access: platformAccess });
    expect(rows).toEqual([expect.objectContaining({ ref: `outlook_calendar:${ROW_ID}`, provider: "outlook_calendar", accountLabel: "Harbor Outlook", state: "connected" })]);
    expect(boundary.filters).toContainEqual(["provider", "outlook"]);
    const select = boundary.selects.find(item => item.table === "workspace_calendar_connections")!.columns;
    expect(select).toBe("id,calendar_name,status,created_at");
    expect(select).not.toMatch(/token|secret|ciphertext/);
  });

  it("keeps the Google source on Google rows", async () => {
    const rows = await googleCalendarConnectionSource().list({ workspaceId: BUSINESS, access: { ...platformAccess, provider: "google_calendar" } });
    expect(rows.map(row => row.ref)).toEqual(["google_calendar:88888888-8888-4888-8888-888888888888"]);
  });

  it("shows Unknown whose account until a holder is recorded, then the recorded holder", async () => {
    const sources = [outlookCalendarConnectionSource()];
    const accessFor = () => platformAccess;
    const unrecorded = await composeWorkspaceConnections({ workspaceId: BUSINESS, sources, holders: new Map(), accessFor });
    expect(unrecorded.sourceErrors).toEqual([]);
    expect(unrecorded.connections[0]).toMatchObject({ accountHolder: { kind: "unknown" }, state: "stale" });
    const holders = new Map([[`outlook_calendar:${ROW_ID}`, { accountHolder: { kind: "business" as const, workspaceId: BUSINESS }, accessThrough: { kind: "platform" as const } }]]);
    const recorded = await composeWorkspaceConnections({ workspaceId: BUSINESS, sources, holders, accessFor });
    expect(recorded.connections[0]).toMatchObject({ accountHolder: { kind: "business", workspaceId: BUSINESS }, state: "connected" });
  });

  it("says not set up when the Microsoft keys are missing", async () => {
    const keys = providerKeyStatus("outlook_calendar", { MICROSOFT_CLIENT_ID: "id" }, () => {});
    expect(keys).toEqual({ ready: false, missing: ["MICROSOFT_CLIENT_SECRET", "OAUTH_STATE_SECRET or INTERNAL_API_SECRET", "APP_URL or NEXT_PUBLIC_APP_URL"] });
    const result = await providerEligibility({ access: platformAccess, businessWorkspaceId: BUSINESS, actingAgencyWorkspaceId: null, agencyHoldsArea: async () => false, keys });
    expect(result).toEqual({ eligible: false, reason: "not_set_up", message: "Outlook Calendar isn't set up on Strelva yet." });
  });

  it("records the holder for an Outlook calendar and checks its own eligibility", async () => {
    const saved = await saveWorkspaceCalendarConnection(as(OWNER), BUSINESS, { provider: "outlook", calendarId: "primary", calendarName: "Harbor Outlook", timeZone: "America/New_York", reminderPolicy: { mode: "off" } }, { accessToken: "fixture-access", refreshToken: "fixture-refresh" });
    expect(saved.provider).toBe("outlook");
    expect(boundary.eligibility).toEqual([{ provider: "outlook_calendar", businessWorkspaceId: BUSINESS }]);
    expect(boundary.recorded).toEqual([expect.objectContaining({ ref: `outlook_calendar:${ROW_ID}`, provider: "outlook_calendar", workspaceId: BUSINESS, accountHolder: { kind: "business", workspaceId: BUSINESS } })]);
  });

  it("still records Google under google_calendar", async () => {
    await saveWorkspaceCalendarConnection(as(OWNER), BUSINESS, { provider: "google", calendarId: "primary", calendarName: "Harbor", timeZone: "America/New_York", reminderPolicy: { mode: "off" } }, { accessToken: "fixture-access" });
    expect(boundary.recorded).toEqual([expect.objectContaining({ ref: `google_calendar:${ROW_ID}`, provider: "google_calendar" })]);
  });
});
