import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAccessError, WorkspaceStoreError } from "@/platform/workspaces/types";
import { claimAgencyDecision, readAgencyDecisions, reviewAgencyDecisions } from "@/experience/workspace/agency/decision-server";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), review: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/experience/workspace/needs-you-server", () => ({ needsYouService: () => ({ review: mocks.review }) }));
const WS = "a0000000-0000-4000-8000-000000000001";
const ACTOR = { userId: "b0000000-0000-4000-8000-000000000001", verifiedEmail: " Staff@Agency.Example.Test " };
const item = {
  id: "d0000000-0000-4000-8000-000000000001", workspaceId: WS, systemId: null, kind: "copy.routine", route: "owner_decides",
  title: "Website update", detail: "Hours", approveEffect: "Hours go live.", notYetEffect: "Nothing changes.",
  sourceLifecycle: "tenant_event", sourceId: "t:e", revisionHash: "a".repeat(64), urgent: false, signInRequired: false, adminMayDecide: false, openHref: null,
  state: "open", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null, deliveryState: "suppressed", operatorNote: null,
  actor: { kind: "agency", displayName: "Outside Agency" }, openedAt: "2026-10-06T11:00:00Z", expiresAt: "2026-10-20T11:00:00Z", reminded1At: null, reminded2At: null, deliveries: [],
};
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: [item], error: null }); mocks.review.mockResolvedValue(undefined); });

describe("agency scoped decision projection", () => {
  it("uses the scoped reader with the current identity, preserving actor and exact revision", async () => {
    expect(await readAgencyDecisions(ACTOR, WS)).toEqual([item]);
    expect(mocks.rpc).toHaveBeenCalledWith("list_agency_owner_decisions", { p_workspace_id: WS, p_user_id: ACTOR.userId, p_verified_email: "staff@agency.example.test", p_agency_workspace_id: null });
  });
  it("binds both reads and claims to the selected agency even when staff belong to several", async () => {
    const agency = "c0000000-0000-4000-8000-000000000001";
    await readAgencyDecisions(ACTOR, WS, agency);
    expect(mocks.rpc).toHaveBeenCalledWith("list_agency_owner_decisions", expect.objectContaining({ p_agency_workspace_id: agency }));
    mocks.rpc.mockResolvedValueOnce({ data: { status: "claimed", item: { ...item, state: "approved" } }, error: null });
    const input = { workspaceId: WS, itemId: item.id, revision: item.revisionHash, decision: "approve" as const, by: "agency" as const, actor: ACTOR };
    expect(await claimAgencyDecision(input, agency)).toMatchObject({ status: "claimed" });
    expect(mocks.rpc).toHaveBeenLastCalledWith("claim_scoped_agency_owner_decision", {
      p_workspace_id: WS, p_decision_id: item.id, p_revision_hash: item.revisionHash, p_decision: "approve",
      p_user_id: ACTOR.userId, p_verified_email: "staff@agency.example.test", p_agency_workspace_id: agency,
    });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "owner_decision_owner_only" } });
    await expect(claimAgencyDecision(input, "c0000000-0000-4000-8000-000000000002")).rejects.toMatchObject({ code: "owner_decision_owner_only" });
  });
  it("does not turn storage failures or revoked authority into a complete empty read", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "owner_decision_access_denied" } });
    await expect(readAgencyDecisions(ACTOR, WS)).rejects.toBeInstanceOf(WorkspaceAccessError);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "database unavailable" } });
    await expect(readAgencyDecisions(ACTOR, WS)).rejects.toBeInstanceOf(WorkspaceStoreError);
  });
  it.each([{ workspaceId: "a0000000-0000-4000-8000-000000000002" }, { route: "strelva_reviews" }, { state: "approved" }, { revisionHash: "bad" }])("fails closed on malformed or unscoped data: %o", async patch => {
    mocks.rpc.mockResolvedValue({ data: [{ ...item, ...patch }], error: null });
    await expect(readAgencyDecisions(ACTOR, WS)).rejects.toBeInstanceOf(WorkspaceStoreError);
  });
  it("uses the source review without synchronizing unrelated sources and preserves an incomplete review", async () => {
    mocks.review.mockResolvedValueOnce(["All exact values"]).mockResolvedValueOnce(null);
    expect(await reviewAgencyDecisions(ACTOR, WS)).toMatchObject({ items: [{ review: ["All exact values"], revisionHash: item.revisionHash }], complete: true });
    expect(mocks.review).toHaveBeenCalledWith(item, { workspaceId: WS, actor: ACTOR });
    expect(await reviewAgencyDecisions(ACTOR, WS)).toMatchObject({ items: [{ review: null }], complete: false });
  });
});
