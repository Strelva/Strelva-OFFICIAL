import { describe, expect, it, vi } from "vitest";
import type { ProviderAccess } from "@/platform/connections/contracts";
import { createStripeConnectionSource, stripeConnectionRef } from "@/platform/connect/connection-source";

const workspaceId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const access: ProviderAccess = { provider: "stripe", through: { kind: "platform" }, approval: "not_required" };
const account = { workspace_id: workspaceId, stripe_account_id: "acct_Fictional", configurations: ["merchant"], profile_version: "fictional-v1", state: "ready", generation: 2, capabilities: {}, requirements: {} };
const database = (data: unknown = account, error: { message: string } | null = null) => ({ rpc: vi.fn(async () => ({ data, error })) });

describe("Stripe Connections source", () => {
  it("reads only the shared agency/business account and leaves legacy holders unknown", async () => {
    const db = database({ ...account, capabilities: { private: "must not appear" }, requirements: { personal: "must not appear" } });
    const rows = await createStripeConnectionSource({ enabled: () => true, db }).list({ workspaceId, access });
    expect(rows).toEqual([{
      ref: stripeConnectionRef(workspaceId, 2), provider: "stripe", workspaceId, accountLabel: "Stripe account",
      accountHolder: { kind: "unknown" }, accessThrough: { kind: "unknown" }, state: "connected", unavailableReason: null,
      connectedAt: null, systemIds: [],
    }]);
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("read_connected_account", { p_workspace_id: workspaceId });
    expect(JSON.stringify(rows)).not.toMatch(/acct_Fictional|must not appear|capabilities|requirements/);
  });

  it("keeps the release off without reading storage", async () => {
    const db = database();
    expect(await createStripeConnectionSource({ enabled: () => false, db }).list({ workspaceId, access })).toEqual([]);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("has no row when no account was connected", async () => {
    expect(await createStripeConnectionSource({ enabled: () => true, db: database(null) }).list({ workspaceId, access })).toEqual([]);
  });

  it.each([
    [{ ...account, state: "pending" }, "stale"], [{ ...account, state: "restricted" }, "stale"],
    [{ ...account, state: "disconnected" }, "disconnected"], [{ ...account, stripe_account_id: null }, "stale"],
    [{ ...account, configurations: [] }, "stale"],
  ])("reports saved account readiness honestly: %j", async (data, state) => {
    const [row] = await createStripeConnectionSource({ enabled: () => true, db: database(data) }).list({ workspaceId, access });
    expect(row?.state).toBe(state);
  });

  it.each(["none", "pending"] as const)("holds provider access when approval is %s", async approval => {
    const [row] = await createStripeConnectionSource({ enabled: () => true, db: database() })
      .list({ workspaceId, access: { ...access, approval } });
    expect(row?.state).toBe("unavailable");
    expect(row?.unavailableReason).toBe(approval === "pending" ? "approval_pending" : "not_configured");
  });

  it("never allows an agency project for Stripe", async () => {
    const [row] = await createStripeConnectionSource({ enabled: () => true, db: database() })
      .list({ workspaceId, access: { ...access, through: { kind: "agency", workspaceId: otherId } } });
    expect(row?.state).toBe("unavailable");
  });

  it.each([{}, { ...account, workspace_id: otherId }])("raises malformed/cross-workspace reads to the source-error boundary", async data => {
    await expect(createStripeConnectionSource({ enabled: () => true, db: database(data) }).list({ workspaceId, access })).rejects.toThrow();
  });

  it("does not turn storage errors into disconnected-account claims", async () => {
    await expect(createStripeConnectionSource({ enabled: () => true, db: database(null, { message: "offline" }) }).list({ workspaceId, access })).rejects.toThrow();
    await expect(createStripeConnectionSource({ enabled: () => true, db: null }).list({ workspaceId, access })).rejects.toThrow();
  });

  it("changes the reference on reconnect so old holder receipts cannot carry over", () => {
    expect(stripeConnectionRef(workspaceId, 2)).not.toBe(stripeConnectionRef(workspaceId, 3));
  });
});
