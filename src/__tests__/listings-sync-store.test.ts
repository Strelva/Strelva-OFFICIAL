import { afterEach, describe, expect, it, vi } from "vitest";
import { listingsSyncStore, setListingsSyncDb } from "@/products/listings-sync/store";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";

const WS = "7f000000-0000-4000-8000-000000000010";
const ID = "7f000000-0000-4000-8000-0000000000a1";
const TOKEN = "7f000000-0000-4000-8000-0000000000a2";
const fakeDb = (data: unknown, error: { message?: string } | null = null) => {
  const rpc = vi.fn(async () => ({ data, error }));
  setListingsSyncDb({ rpc });
  return rpc;
};
afterEach(() => setListingsSyncDb(null));

describe("listings sync store", () => {
  it("sends the argument names the SQL expects", async () => {
    let rpc = fakeDb(ID);
    await listingsSyncStore.queue(WS, "check_now", "u1");
    expect(rpc).toHaveBeenCalledWith("listing_sync_queue_check", { p_workspace_id: WS, p_trigger: "check_now", p_requested_by: "u1" });

    rpc = fakeDb([{ id: ID, workspace_id: WS, record_revision: "3", trigger: "sweep", claim_token: TOKEN }]);
    expect(await listingsSyncStore.claim(5, ID)).toEqual([{ id: ID, workspaceId: WS, recordRevision: 3, trigger: "sweep", claimToken: TOKEN }]);
    expect(rpc).toHaveBeenCalledWith("listing_sync_claim_checks", { p_limit: 5, p_check_id: ID });

    rpc = fakeDb({ revision: 3, facts: {}, services: [] });
    await listingsSyncStore.confirmedFacts(WS);
    expect(rpc).toHaveBeenCalledWith("listing_sync_confirmed_facts", { p_workspace_id: WS });

    rpc = fakeDb({ tenants: [], connectedSites: [], agencies: [] });
    await listingsSyncStore.targets(WS);
    expect(rpc).toHaveBeenCalledWith("listing_sync_targets", { p_workspace_id: WS });

    rpc = fakeDb([]);
    await listingsSyncStore.saveFixes(ID, TOKEN, []);
    expect(rpc).toHaveBeenCalledWith("listing_sync_save_fixes", { p_check_id: ID, p_claim_token: TOKEN, p_fixes: [] });

    rpc = fakeDb({ checkId: ID, release: { number: 1, recordedAt: "2026-10-15T00:00:00Z" } });
    expect((await listingsSyncStore.finish(ID, TOKEN, "done", [], 0, 2, null)).release?.number).toBe(1);
    expect(rpc).toHaveBeenCalledWith("listing_sync_finish_check", { p_check_id: ID, p_claim_token: TOKEN, p_status: "done", p_readings: [], p_differs: 0, p_compared: 2, p_error: null });

    rpc = fakeDb(2);
    await listingsSyncStore.declinePlan(WS, 4, "u1");
    expect(rpc).toHaveBeenCalledWith("listing_sync_decline_plan", { p_workspace_id: WS, p_record_revision: 4, p_decided_by: "u1" });

    rpc = fakeDb([WS]);
    expect(await listingsSyncStore.due(10)).toEqual([WS]);
    expect(rpc).toHaveBeenCalledWith("listing_sync_due_workspaces", { p_limit: 10 });

    rpc = fakeDb(null);
    expect(await listingsSyncStore.openPlan(WS)).toBeNull();
    expect(rpc).toHaveBeenCalledWith("listing_sync_open_plan", { p_workspace_id: WS });
  });

  it("maps a fix row and the set_fix arguments", async () => {
    const rpc = fakeDb({ id: ID, surface_key: "google:loc1", fact_key: "hours", kind: "google_hours", proposed: {}, status: "applied",
      outcome_ref: "r1", reason: null, record_revision: 3 });
    const fix = await listingsSyncStore.setFix(WS, ID, ["proposed"], "applied", { outcomeRef: "r1" });
    expect(fix).toMatchObject({ surfaceKey: "google:loc1", factKey: "hours", outcomeRef: "r1", recordRevision: 3 });
    expect(rpc).toHaveBeenCalledWith("listing_sync_set_fix", {
      p_fix_id: ID, p_workspace_id: WS, p_from: ["proposed"], p_to: "applied", p_outcome_ref: "r1", p_reason: null, p_decided_by: null,
    });
  });

  it("sends the actor to read_listing_sync", async () => {
    const rpc = fakeDb({ access: "owner", latest: null, lastDone: null, fixes: [], release: null, releaseCount: 0 });
    await listingsSyncStore.read({ userId: "u1", verifiedEmail: "o@example.test" }, WS);
    expect(rpc).toHaveBeenCalledWith("read_listing_sync", { p_workspace_id: WS, p_user_id: "u1", p_verified_email: "o@example.test" });
  });

  it("maps errors", async () => {
    fakeDb(null, { message: "business_record_access_denied" });
    await expect(listingsSyncStore.queue(WS, "sweep")).rejects.toBeInstanceOf(WorkspaceAccessError);
    fakeDb(null, { message: "listing_sync_fix_moved" });
    await expect(listingsSyncStore.queue(WS, "sweep")).rejects.toThrow(WorkspaceConflictError);
    fakeDb(null, { message: "listing_sync_claim_lost" });
    await expect(listingsSyncStore.queue(WS, "sweep")).rejects.toThrow("These details changed while Strelva was checking. Check again.");
    fakeDb(null, { message: "boom" });
    await expect(listingsSyncStore.queue(WS, "sweep")).rejects.toThrow(new WorkspaceStoreError("Listings couldn't be read right now. Nothing changed."));
  });

  it("rejects a malformed read payload", async () => {
    fakeDb({ access: "stranger", latest: null });
    await expect(listingsSyncStore.read({ userId: "u1", verifiedEmail: "o@example.test" }, WS)).rejects.toBeInstanceOf(WorkspaceStoreError);
  });
});
