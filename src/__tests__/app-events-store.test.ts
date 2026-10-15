import { afterEach, describe, expect, it, vi } from "vitest";
import * as store from "@/platform/app-events/store";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";

const WS = "28100000-0000-4000-8000-000000000010";
const AGENCY = "28100000-0000-4000-8000-000000000020";
const USER = "28100000-0000-4000-8000-000000000002";
const TOKEN = "28100000-0000-4000-8000-0000000000aa";
const ACTOR = { userId: USER, verifiedEmail: "owner@example.test" };
const LANE = { subscriber: "app:bookings:stop_follow_ups", workspaceId: WS, leaseToken: TOKEN };

function fake(data: unknown, error: { code?: string; message?: string } | null = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  store.setAppEventsDb({ rpc });
  return rpc;
}
afterEach(() => store.setAppEventsDb(null));

const event = (sequence: number, extra: Record<string, unknown> = {}) => ({
  id: "28100000-0000-4000-8000-0000000000b" + sequence, workspaceId: WS, sequence, type: "booking.made", schemaVersion: 1,
  subject: { kind: "booking", id: "b" }, area: "bookings", occurredAt: "2026-10-15T10:00:00+00:00", recordedAt: "2026-10-15T10:00:00+00:00", data: {}, ...extra,
});
const deliveries = {
  workspaceId: WS, viewer: { kind: "business", canChange: true }, captureOn: true, stream: { lastSequence: 3, lastEventAt: null },
  counts: [], lanes: [], deadLetters: [], endpoints: [],
};
const endpoint = {
  id: "28100000-0000-4000-8000-0000000000e1", url: "https://maker.example.test/e", eventTypes: ["booking.made"], status: "active", disabledReason: null,
  secretHint: "wxyz", createdByKind: "business", agencyName: null, createdAt: "2026-10-15T10:00:00+00:00",
};

describe("Events store: exact RPC names and arguments", () => {
  it("claims lanes", async () => {
    const lane = { ...LANE, attempts: 0, deliveredThrough: 4, events: [event(5, { allowed: true })] };
    const rpc = fake([lane]);
    const lanes = await store.claimLanes({ subscribers: [LANE.subscriber], limit: 50, leaseSeconds: 120, batch: 20 });
    expect(rpc).toHaveBeenCalledWith("app_event_claim_lanes", { p_subscribers: [LANE.subscriber], p_limit: 50, p_lease_seconds: 120, p_batch: 20 });
    expect(lanes[0]!.events[0]!.allowed).toBe(true);
  });

  it("settles lanes", async () => {
    const rpc = fake(true);
    await expect(store.ackLane(LANE, 5)).resolves.toBe(true);
    expect(rpc).toHaveBeenLastCalledWith("app_event_ack", { p_subscriber: LANE.subscriber, p_workspace_id: WS, p_lease_token: TOKEN, p_through: 5 });
    fake("retry");
    const failing = vi.fn(async () => ({ data: "retry", error: null }));
    store.setAppEventsDb({ rpc: failing });
    await expect(store.failLane(LANE, "evt", { error: "boom", permanent: false, maxAttempts: 8, backoffSeconds: 60 })).resolves.toBe("retry");
    expect(failing).toHaveBeenCalledWith("app_event_fail", {
      p_subscriber: LANE.subscriber, p_workspace_id: WS, p_lease_token: TOKEN, p_event_id: "evt", p_error: "boom", p_permanent: false, p_max_attempts: 8, p_backoff_seconds: 60,
    });
    const skipping = fake(9);
    await expect(store.skipLane(LANE)).resolves.toBe(9);
    expect(skipping).toHaveBeenCalledWith("app_event_skip", { p_subscriber: LANE.subscriber, p_workspace_id: WS, p_lease_token: TOKEN });
    const releasing = fake(null);
    await store.releaseLane(LANE);
    expect(releasing).toHaveBeenCalledWith("app_event_release", { p_subscriber: LANE.subscriber, p_workspace_id: WS, p_lease_token: TOKEN });
  });

  it("lists workspaces, cursors, endpoints and replays", async () => {
    let rpc = fake([WS]);
    await expect(store.recentWorkspaces(200)).resolves.toEqual([WS]);
    expect(rpc).toHaveBeenCalledWith("app_event_recent_workspaces", { p_limit: 200 });
    rpc = fake(2);
    await expect(store.ensureCursors([{ subscriber: LANE.subscriber, workspaceId: WS }])).resolves.toBe(2);
    expect(rpc).toHaveBeenCalledWith("app_event_ensure_cursors", { p_pairs: [{ subscriber: LANE.subscriber, workspaceId: WS }] });
    rpc = fake([{ id: endpoint.id, workspaceId: WS, url: endpoint.url, eventTypes: ["booking.made"], secretCiphertext: "enc:v1:x", createdByKind: "agency", agencyWorkspaceId: AGENCY }]);
    await expect(store.activeWebhookEndpoints(200)).resolves.toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith("app_event_active_webhook_endpoints", { p_limit: 200 });
    rpc = fake([]);
    await store.claimReplays(20, 120);
    expect(rpc).toHaveBeenCalledWith("app_event_claim_replays", { p_limit: 20, p_lease_seconds: 120 });
    rpc = fake(null);
    await store.finishReplay("dl", TOKEN, false, "nope");
    expect(rpc).toHaveBeenCalledWith("app_event_finish_replay", { p_dead_letter_id: "dl", p_lease_token: TOKEN, p_ok: false, p_error: "nope" });
    rpc = fake(null);
    await store.disableEndpoint(endpoint.id, "gone");
    expect(rpc).toHaveBeenCalledWith("app_event_disable_endpoint", { p_endpoint_id: endpoint.id, p_reason: "gone" });
    rpc = fake({ events: 2, deadLetters: 0, failures: 1 });
    await expect(store.purgeAppEvents(500)).resolves.toEqual({ events: 2, deadLetters: 0, failures: 1 });
    expect(rpc).toHaveBeenCalledWith("purge_app_events", { p_limit: 500 });
  });

  it("reads health and capture, and sets capture as an operator", async () => {
    let rpc = fake({ captureOn: false, lanesBehind: 0, lanesRetrying: 0, deadLast24h: 0, emitFailuresLast24h: 0, oldestUndeliveredAt: null });
    await expect(store.readAppEventHealth()).resolves.toMatchObject({ captureOn: false });
    expect(rpc).toHaveBeenCalledWith("app_event_health", {});
    rpc = fake({ capture: true, changedAt: null, reason: "Fixture" });
    await store.setCapture("op@example.test", true, "Fixture");
    expect(rpc).toHaveBeenCalledWith("set_app_event_capture", { p_operator_email: "op@example.test", p_capture: true, p_reason: "Fixture" });
    rpc = fake({ capture: false, changedAt: null, reason: null });
    await store.readCapture();
    expect(rpc).toHaveBeenCalledWith("read_app_event_capture", {});
  });

  it("sends identity for people commands", async () => {
    const identity = { p_user_id: USER, p_verified_email: "owner@example.test", p_workspace_id: WS, p_agency_id: AGENCY };
    let rpc = fake(deliveries);
    await store.readDeliveries(ACTOR, { workspaceId: WS, agencyWorkspaceId: AGENCY });
    expect(rpc).toHaveBeenCalledWith("read_app_event_deliveries", identity);
    await store.readDeliveries(ACTOR, { workspaceId: WS });
    expect(rpc).toHaveBeenLastCalledWith("read_app_event_deliveries", { ...identity, p_agency_id: null });
    rpc = fake(deliveries);
    await store.readOperatorDeliveries("op@example.test", WS);
    expect(rpc).toHaveBeenCalledWith("read_operator_app_event_deliveries", { p_operator_email: "op@example.test", p_workspace_id: WS });
    await store.retryDeadLetter(ACTOR, { workspaceId: WS, agencyWorkspaceId: AGENCY }, "dl");
    expect(rpc).toHaveBeenLastCalledWith("retry_app_event_dead_letter", { ...identity, p_dead_letter_id: "dl" });
    await store.operatorRetryDeadLetter("op@example.test", "dl");
    expect(rpc).toHaveBeenLastCalledWith("operator_retry_app_event_dead_letter", { p_operator_email: "op@example.test", p_dead_letter_id: "dl" });
    rpc = fake(endpoint);
    await store.createWebhookEndpoint(ACTOR, { workspaceId: WS, agencyWorkspaceId: AGENCY }, { url: endpoint.url, eventTypes: ["booking.made"], secretCiphertext: "enc:v1:x", secretHint: "wxyz" });
    expect(rpc).toHaveBeenCalledWith("create_app_event_webhook_endpoint", {
      ...identity, p_url: endpoint.url, p_event_types: ["booking.made"], p_secret_ciphertext: "enc:v1:x", p_secret_hint: "wxyz",
    });
    await store.setWebhookEndpoint(ACTOR, { workspaceId: WS, agencyWorkspaceId: AGENCY }, { endpointId: endpoint.id, status: "paused" });
    expect(rpc).toHaveBeenLastCalledWith("set_app_event_webhook_endpoint", {
      ...identity, p_endpoint_id: endpoint.id, p_status: "paused", p_secret_ciphertext: null, p_secret_hint: null,
    });
    await store.setWebhookEndpoint(ACTOR, { workspaceId: WS }, { endpointId: endpoint.id, status: null, secretCiphertext: "enc:v1:new", secretHint: "newn" });
    expect(rpc).toHaveBeenLastCalledWith("set_app_event_webhook_endpoint", {
      ...identity, p_agency_id: null, p_endpoint_id: endpoint.id, p_status: null, p_secret_ciphertext: "enc:v1:new", p_secret_hint: "newn",
    });
  });

  it("reads events for a coding agent", async () => {
    const rpc = fake({ events: [event(1)], nextAfter: 1, lastSequence: 1, captureOn: true });
    const read = await store.agentReadAppEvents({ tokenHash: "h", resource: "https://x.test/mcp", workspaceId: WS, after: 0, types: null, limit: 50 });
    expect(rpc).toHaveBeenCalledWith("agent_read_app_events", { p_token_hash: "h", p_resource: "https://x.test/mcp", p_workspace_id: WS, p_after: 0, p_types: null, p_limit: 50 });
    expect(read.events).toHaveLength(1);
  });
});

describe("Events store: errors", () => {
  const cases: [string, new (...args: never[]) => Error, string | RegExp][] = [
    ["workspace_access_denied", WorkspaceAccessError, "Workspace access denied"],
    ["workspace_release_operator_required", WorkspaceAccessError, "Workspace access denied"],
    ["workspace_release_workspace_invalid", WorkspaceAccessError, "Workspace access denied"],
    ["app_event_area_not_granted", WorkspaceAccessError, "Your agency's access to this client doesn't cover those events."],
    ["app_event_endpoint_limit", WorkspaceConflictError, "This client already has 5 webhooks. Turn one off first."],
    ["app_event_endpoint_disabled", WorkspaceConflictError, "A turned-off webhook can't be turned back on. Add a new one."],
    ["app_event_already_delivered", WorkspaceConflictError, "This event was already delivered."],
    ["app_event_endpoint_invalid", WorkspaceConflictError, "Check the address and the events."],
    ["something unexpected", WorkspaceStoreError, "Events could not be read. Nothing changed."],
  ];
  for (const [code, Type, message] of cases) {
    it(`maps ${code}`, async () => {
      fake(null, { message: `ERROR: ${code}` });
      const failure = await store.readDeliveries(ACTOR, { workspaceId: WS }).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(Type);
      expect((failure as Error).message).toBe(message);
    });
  }

  it("treats a malformed response as unreadable", async () => {
    fake({ workspaceId: "nope" });
    await expect(store.readDeliveries(ACTOR, { workspaceId: WS })).rejects.toBeInstanceOf(WorkspaceStoreError);
    fake([{ ...LANE, attempts: 0, deliveredThrough: 0, events: [event(1)] }]);
    await expect(store.claimLanes({ subscribers: [], limit: 1, leaseSeconds: 10, batch: 1 })).rejects.toBeInstanceOf(WorkspaceStoreError);
  });

  it("never returns a sealed secret in a view", async () => {
    fake({ ...endpoint, secretCiphertext: "enc:v1:leak" });
    await expect(store.setWebhookEndpoint(ACTOR, { workspaceId: WS }, { endpointId: endpoint.id, status: "paused" })).rejects.toBeInstanceOf(WorkspaceStoreError);
  });
});
