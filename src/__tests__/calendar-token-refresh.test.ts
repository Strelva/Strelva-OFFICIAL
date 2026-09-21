import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  row: {
    id: "11111111-1111-4111-8111-111111111111",
    workspace_id: "22222222-2222-4222-8222-222222222222",
    provider: "outlook",
    calendar_id: "calendar-1",
    calendar_name: "Operations",
    time_zone: "America/New_York",
    status: "connected",
    scopes: ["Calendars.ReadWrite"],
    access_token_ciphertext: "old-access",
    refresh_token_ciphertext: "old-refresh",
    token_expires_at: "2026-09-20T14:59:00.000Z",
    reminder_policy: { mode: "off" },
    last_checked_at: null,
    last_error: null,
    created_by: "33333333-3333-4333-8333-333333333333",
    created_at: "2026-09-20T00:00:00.000Z",
    updated_at: "2026-09-20T00:00:00.000Z",
  } as Record<string, unknown>,
  membership: { role: "owner" } as Record<string, unknown> | null,
  exitCompleted: false,
  exitError: null as { message?: string } | null,
}));

function query(table: string): Record<string, unknown> {
  const filters = new Map<string, unknown>();
  let updateCalled = false;
  let updateMatched = false;
  let updateValues: Record<string, unknown> | null = null;
  const result = () => {
    if (updateCalled && updateValues) {
      updateMatched = table !== "workspace_calendar_connections"
        || !filters.has("updated_at")
        || state.row.updated_at === filters.get("updated_at");
      if (updateMatched) state.row = { ...state.row, ...updateValues };
      updateValues = null;
    }
    if (updateCalled && !updateMatched) return { data: null, error: null };
    return table === "workspace_memberships" ? { data: state.membership, error: null } : { data: state.row, error: null };
  };
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = (column: string, value: unknown) => { filters.set(column, value); return builder; };
  builder.order = () => builder;
  builder.update = (values: Record<string, unknown>) => {
    updateCalled = true;
    updateValues = values;
    return builder;
  };
  builder.maybeSingle = async () => result();
  builder.single = async () => result();
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
  return builder;
}

vi.mock("@/lib/db/client", () => ({ getSupabase: () => ({
  from: (table: string) => query(table),
  rpc: async () => ({ data: state.exitCompleted, error: state.exitError }),
}) }));
vi.mock("@/lib/redis", () => ({ getRedis: () => null }));

import { assertWorkspaceCalendarWriteAllowed, getWorkspaceCalendarConnection } from "@/products/scheduling/calendar/repository";

const actor = { userId: "33333333-3333-4333-8333-333333333333", verifiedEmail: "owner@example.test" };
const past = "2020-09-20T14:59:00.000Z";
const future = "2099-09-20T14:59:00.000Z";

describe("workspace calendar credential refresh boundary", () => {
  beforeEach(() => {
    vi.stubEnv("MICROSOFT_CLIENT_ID", "outlook-client");
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "outlook-secret");
    vi.stubEnv("SECRETS_ENC_KEY", "calendar-refresh-test-key");
    state.membership = { role: "owner" };
    state.exitCompleted = false;
    state.exitError = null;
    state.row = { ...state.row, status: "connected", access_token_ciphertext: "old-access", refresh_token_ciphertext: "old-refresh", token_expires_at: past, last_error: null };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("refreshes before provider use, persists encrypted rotated credentials, and reuses the new expiry", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ access_token: "new-access", refresh_token: "rotated-refresh", expires_in: 3600, scope: "Calendars.ReadWrite" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    const first = await getWorkspaceCalendarConnection(actor, String(state.row.workspace_id), "outlook");
    expect(first).toMatchObject({ accessToken: "new-access", refreshToken: "rotated-refresh", status: "connected" });
    expect(String(state.row.access_token_ciphertext)).toMatch(/^enc:v1:/);
    expect(String(state.row.refresh_token_ciphertext)).toMatch(/^enc:v1:/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await getWorkspaceCalendarConnection(actor, String(state.row.workspace_id), "outlook");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(state.row.token_expires_at)).not.toBe(past);
  });

  it("does not refresh a revoked connection even when its refresh token is missing", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    state.row = { ...state.row, status: "revoked", refresh_token_ciphertext: null, token_expires_at: past };
    const result = await getWorkspaceCalendarConnection(actor, String(state.row.workspace_id), "outlook");
    expect(result).toMatchObject({ status: "revoked" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("marks a failed refresh as needing attention without exposing or retrying provider writes", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    await expect(getWorkspaceCalendarConnection(actor, String(state.row.workspace_id), "outlook")).rejects.toMatchObject({ message: "Calendar authorization has expired. Reconnect the calendar." });
    expect(state.row.status).toBe("error");
    expect(String(state.row.last_error)).toContain("Reconnect the calendar");
    expect(String(state.row.last_error)).not.toContain("old-refresh");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("leaves a live token untouched when its expiry is outside the refresh window", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    state.row = { ...state.row, token_expires_at: future };
    const result = await getWorkspaceCalendarConnection(actor, String(state.row.workspace_id), "outlook");
    expect(result).toMatchObject({ accessToken: "old-access", refreshToken: "old-refresh" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed for new connection changes after exit while leaving token refresh available for recovery", async () => {
    state.exitCompleted = true;
    await expect(assertWorkspaceCalendarWriteAllowed(String(state.row.workspace_id))).rejects.toMatchObject({ name: "WorkspaceConflictError" });

    const fetcher = vi.fn(async () => new Response(JSON.stringify({ access_token: "recovery-access", refresh_token: "recovery-refresh", expires_in: 3600 }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    const connection = await getWorkspaceCalendarConnection(actor, String(state.row.workspace_id), "outlook");
    expect(connection).toMatchObject({ accessToken: "recovery-access", refreshToken: "recovery-refresh" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the exit state cannot be read before changing a connection", async () => {
    state.exitError = { message: "database unavailable" };
    await expect(assertWorkspaceCalendarWriteAllowed(String(state.row.workspace_id))).rejects.toMatchObject({ name: "WorkspaceConflictError" });
    await expect(assertWorkspaceCalendarWriteAllowed("not-a-workspace-id")).rejects.toMatchObject({ name: "WorkspaceConflictError" });
  });

  it("does not reconnect a calendar after a delayed refresh loses an optimistic update race", async () => {
    let resolveRefresh: (response: Response) => void = () => undefined;
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { resolveRefresh = resolve; }));
    vi.stubGlobal("fetch", fetcher);
    const pending = getWorkspaceCalendarConnection(actor, String(state.row.workspace_id), "outlook");
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    state.row = { ...state.row, status: "revoked", access_token_ciphertext: null, refresh_token_ciphertext: null, updated_at: "2026-09-20T00:00:01.000Z" };
    resolveRefresh(new Response(JSON.stringify({ access_token: "late-access", refresh_token: "late-refresh", expires_in: 3600 }), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await pending;
    expect(result).toMatchObject({ status: "revoked" });
    expect(state.row.access_token_ciphertext).toBeNull();
    expect(state.row.refresh_token_ciphertext).toBeNull();
  });

  it("uses the updated_at compare-and-swap when separate repository instances refresh concurrently", async () => {
    const responses: Array<(response: Response) => void> = [];
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { responses.push(resolve); }));
    vi.stubGlobal("fetch", fetcher);
    vi.resetModules();
    const firstRepository = await import("@/products/scheduling/calendar/repository");
    vi.resetModules();
    const secondRepository = await import("@/products/scheduling/calendar/repository");
    const first = firstRepository.getWorkspaceCalendarConnection(actor, String(state.row.workspace_id), "outlook");
    const second = secondRepository.getWorkspaceCalendarConnection(actor, String(state.row.workspace_id), "outlook");
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    responses[0]!(new Response(JSON.stringify({ access_token: "first-access", refresh_token: "first-refresh", expires_in: 3600 }), { status: 200, headers: { "content-type": "application/json" } }));
    await vi.waitFor(() => expect(state.row.access_token_ciphertext).not.toBe("old-access"));
    responses[1]!(new Response(JSON.stringify({ access_token: "second-access", refresh_token: "second-refresh", expires_in: 3600 }), { status: 200, headers: { "content-type": "application/json" } }));
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult?.accessToken).toBe("first-access");
    expect(secondResult?.accessToken).toBe("first-access");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
