import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), tenantWorkspace: vi.fn(), events: [] as unknown[], withdraw: vi.fn() }));
vi.mock("@/platform/release-flags/store", () => ({ releaseWorkspaceForTenant: m.tenantWorkspace }));
vi.mock("@/platform/infra/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const events = vi.hoisted(() => ({ store: new Map<string, { id: string; status: string; metadata: Record<string, unknown> }>() }));
vi.mock("@/lib/events", () => ({
  getEventsRaw: async () => [...events.store.values()].filter(event => event.status === "pending"),
  updateEvent: async (id: string, updater: (event: never) => { metadata: Record<string, unknown> }) => {
    const current = events.store.get(id)!;
    const next = { ...current, ...updater(current as never) };
    events.store.set(id, next);
    return { event: next, changed: true };
  },
  addEvent: vi.fn(),
}));
vi.mock("@/lib/event-actions", () => ({ AUTO_REPLY_ACTOR: "auto", resolveEventAction: vi.fn() }));
vi.mock("@/lib/tenants", () => ({ getAllTenants: async () => [] }));
vi.mock("@/lib/reviews/reply-voice", () => ({ getReplyVoice: async () => ({ mode: "auto" }) }));
vi.mock("@/lib/reviews", () => ({ getReviews: async () => [] }));
vi.mock("@/lib/review-replies", () => ({ draftReviewReplyWithProvenance: vi.fn(), storeRecentReply: vi.fn(), isReviewReplyDeclined: () => false }));
vi.mock("@/platform/infra/google-review-content", () => ({ googleReviewContentLive: () => true }));
vi.mock("@/lib/workspace-ports", () => ({ workspacePorts: {} }));

import { withdrawPendingAutoPosts } from "@/lib/reviews/auto-reply";
import { readAgencyAiControls, readOperatorAiControls, readTenantAiControls, setAgencyAiControls, setAiControlsDb, setOperatorAiControls } from "@/platform/ai-controls/service";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";

const AGENCY = "26100000-0000-4000-8000-000000000020";
const WS = "26100000-0000-4000-8000-000000000010";
const actor = { userId: "26100000-0000-4000-8000-000000000003", verifiedEmail: "agency@example.test" };
const controls = { paused: false, monthlyCapCents: 500, reviewAutoPost: "held", revision: 1, setBy: { kind: "agency", agencyName: "North Studio" }, changedAt: "2026-10-15T10:00:00Z" };
const budget = { spentUsd: "0.5", reservedUsd: "0", since: "2026-10-01T00:00:00Z", resetsAt: "2026-11-01T00:00:00Z", capCents: null, subscribed: true, unknownCostCalls: 0, controls };
const client = { workspaceId: WS, name: "Harbor Dental", budget, linkedTenantIds: ["harbor"] };
const view = { agencyWorkspaceId: AGENCY, canChange: true, clients: [client] };
const command = { agencyWorkspaceId: AGENCY, workspaceId: WS, paused: false, monthlyCapCents: 500, reviewAutoPost: "held" as const, expectedRevision: 0, reason: "Owner asked for review" };

beforeEach(() => {
  vi.clearAllMocks();
  events.store.clear();
  vi.unstubAllEnvs();
  m.rpc.mockResolvedValue({ data: view, error: null });
  setAiControlsDb({ rpc: m.rpc });
  m.tenantWorkspace.mockResolvedValue(WS);
});

describe("agency usage controls service", () => {
  it("reads through the agency RPC with the session actor and scope", async () => {
    await expect(readAgencyAiControls(actor, { agencyWorkspaceId: AGENCY, workspaceId: WS })).resolves.toEqual(view);
    expect(m.rpc).toHaveBeenCalledWith("read_agency_ai_controls", { p_agency_id: AGENCY, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_workspace_id: WS });
  });

  it("sets through the agency RPC with the exact command", async () => {
    await setAgencyAiControls(actor, command);
    expect(m.rpc).toHaveBeenCalledWith("set_agency_ai_controls", {
      p_agency_id: AGENCY, p_workspace_id: WS, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
      p_paused: false, p_monthly_cap_cents: 500, p_review_auto_post: "held", p_expected_revision: 0, p_reason: command.reason,
    });
  });

  it("maps database refusals to the workspace errors", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "workspace_access_denied" } });
    await expect(readAgencyAiControls(actor, { agencyWorkspaceId: AGENCY })).rejects.toBeInstanceOf(WorkspaceAccessError);
    m.rpc.mockResolvedValue({ data: null, error: { message: "ai_controls_revision_conflict" } });
    await expect(setAgencyAiControls(actor, command)).rejects.toThrow(WorkspaceConflictError);
    m.rpc.mockResolvedValue({ data: null, error: { message: "business_ai_budget_unavailable" } });
    await expect(readAgencyAiControls(actor, { agencyWorkspaceId: AGENCY })).rejects.toBeInstanceOf(WorkspaceStoreError);
    m.rpc.mockResolvedValue({ data: { nope: true }, error: null });
    await expect(readAgencyAiControls(actor, { agencyWorkspaceId: AGENCY })).rejects.toBeInstanceOf(WorkspaceStoreError);
  });

  it("calls the operator RPCs with the operator email", async () => {
    const operatorView = { ...client, history: [] };
    m.rpc.mockResolvedValue({ data: operatorView, error: null });
    await readOperatorAiControls("op@example.test", WS);
    expect(m.rpc).toHaveBeenLastCalledWith("read_operator_ai_controls", { p_operator_email: "op@example.test", p_workspace_id: WS });
    const { agencyWorkspaceId: _agency, ...operatorCommand } = command;
    await setOperatorAiControls("op@example.test", operatorCommand);
    expect(m.rpc).toHaveBeenLastCalledWith("set_operator_ai_controls", {
      p_operator_email: "op@example.test", p_workspace_id: WS, p_paused: false, p_monthly_cap_cents: 500, p_review_auto_post: "held", p_expected_revision: 0, p_reason: command.reason,
    });
  });

  it("withdraws pending auto-post timers for each linked tenant on a hold, and a failure does not fail the set", async () => {
    events.store.set("e1", { id: "e1", status: "pending", metadata: { kind: "review_reply_draft", autoPostAt: "2026-10-16T00:00:00Z", replyGeneration: "model" } });
    await expect(setAgencyAiControls(actor, command)).resolves.toEqual(view);
    expect(events.store.get("e1")!.metadata.autoPostAt).toBeUndefined();
    expect(events.store.get("e1")!.metadata).toMatchObject({ autoPostWithdrawnBy: "agency" });
    // A broken store does not fail the control change.
    m.rpc.mockResolvedValue({ data: { ...view, clients: [{ ...client, linkedTenantIds: ["a", "b"] }] }, error: null });
    const failing = vi.spyOn(Map.prototype, "values").mockImplementation(() => { throw new Error("store down"); });
    await expect(setAgencyAiControls(actor, command)).resolves.toBeTruthy();
    failing.mockRestore();
  });
});

describe("withdrawPendingAutoPosts", () => {
  it("strips autoPostAt only from pending model drafts and leaves approve-mode drafts alone", async () => {
    events.store.set("a", { id: "a", status: "pending", metadata: { kind: "review_reply_draft", autoPostAt: "2026-10-16T00:00:00Z" } });
    events.store.set("b", { id: "b", status: "pending", metadata: { kind: "review_reply_draft" } });
    events.store.set("c", { id: "c", status: "pending", metadata: { kind: "other", autoPostAt: "2026-10-16T00:00:00Z" } });
    const now = Date.parse("2026-10-15T12:00:00Z");
    await expect(withdrawPendingAutoPosts("harbor", { by: "operator" }, now)).resolves.toBe(1);
    expect(events.store.get("a")!.metadata).toEqual({ kind: "review_reply_draft", autoPostWithdrawnAt: "2026-10-15T12:00:00.000Z", autoPostWithdrawnBy: "operator" });
    expect(events.store.get("b")!.metadata).toEqual({ kind: "review_reply_draft" });
    expect(events.store.get("c")!.metadata.autoPostAt).toBe("2026-10-16T00:00:00Z");
  });
});

describe("tenant controls read", () => {
  it("is null with the flag off and for an unlinked tenant", async () => {
    await expect(readTenantAiControls("harbor")).resolves.toBeNull();
    vi.stubEnv("STRELVA_AI_CONTROLS_RELEASE", "1");
    m.tenantWorkspace.mockResolvedValue(null);
    await expect(readTenantAiControls("harbor")).resolves.toBeNull();
  });

  it("returns the state, and fails closed when the read fails", async () => {
    vi.stubEnv("STRELVA_AI_CONTROLS_RELEASE", "1");
    m.rpc.mockResolvedValue({ data: controls, error: null });
    await expect(readTenantAiControls("harbor")).resolves.toEqual(controls);
    expect(m.rpc).toHaveBeenLastCalledWith("business_ai_controls_state", { p_workspace_id: WS });
    m.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(readTenantAiControls("harbor")).resolves.toEqual({ unavailable: true });
  });
});
