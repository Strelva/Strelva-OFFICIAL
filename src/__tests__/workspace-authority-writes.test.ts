import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "@/platform/infra/crypto/secrets";

type Row = Record<string, unknown>;
type RpcCall = { name: string; args: Row };

const OWNER = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "44444444-4444-4444-8444-444444444444";
const BUSINESS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGENCY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BUSINESS_WORK = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const AGENCY_WORK = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DELEGATION = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const HANDOFF = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const boundary = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  calls: [] as RpcCall[],
  /** What the next authority RPC returns. Defaults to a successful write. */
  nextRpc: null as null | { data?: unknown; error?: { message: string } },
}));

function query(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let counted = false;
  const run = async () => {
    const rows = (boundary.tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
    return { data: structuredClone(rows), error: null, count: counted ? rows.length : null };
  };
  const builder = {
    select(_columns?: string, options?: { count?: string }) { counted = Boolean(options?.count); return builder; },
    eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return builder; },
    gt() { return builder; },
    order() { return builder; },
    limit() { return builder; },
    async maybeSingle() { const result = await run(); return { ...result, data: result.data[0] ?? null }; },
    async single() { return builder.maybeSingle(); },
    then(resolve: (value: Awaited<ReturnType<typeof run>>) => unknown, reject?: (error: unknown) => unknown) { return run().then(resolve, reject); },
  };
  return builder;
}

function defaultRpc(name: string, args: Row): { data: unknown; error: null } {
  const now = "2026-10-05T12:00:00.000Z";
  if (name === "save_workspace_work") {
    return { data: [{ id: "99999999-9999-4999-8999-999999999999", workspace_id: args.p_workspace_id, product_id: args.p_product_id, resource_kind: args.p_resource_kind, title: args.p_title, payload: args.p_payload, created_by: args.p_user_id, created_at: now, updated_at: now }], error: null };
  }
  if (name === "create_workspace_handoff") {
    return { data: [{ id: "88888888-8888-4888-8888-888888888888", agency_workspace_id: AGENCY, source_work_id: args.p_source_work_id, recipient_email: args.p_recipient_email, status: "pending", expires_at: args.p_expires_at, created_by: args.p_user_id, created_at: now }], error: null };
  }
  if (name === "revoke_workspace_handoff" || name === "revoke_workspace_delegation" || name === "revoke_workspace_calendar_connection") {
    return { data: true, error: null };
  }
  if (name === "save_workspace_calendar_connection") {
    return { data: [{ id: "77777777-7777-4777-8777-777777777777", workspace_id: args.p_workspace_id, provider: args.p_provider, calendar_id: args.p_calendar_id, calendar_name: args.p_calendar_name, time_zone: args.p_time_zone, status: args.p_status, scopes: args.p_scopes, reminder_policy: args.p_reminder_policy, token_expires_at: null, last_checked_at: null, last_error: null, created_at: now, updated_at: now }], error: null };
  }
  if (name === "save_workspace_calendar_event_receipt") {
    const receipt = args.p_receipt as Row;
    return { data: [{ id: "66666666-6666-4666-8666-666666666666", ...receipt, created_at: now, updated_at: now }], error: null };
  }
  return { data: null, error: null };
}

vi.mock("@/platform/infra/db/client", () => ({
  getSupabase: () => ({
    from: (table: string) => query(table),
    async rpc(name: string, args: Row) {
      if (name === "workspace_exit_completed") return { data: false, error: null };
      if (name === "agency_can_read_assigned_work") return { data: false, error: null };
      boundary.calls.push({ name, args });
      if (boundary.nextRpc) {
        const next = boundary.nextRpc;
        boundary.nextRpc = null;
        return { data: next.data ?? null, error: next.error ?? null };
      }
      return defaultRpc(name, args);
    },
  }),
}));

import {
  createHandoff,
  revokeDelegation,
  revokeHandoff,
  saveWork,
} from "@/platform/workspaces/repository";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";
import {
  markWorkspaceCalendarConnectionError,
  revokeWorkspaceCalendarConnection,
  saveCalendarEventReceipt,
  saveWorkspaceCalendarConnection,
} from "@/products/scheduling/calendar/repository";

const as = (userId: string) => ({ userId, verifiedEmail: `${userId.slice(0, 4)}@example.test` });
const connectionInput = { provider: "google" as const, calendarId: "primary", calendarName: "Bookings", timeZone: "America/New_York", reminderPolicy: { mode: "off" as const } };
const receipt = {
  workspaceId: BUSINESS, workId: BUSINESS_WORK, requestId: "request-1", provider: "google" as const, calendarId: "primary",
  idempotencyKey: "schedule:request-1", operation: "create" as const, status: "writing" as const, revision: 1,
  title: "Roof inspection", start: "2026-10-06T09:00:00Z", end: "2026-10-06T10:00:00Z", timeZone: "America/New_York",
  reminderPolicy: { mode: "off" as const },
};

beforeEach(() => {
  vi.stubEnv("SECRETS_ENC_KEY", "workspace-authority-test-key");
  boundary.calls = [];
  boundary.nextRpc = null;
  const membership = (workspace_id: string, user_id: string, role: string) => ({ workspace_id, user_id, role });
  boundary.tables = {
    workspaces: [{ id: BUSINESS, kind: "customer" }, { id: AGENCY, kind: "agency" }],
    workspace_memberships: [BUSINESS, AGENCY].flatMap((workspace) => [
      membership(workspace, OWNER, "owner"), membership(workspace, ADMIN, "admin"), membership(workspace, MEMBER, "member"),
    ]),
    saved_product_work: [
      { id: BUSINESS_WORK, workspace_id: BUSINESS, product_id: "scheduling", resource_kind: "schedule", payload: {} },
      { id: AGENCY_WORK, workspace_id: AGENCY, product_id: "tracker", resource_kind: "tracker", payload: {} },
    ],
    workspace_handoffs: [{ id: HANDOFF, agency_workspace_id: AGENCY, source_work_id: AGENCY_WORK, status: "pending" }],
    workspace_delegations: [{ id: DELEGATION, customer_workspace_id: BUSINESS, customer_work_id: BUSINESS_WORK, agency_workspace_id: AGENCY, status: "active" }],
    workspace_calendar_connections: [],
  };
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("saveWork", () => {
  it("writes through save_workspace_work for a member and names the actor", async () => {
    const work = await saveWork(as(MEMBER), BUSINESS, { productId: "Tracker", resourceKind: "tracker", title: "  Intake  ", payload: { rows: [] } });
    expect(boundary.calls).toEqual([{ name: "save_workspace_work", args: {
      p_workspace_id: BUSINESS, p_user_id: MEMBER, p_product_id: "tracker", p_resource_kind: "tracker",
      p_title: "Intake", p_payload: { rows: [] }, p_input: null, p_source_work_id: null,
    } }]);
    expect(work).toMatchObject({ workspaceId: BUSINESS, createdBy: MEMBER, title: "Intake" });
  });

  it("stops an outsider in TypeScript before any write", async () => {
    await expect(saveWork(as(OUTSIDER), BUSINESS, { productId: "tracker", resourceKind: "tracker", payload: {} })).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(boundary.calls).toEqual([]);
  });

  it("maps a removal the SQL gate saw after the TypeScript check to an access error", async () => {
    boundary.nextRpc = { error: { message: "workspace_membership_required" } };
    await expect(saveWork(as(MEMBER), BUSINESS, { productId: "tracker", resourceKind: "tracker", payload: {} })).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("keeps cap and storage failures distinct from access", async () => {
    boundary.nextRpc = { error: { message: "saved_work_limit_reached" } };
    await expect(saveWork(as(MEMBER), BUSINESS, { productId: "tracker", resourceKind: "tracker", payload: {} })).rejects.toBeInstanceOf(WorkspaceConflictError);
    boundary.nextRpc = { data: [] };
    await expect(saveWork(as(MEMBER), BUSINESS, { productId: "tracker", resourceKind: "tracker", payload: {} })).rejects.toBeInstanceOf(WorkspaceStoreError);
  });
});

describe("createHandoff", () => {
  it("lets any agency member offer work, through create_workspace_handoff with a digest only", async () => {
    const { handoff, token } = await createHandoff(as(MEMBER), AGENCY_WORK, " Client@Example.test ");
    expect(boundary.calls).toHaveLength(1);
    const call = boundary.calls[0]!;
    expect(call.name).toBe("create_workspace_handoff");
    expect(call.args).toMatchObject({ p_user_id: MEMBER, p_source_work_id: AGENCY_WORK, p_recipient_email: "client@example.test" });
    expect(String(call.args.p_token_hash)).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(call.args)).not.toContain(token);
    expect(handoff.status).toBe("pending");
  });

  it("refuses business work in TypeScript and maps the SQL agency rule to the same message", async () => {
    await expect(createHandoff(as(OWNER), BUSINESS_WORK, "client@example.test")).rejects.toMatchObject({ name: "WorkspaceAccessError", message: "Only agency work can be handed off" });
    expect(boundary.calls).toEqual([]);
    boundary.nextRpc = { error: { message: "handoff_agency_only" } };
    await expect(createHandoff(as(OWNER), AGENCY_WORK, "client@example.test")).rejects.toMatchObject({ name: "WorkspaceAccessError", message: "Only agency work can be handed off" });
  });

  it("denies an outsider before any write and maps a SQL membership failure", async () => {
    await expect(createHandoff(as(OUTSIDER), AGENCY_WORK, "client@example.test")).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(boundary.calls).toEqual([]);
    boundary.nextRpc = { error: { message: "workspace_membership_required" } };
    await expect(createHandoff(as(MEMBER), AGENCY_WORK, "client@example.test")).rejects.toBeInstanceOf(WorkspaceAccessError);
  });
});

describe("revokeHandoff and revokeDelegation", () => {
  it("let an owner or admin revoke through the SQL-checked RPCs", async () => {
    await expect(revokeHandoff(as(ADMIN), HANDOFF)).resolves.toBe(true);
    await expect(revokeDelegation(as(OWNER), DELEGATION)).resolves.toBe(true);
    expect(boundary.calls).toEqual([
      { name: "revoke_workspace_handoff", args: { p_handoff_id: HANDOFF, p_user_id: ADMIN } },
      { name: "revoke_workspace_delegation", args: { p_delegation_id: DELEGATION, p_user_id: OWNER } },
    ]);
  });

  it("deny a plain member before any write", async () => {
    await expect(revokeHandoff(as(MEMBER), HANDOFF)).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(revokeDelegation(as(MEMBER), DELEGATION)).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(boundary.calls).toEqual([]);
  });

  it("map a downgrade the SQL gate saw to an access error and report a lost race as not revoked", async () => {
    boundary.nextRpc = { error: { message: "workspace_permission_denied" } };
    await expect(revokeHandoff(as(ADMIN), HANDOFF)).rejects.toBeInstanceOf(WorkspaceAccessError);
    boundary.nextRpc = { error: { message: "workspace_membership_required" } };
    await expect(revokeDelegation(as(ADMIN), DELEGATION)).rejects.toBeInstanceOf(WorkspaceAccessError);
    boundary.nextRpc = { data: false };
    await expect(revokeDelegation(as(ADMIN), DELEGATION)).resolves.toBe(false);
  });

  it("return false without writing for a missing or inactive row", async () => {
    boundary.tables.workspace_handoffs![0]!.status = "revoked";
    boundary.tables.workspace_delegations![0]!.status = "revoked";
    await expect(revokeHandoff(as(OWNER), HANDOFF)).resolves.toBe(false);
    await expect(revokeDelegation(as(OWNER), DELEGATION)).resolves.toBe(false);
    await expect(revokeHandoff(as(OWNER), "00000000-0000-4000-8000-000000000000")).resolves.toBe(false);
    expect(boundary.calls).toEqual([]);
  });
});

describe("calendar connection writes", () => {
  it("does not wipe stored Google tokens when provider consent revocation fails", async () => {
    vi.stubEnv("STRELVA_BOOKING_CALENDAR_REVOKE", "1");
    const token = encryptSecret("fictional-refresh-token");
    boundary.tables.workspace_calendar_connections = [{ id: "77777777-7777-4777-8777-777777777777", workspace_id: BUSINESS, provider: "google", calendar_id: "primary", calendar_name: "Bookings", time_zone: "America/New_York", status: "connected", scopes: ["calendar"], reminder_policy: { mode: "off" }, token_expires_at: null, last_checked_at: null, last_error: null, created_at: "2026-10-05T12:00:00Z", updated_at: "2026-10-05T12:00:00Z", refresh_token_ciphertext: token }];
    const fetcher = vi.fn().mockResolvedValue(new Response("failure", { status: 503 })); vi.stubGlobal("fetch", fetcher);
    await expect(revokeWorkspaceCalendarConnection(as(OWNER), BUSINESS, "google")).rejects.toMatchObject({ code: "provider" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(boundary.calls).toEqual([]);
    expect(boundary.tables.workspace_calendar_connections[0]?.refresh_token_ciphertext).toBe(token);
  });
  it("save, mark and revoke through manage_calendar RPCs with ciphertext only", async () => {
    const saved = await saveWorkspaceCalendarConnection(as(ADMIN), BUSINESS, connectionInput, { accessToken: "plain-access", refreshToken: "plain-refresh", scopes: ["calendar"] });
    await markWorkspaceCalendarConnectionError(as(OWNER), BUSINESS, "google", "x".repeat(1200));
    await expect(revokeWorkspaceCalendarConnection(as(OWNER), BUSINESS, "google")).resolves.toBe(true);
    expect(boundary.calls.map((call) => call.name)).toEqual([
      "save_workspace_calendar_connection", "mark_workspace_calendar_connection_error", "revoke_workspace_calendar_connection",
    ]);
    const save = boundary.calls[0]!.args;
    expect(save).toMatchObject({ p_workspace_id: BUSINESS, p_user_id: ADMIN, p_provider: "google", p_status: "connected", p_scopes: ["calendar"] });
    expect(String(save.p_access_token_ciphertext)).toMatch(/^enc:v1:/);
    expect(JSON.stringify(save)).not.toContain("plain-access");
    expect(JSON.stringify(save)).not.toContain("plain-refresh");
    expect(String(boundary.calls[1]!.args.p_message)).toHaveLength(1000);
    expect(saved).toMatchObject({ provider: "google", status: "connected" });
    expect(saved).not.toHaveProperty("accessToken");
  });

  it("deny a member in TypeScript before any write", async () => {
    const message = "A workspace owner or administrator must manage calendar connections.";
    await expect(saveWorkspaceCalendarConnection(as(MEMBER), BUSINESS, connectionInput, { accessToken: "plain-access" })).rejects.toMatchObject({ name: "WorkspaceAccessError", message });
    await expect(revokeWorkspaceCalendarConnection(as(MEMBER), BUSINESS, "google")).rejects.toMatchObject({ name: "WorkspaceAccessError", message });
    await expect(markWorkspaceCalendarConnectionError(as(OUTSIDER), BUSINESS, "google", "x")).rejects.toMatchObject({ name: "WorkspaceAccessError", message });
    expect(boundary.calls).toEqual([]);
  });

  it("map SQL authority and exit failures to the TypeScript errors", async () => {
    const message = "A workspace owner or administrator must manage calendar connections.";
    boundary.nextRpc = { error: { message: "workspace_permission_denied" } };
    await expect(saveWorkspaceCalendarConnection(as(ADMIN), BUSINESS, connectionInput, { accessToken: "a" })).rejects.toMatchObject({ name: "WorkspaceAccessError", message });
    boundary.nextRpc = { error: { message: "workspace_membership_required" } };
    await expect(revokeWorkspaceCalendarConnection(as(ADMIN), BUSINESS, "google")).rejects.toMatchObject({ name: "WorkspaceAccessError", message });
    boundary.nextRpc = { error: { message: "workspace_exit_future_work_blocked" } };
    await expect(saveWorkspaceCalendarConnection(as(ADMIN), BUSINESS, connectionInput, { accessToken: "a" })).rejects.toBeInstanceOf(WorkspaceConflictError);
    boundary.nextRpc = { error: { message: "connection refused" } };
    await expect(markWorkspaceCalendarConnectionError(as(ADMIN), BUSINESS, "google", "x")).rejects.toMatchObject({ name: "WorkspaceStoreError", message: "Calendar connection status could not be saved." });
  });
});

describe("calendar event receipts", () => {
  it("let any member record a receipt through save_workspace_calendar_event_receipt", async () => {
    const saved = await saveCalendarEventReceipt(as(MEMBER), receipt);
    expect(boundary.calls).toHaveLength(1);
    expect(boundary.calls[0]).toMatchObject({ name: "save_workspace_calendar_event_receipt", args: { p_user_id: MEMBER, p_receipt: {
      workspace_id: BUSINESS, work_id: BUSINESS_WORK, request_id: "request-1", provider: "google", start_at: receipt.start, end_at: receipt.end,
    } } });
    expect(saved).toMatchObject({ workspaceId: BUSINESS, requestId: "request-1", status: "writing" });
  });

  it("deny an outsider before any write and map a SQL removal to an access error", async () => {
    await expect(saveCalendarEventReceipt(as(OUTSIDER), receipt)).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(boundary.calls).toEqual([]);
    boundary.nextRpc = { error: { message: "workspace_membership_required" } };
    await expect(saveCalendarEventReceipt(as(MEMBER), receipt)).rejects.toBeInstanceOf(WorkspaceAccessError);
  });
});
