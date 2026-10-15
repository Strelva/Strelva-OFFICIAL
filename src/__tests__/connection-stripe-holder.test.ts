import { describe, expect, it, vi } from "vitest";
import type { ProviderAccess } from "@/platform/connections/contracts";
import { prepareStripeConnectionHolder } from "@/platform/connect/connection-holder";
import { z } from "zod";

const workspaceId = "22222222-2222-4222-8222-222222222222";
const actor = { userId: "33333333-3333-4333-8333-333333333333", verifiedEmail: "owner@example.test" };
const access: ProviderAccess = { provider: "stripe", through: { kind: "platform" }, approval: "not_required" };
const storage = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: storage.getDb }));

function workspaceStore(data: unknown, error: unknown = null) {
  const result = { maybeSingle: vi.fn(async () => ({ data, error })) };
  const eq = vi.fn(() => result);
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  storage.getDb.mockReturnValue({ from });
  return { from, select, eq };
}

describe("Stripe holder receipt", () => {
  it.each(["agency", "customer"] as const)("records the stored %s workspace as holder after onboarding", async kind => {
    const record = vi.fn(async (_input: { commandId: string }) => undefined);
    const workspaceKind = vi.fn(async () => kind);
    const save = await prepareStripeConnectionHolder(actor, workspaceId, { access: () => access, workspaceKind, record });
    expect(record).not.toHaveBeenCalled();
    await save(4);
    expect(workspaceKind).toHaveBeenCalledExactlyOnceWith(workspaceId);
    expect(record).toHaveBeenCalledExactlyOnceWith({
      ref: `stripe:${workspaceId}:4`, provider: "stripe", workspaceId,
      accountHolder: { kind: kind === "agency" ? "agency" : "business", workspaceId },
      accessThrough: { kind: "platform" }, actor, commandId: expect.any(String),
    });
    expect(z.string().uuid().safeParse(record.mock.calls[0]?.[0]?.commandId).success).toBe(true);
  });

  it.each([
    { ...access, approval: "none" as const }, { ...access, approval: "pending" as const },
    { ...access, through: { kind: "unknown" as const } },
    { ...access, through: { kind: "agency" as const, workspaceId } },
  ])("refuses unavailable access before resolving holder identity: %j", async denied => {
    const record = vi.fn();
    const workspaceKind = vi.fn(async () => "agency" as const);
    await expect(prepareStripeConnectionHolder(actor, workspaceId, { access: () => denied, workspaceKind, record })).rejects.toThrow();
    expect(workspaceKind).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it("fails closed if workspace kind cannot be confirmed", async () => {
    const record = vi.fn();
    await expect(prepareStripeConnectionHolder(actor, workspaceId, { access: () => access, workspaceKind: async () => { throw new Error("offline"); }, record })).rejects.toThrow("offline");
    expect(record).not.toHaveBeenCalled();
  });

  it("keeps receipt failure visible so onboarding cannot claim complete attribution", async () => {
    const save = await prepareStripeConnectionHolder(actor, workspaceId, { access: () => access, workspaceKind: async () => "agency", record: async () => { throw new Error("receipt unavailable"); } });
    await expect(save(2)).rejects.toThrow("receipt unavailable");
    await expect(save(-1)).rejects.toThrow();
  });

  it("derives agency ownership from the exact stored workspace, with no caller kind", async () => {
    const store = workspaceStore({ id: workspaceId, kind: "agency" });
    const record = vi.fn(async (_input: { commandId: string }) => undefined);
    const save = await prepareStripeConnectionHolder(actor, workspaceId, { access: () => access, record });
    await save(5);
    expect(store.from).toHaveBeenCalledExactlyOnceWith("workspaces");
    expect(store.select).toHaveBeenCalledExactlyOnceWith("id, kind");
    expect(store.eq).toHaveBeenCalledExactlyOnceWith("id", workspaceId);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ accountHolder: { kind: "agency", workspaceId } }));
  });

  it.each([
    [null, null], [{ id: workspaceId, kind: "personal" }, null],
    [{ id: actor.userId, kind: "agency" }, null], [{ id: workspaceId, kind: "customer" }, { message: "offline" }],
  ])("refuses missing, personal, cross-workspace or failed identity reads: %j", async (data, error) => {
    workspaceStore(data, error);
    const record = vi.fn();
    await expect(prepareStripeConnectionHolder(actor, workspaceId, { access: () => access, record })).rejects.toThrow(/ownership could not be confirmed/);
    expect(record).not.toHaveBeenCalled();
  });
});
