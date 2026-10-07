import { describe, expect, it, vi } from "vitest";
import {
  BusinessFactsChangedError, businessFactsAdapter, businessFactsItem, createBusinessFactReviewStore, describeBusinessFactChange, type BusinessFactReview,
} from "@/platform/needs-you/sources/business-facts";
import { SOURCE_LIFECYCLES } from "@/platform/needs-you/contracts";
import { createNeedsYouService } from "@/platform/needs-you/service";
import { needsYouMemoryStore } from "./support/needs-you-memory";

const WS = "5090aaaa-0000-4000-8000-000000000001";
const OWNER = { userId: "5090aaaa-0000-4000-8000-000000000002", verifiedEmail: "owner@example.test" };
const ADMIN = { userId: "5090aaaa-0000-4000-8000-000000000003", verifiedEmail: "admin@example.test" };
const DECISION = "5090aaaa-0000-4000-8000-000000000004";
const now = Date.parse("2026-10-11T12:00:00Z");
const review = (overrides: Partial<BusinessFactReview> = {}): BusinessFactReview => ({
  workspaceId: WS, recordRevision: 7, revisionHash: "c".repeat(64),
  changes: [
    { entity: "fact", id: "phone", before: "716-555-0101", after: "716-555-0199", source: "operator" },
    { entity: "fact", id: "display_name", before: "Owner Named Co", after: null, source: null },
    { entity: "service", id: "5090aaaa-0000-4000-8000-000000000010", before: null, after: { name: "Agency cleaning", priceText: "$99", active: true }, source: "agency" },
  ],
  ...overrides,
});
function harness(read = vi.fn(async () => review() as BusinessFactReview | null)) {
  const confirm = vi.fn(async (_ws: string, decisionId: string) => ({ decisionId, changeCount: 3, replayed: false }));
  const memory = needsYouMemoryStore({ clock: { now }, roles: { [OWNER.userId]: "owner", [ADMIN.userId]: "admin" } });
  const service = createNeedsYouService({ store: memory.store, adapters: [businessFactsAdapter({ read, confirm })], sendEmail: vi.fn(), appOrigin: "https://app.example.test", now: () => now });
  return { read, confirm, service };
}

describe("provider and operator business facts wait for the owner (#509)", () => {
  it("is one owner-only item per business, with a kind no Strelva policy can loosen", () => {
    expect(SOURCE_LIFECYCLES).toContain("business_facts");
    expect(businessFactsItem(review())).toMatchObject({
      kind: "fact.inferred", route: "owner_decides", adminMayDecide: false, sourceLifecycle: "business_facts", sourceId: WS, revisionHash: "c".repeat(64),
      openHref: `/workspace/business-details?workspaceId=${WS}`,
      detail: 'Phone: 716-555-0101 → 716-555-0199; Business name: removed; Service "Agency cleaning": added ($99)',
    });
    expect(describeBusinessFactChange({ entity: "fact", id: "owner_recipient", before: null, after: { email: "new@example.test" }, source: "operator" })).toBe("Who gets Strelva's emails: new@example.test");
    expect(describeBusinessFactChange({ entity: "service", id: "s", before: { name: "Old", active: true }, after: { name: "Old", active: false }, source: "agency" })).toBe('Service "Old": removed');
  });

  it("publishes only on the owner's signed link, with no account or session", async () => {
    const { confirm, service } = harness();
    const item = (await service.list(OWNER, WS)).items[0]!;
    const result = await service.decide({ workspaceId: WS, itemId: item.id, revision: item.revisionHash, decision: "approve", by: { kind: "owner_link", recipient: "owner@example.test" } });
    expect(result.status).toBe("done");
    expect(result.item?.receiptRef).toBe(`business_facts:${item.id}`);
    expect(confirm).toHaveBeenCalledExactlyOnceWith(WS, item.id, "c".repeat(64));
  });

  it("an admin never decides, and Not yet or a lapse publishes nothing", async () => {
    const { confirm, service } = harness();
    const item = (await service.list(OWNER, WS)).items[0]!;
    expect((await service.decide({ workspaceId: WS, itemId: item.id, revision: item.revisionHash, decision: "approve", by: { kind: "session", actor: ADMIN } })).status).toBe("forbidden");
    expect((await service.decide({ workspaceId: WS, itemId: item.id, revision: item.revisionHash, decision: "not_yet", by: { kind: "session", actor: OWNER } })).status).toBe("done");
    expect(confirm).not.toHaveBeenCalled();
    const adapter = businessFactsAdapter({ read: async () => review(), confirm });
    expect(await adapter.resolve({ workspaceId: WS }, item, "approve", { kind: "expiry" })).toEqual({ outcome: "done", reason: "Expired, nothing changed" });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("a newer edit supersedes the item before anything is claimed", async () => {
    const read = vi.fn(async () => review() as BusinessFactReview | null);
    const { confirm, service } = harness(read);
    const item = (await service.list(OWNER, WS)).items[0]!;
    read.mockResolvedValue(review({ revisionHash: "d".repeat(64), recordRevision: 8 }));
    expect((await service.decide({ workspaceId: WS, itemId: item.id, revision: item.revisionHash, decision: "approve", by: { kind: "owner_link", recipient: "owner@example.test" } })).status).toBe("changed");
    read.mockResolvedValue(null);
    expect((await service.list(OWNER, WS)).items.filter(row => row.state === "open")).toHaveLength(0);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("an SQL refusal is a failed outcome, never a publish", async () => {
    const confirm = vi.fn().mockRejectedValueOnce(new BusinessFactsChangedError()).mockRejectedValueOnce(new Error("owner approval required"));
    const adapter = businessFactsAdapter({ read: async () => review(), confirm });
    const item = { id: DECISION, revisionHash: "c".repeat(64) } as Parameters<typeof adapter.resolve>[1];
    expect(await adapter.resolve({ workspaceId: WS }, item, "approve", { kind: "owner_link", recipient: "owner@example.test", actor: null })).toEqual({ outcome: "failed", reason: "source_changed" });
    expect(await adapter.resolve({ workspaceId: WS }, item, "approve", { kind: "owner_link", recipient: "owner@example.test", actor: null })).toEqual({ outcome: "failed", reason: "business_facts_not_confirmed" });
    expect(await adapter.currentRevision({ workspaceId: WS }, "5090aaaa-0000-4000-8000-0000000000ff")).toBeNull();
  });

  it("the store calls only the service-role RPCs and maps refusals", async () => {
    const rpc = vi.fn(async () => ({ data: review() as unknown, error: null as { message: string } | null }));
    const store = createBusinessFactReviewStore({ rpc });
    expect(await store.read(WS)).toEqual(review());
    expect(rpc).toHaveBeenCalledWith("read_business_fact_review", { p_workspace_id: WS });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await store.read(WS)).toBeNull();
    rpc.mockResolvedValueOnce({ data: { decisionId: DECISION, changeCount: 3, replayed: false, workspaceId: WS }, error: null });
    expect(await store.confirm(WS, DECISION, "c".repeat(64))).toMatchObject({ decisionId: DECISION, replayed: false });
    expect(rpc).toHaveBeenLastCalledWith("confirm_business_facts", { p_workspace_id: WS, p_decision_id: DECISION, p_revision_hash: "c".repeat(64) });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "business_facts_changed" } });
    await expect(store.confirm(WS, DECISION, "c".repeat(64))).rejects.toBeInstanceOf(BusinessFactsChangedError);
    rpc.mockResolvedValueOnce({ data: null, error: { message: "business_facts_owner_approval_required" } });
    await expect(store.confirm(WS, DECISION, "c".repeat(64))).rejects.toThrow("Only the owner's decision");
    rpc.mockResolvedValueOnce({ data: { ...review(), changes: [] }, error: null });
    await expect(store.read(WS)).rejects.toThrow();
  });
});
