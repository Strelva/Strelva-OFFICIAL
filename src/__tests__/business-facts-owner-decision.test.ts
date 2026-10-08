import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BusinessFactsChangedError, businessFactChangeLines, businessFactReviewLines, businessFactsAdapter, businessFactsDetail, businessFactsItem,
  createBusinessFactReviewStore, type BusinessFactReview, type BusinessFactsReceipt,
} from "@/platform/needs-you/sources/business-facts";
import type { DeliveryRow } from "@/platform/needs-you/repository";
import { createConfirmedNativeFactsEffect, type NativeFactsPreparation } from "@/app/workspace/business-details/native-website-facts";
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
const receipt = (decisionId: string, over: Partial<BusinessFactsReceipt> = {}): BusinessFactsReceipt => ({
  decisionId, workspaceId: WS, recordRevision: 7, changeCount: 3, factKeys: ["display_name", "phone"], replayed: false, ...over,
});
function harness(read = vi.fn(async () => review() as BusinessFactReview | null)) {
  const confirm = vi.fn(async (_ws: string, decisionId: string) => receipt(decisionId));
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
      detail: 'Phone: 716-555-0101 → 716-555-0199; Business name: removed (was Owner Named Co); Service "Agency cleaning" added; Service "Agency cleaning" Price: $99; Service "Agency cleaning" Shown on your site: yes',
    });
  });

  it("shows every value it approves: service prices and text, structured facts, owner recipients (P1)", () => {
    expect(businessFactChangeLines({ entity: "service", id: "s", source: "agency",
      before: { name: "Cleaning", description: "Weekly clean.", durationMinutes: 60, priceText: "$99", active: true, position: 0 },
      after: { name: "Cleaning", description: "Weekly deep clean.", durationMinutes: 90, priceText: "$999", active: true, position: 0 } })).toEqual([
      'Service "Cleaning" Description: Weekly clean. → Weekly deep clean.',
      'Service "Cleaning" Length: 60 minutes → 90 minutes',
      'Service "Cleaning" Price: $99 → $999',
    ]);
    expect(businessFactChangeLines({ entity: "service", id: "s", source: "agency", before: { name: "Old", active: true }, after: { name: "Old", active: false } }))
      .toEqual(['Service "Old" Shown on your site: yes → no']);
    expect(businessFactChangeLines({ entity: "service", id: "s", source: "agency", before: { name: "Gone", priceText: "$5", active: true }, after: null }))
      .toEqual(['Service "Gone" removed (was Price: $5; Shown on your site: yes)']);
    expect(businessFactChangeLines({ entity: "fact", id: "hours", source: "operator", before: null, after: {
      timezone: "America/New_York", weekly: [{ day: 1, opens: "09:00", closes: "12:00" }, { day: 1, opens: "13:00", closes: "17:00" }],
      overrides: [{ date: "2026-12-25", closed: true, label: "Christmas" }, { date: "2026-12-31", closed: false, opens: "09:00", closes: "13:00" }] } })).toEqual([
      "Hours: Monday 09:00–12:00, 13:00–17:00; Tuesday closed; Wednesday closed; Thursday closed; Friday closed; Saturday closed; Sunday closed; 2026-12-25 (Christmas) closed; 2026-12-31 09:00–13:00; time zone America/New_York (new)",
    ]);
    expect(businessFactChangeLines({ entity: "fact", id: "address", source: "agency", before: { line1: "1 Main St", city: "Buffalo" },
      after: { line1: "2 Main St", line2: "Suite 4", city: "Buffalo", region: "NY", postalCode: "14201", country: "US" } }))
      .toEqual(["Address: 1 Main St, Buffalo → 2 Main St, Suite 4, Buffalo, NY, 14201, US"]);
    expect(businessFactChangeLines({ entity: "fact", id: "links", source: "agency", before: null,
      after: [{ kind: "instagram", url: "https://instagram.example.test/x" }, { kind: "other", label: "Menu", url: "https://menu.example.test" }] }))
      .toEqual(['Links: instagram: https://instagram.example.test/x; other "Menu": https://menu.example.test (new)']);
    expect(businessFactChangeLines({ entity: "fact", id: "owner_recipient", before: null, after: { email: "new@example.test", name: "New" }, source: "operator" }))
      .toEqual(["Who gets Strelva's emails: new@example.test (New) (new)"]);
    expect(businessFactChangeLines({ entity: "fact", id: "future_key", before: null, after: { odd: [1, 2] }, source: "agent" })).toEqual(['future_key: {"odd":[1,2]} (new)']);
  });

  it("never silently shortens: the detail is whole lines plus a count, the review is complete (P1)", () => {
    const long = "Owner copy sentence. ".repeat(100).trim();
    const big = review({ changes: [
      { entity: "fact", id: "description", before: null, after: long, source: "agency" },
      { entity: "fact", id: "phone", before: "716-555-0101", after: "716-555-0999", source: "operator" },
    ] });
    const lines = businessFactReviewLines(big);
    expect(lines).toEqual([`Description: ${long} (new)`, "Phone: 716-555-0101 → 716-555-0999"]);
    const detail = businessFactsItem(big).detail!;
    expect(detail.length).toBeLessThanOrEqual(1000);
    expect(detail).toBe("2 changes, too long to show here. You see every value in full before you approve.");
    const many = Array.from({ length: 40 }, (_, n) => `Service "S${n}" Price: $${n} → $${n + 1}`);
    const summary = businessFactsDetail(many);
    expect(summary.length).toBeLessThanOrEqual(1000);
    const shown = summary.split("; ").slice(0, -1);
    expect(shown.every(line => many.includes(line))).toBe(true);
    expect(summary.endsWith(`${many.length - shown.length} more changes, shown in full before you approve.`)).toBe(true);
  });

  it("lists items with their complete review, and none to approve once the source moved (P1)", async () => {
    const read = vi.fn(async () => review() as BusinessFactReview | null);
    const { service } = harness(read);
    const [item] = (await service.list(OWNER, WS)).items;
    expect(item!.review).toEqual(businessFactReviewLines(review()));
    expect(await service.review(item!)).toEqual(businessFactReviewLines(review()));
    read.mockResolvedValue(review({ revisionHash: "e".repeat(64) }));
    expect(await service.review(item!)).toBeNull();
    read.mockRejectedValue(new Error("down"));
    expect(await service.review(item!)).toBeNull();
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
    const confirm = vi.fn<(ws: string, id: string, hash: string) => Promise<BusinessFactsReceipt>>()
      .mockRejectedValueOnce(new BusinessFactsChangedError()).mockRejectedValueOnce(new Error("owner approval required"));
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
    rpc.mockResolvedValueOnce({ data: receipt(DECISION) as unknown, error: null });
    expect(await store.confirm(WS, DECISION, "c".repeat(64))).toMatchObject({ decisionId: DECISION, replayed: false });
    expect(rpc).toHaveBeenLastCalledWith("confirm_business_facts", { p_workspace_id: WS, p_decision_id: DECISION, p_revision_hash: "c".repeat(64) });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "business_facts_changed" } });
    await expect(store.confirm(WS, DECISION, "c".repeat(64))).rejects.toBeInstanceOf(BusinessFactsChangedError);
    rpc.mockResolvedValueOnce({ data: null, error: { message: "business_facts_owner_approval_required" } });
    await expect(store.confirm(WS, DECISION, "c".repeat(64))).rejects.toThrow("Only the owner's decision");
    rpc.mockResolvedValueOnce({ data: { ...review(), changes: [] }, error: null });
    await expect(store.read(WS)).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: [WS], error: null });
    expect(await store.pendingWorkspaces()).toEqual([WS]);
    expect(rpc).toHaveBeenLastCalledWith("list_business_fact_review_workspaces", { p_limit: 500 });
  });
});

describe("accountless delivery of the facts item (#509 P2)", () => {
  beforeEach(() => { process.env.APPROVE_LINK_SECRET = "test-approve-secret"; });
  afterEach(() => { delete process.env.APPROVE_LINK_SECRET; });
  function chaseHarness(recipient: DeliveryRow["recipient"]) {
    const memory = needsYouMemoryStore({ clock: { now }, roles: { [OWNER.userId]: "owner" } });
    const deliveries: Array<{ status: string; reason: string | null; to: string | null }> = [];
    const store = {
      ...memory.store,
      dueForDelivery: async () => [...memory.items.values()].filter(row => row.state === "open")
        .map(row => ({ ...row, businessName: "Fictional Co", timezone: "UTC", recipient }) as DeliveryRow),
      recordDelivery: async (_ws: string, id: string, _kind: string, status: string, to: string | null, _message: string | null, reason: string | null) => {
        deliveries.push({ status, reason, to }); return memory.items.get(id)!;
      },
    };
    const sendEmail = vi.fn(async () => ({ status: "accepted" as const, providerMessageId: "msg_1", acceptedAt: "2026-10-11T07:00:00Z" }));
    const confirm = vi.fn(async (_ws: string, decisionId: string) => receipt(decisionId));
    // 07:00 UTC: the morning email goes out.
    const morning = Date.parse("2026-10-11T07:00:00Z");
    const service = createNeedsYouService({ store, adapters: [businessFactsAdapter({ read: async () => review(), confirm })], sendEmail, appOrigin: "https://app.example.test",
      now: () => morning, pendingWorkspaces: async () => [WS] });
    return { service, sendEmail, deliveries, memory };
  }

  it("opens and emails a business with no tenant or bookings, found from its pending facts", async () => {
    const { service, sendEmail, deliveries, memory } = chaseHarness({ email: "owner@example.test", from: "record", tenantId: null, trusted: true });
    const summary = await service.chase();
    expect([...memory.items.values()].filter(row => row.sourceLifecycle === "business_facts" && row.state === "open")).toHaveLength(1);
    expect(summary.digests).toBe(1);
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(deliveries).toEqual([{ status: "sent", reason: null, to: "owner@example.test" }]);
  });

  it("never sends the link to a recipient only a provider wrote", async () => {
    const { service, sendEmail, deliveries } = chaseHarness({ email: "provider@example.test", from: "record", tenantId: null, trusted: false });
    const summary = await service.chase();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(deliveries).toEqual([{ status: "suppressed", reason: "owner_recipient_unconfirmed", to: null }]);
    expect(summary.ownerNotTold).toBe(1);
  });
});

describe("native websites follow the owner's confirmation (#509 P2)", () => {
  it("reports a website still to update as done_unverified, never live", async () => {
    const confirmed = vi.fn(async () => ({ websitePending: true }));
    const adapter = businessFactsAdapter({ read: async () => review(), confirm: async (_ws, id) => receipt(id), confirmed });
    const item = { id: DECISION, sourceId: WS, revisionHash: "c".repeat(64) } as Parameters<typeof adapter.resolve>[1];
    const by = { kind: "owner_link" as const, recipient: "owner@example.test", actor: null };
    expect(await adapter.resolve({ workspaceId: WS }, item, "approve", by)).toEqual({ outcome: "done_unverified", reason: "website_review_pending", receiptRef: `business_facts:${DECISION}` });
    expect(confirmed).toHaveBeenCalledWith(receipt(DECISION), by);
    confirmed.mockRejectedValueOnce(new Error("queue down"));
    expect((await adapter.resolve({ workspaceId: WS }, item, "approve", by)).outcome).toBe("done_unverified");
    confirmed.mockResolvedValueOnce({ websitePending: false });
    expect((await adapter.resolve({ workspaceId: WS }, item, "approve", by)).outcome).toBe("done");
  });

  it("a signed-in owner prepares the contact review as themselves; a link queues it for Strelva", async () => {
    const prepare = vi.fn(async (): Promise<NativeFactsPreparation> => ({ ready: ["native-site"], needsReview: [] }));
    const ports = { enabled: () => true, nativeTenants: vi.fn(async () => ["native-site"]), report: vi.fn(async () => undefined) };
    const effect = createConfirmedNativeFactsEffect(prepare, ports);
    const facts = receipt(DECISION, { recordRevision: 9, factKeys: ["description", "hours", "phone"] });
    expect(await effect(facts, { kind: "session", actor: OWNER })).toEqual({ websitePending: false });
    expect(prepare).toHaveBeenCalledExactlyOnceWith(OWNER, WS, 9, ["hours", "phone"]);
    expect(ports.report).not.toHaveBeenCalled();
    expect(await effect(facts, { kind: "owner_link", recipient: "owner@example.test", actor: null })).toEqual({ websitePending: true });
    expect(ports.report).toHaveBeenCalledExactlyOnceWith("native-site", 9);
    expect(prepare).toHaveBeenCalledOnce();
    expect(await effect(receipt(DECISION, { factKeys: ["description"] }), { kind: "owner_link", recipient: "owner@example.test", actor: null })).toEqual({ websitePending: false });
    ports.nativeTenants.mockResolvedValueOnce([]);
    expect(await effect(facts, { kind: "owner_link", recipient: "owner@example.test", actor: null })).toEqual({ websitePending: false });
    expect(await createConfirmedNativeFactsEffect(prepare, { ...ports, enabled: () => false })(facts, { kind: "owner_link", recipient: "o@example.test", actor: null }))
      .toEqual({ websitePending: false });
  });

  it("a signed-in decision stays unverified while any native site still needs its review (#509 round 3)", async () => {
    const prepare = vi.fn(async (): Promise<NativeFactsPreparation> => ({ ready: [], needsReview: [{ tenantId: "native-site", reason: "record_moved", reported: true }] }));
    const ports = { enabled: () => true, nativeTenants: vi.fn(async () => ["native-site"]), report: vi.fn(async () => undefined) };
    const facts = receipt(DECISION, { recordRevision: 9, factKeys: ["phone"] });
    // Preparation already put the site in front of an operator; nothing is reported twice.
    expect(await createConfirmedNativeFactsEffect(prepare, ports)(facts, { kind: "session", actor: OWNER })).toEqual({ websitePending: true });
    expect(ports.report).not.toHaveBeenCalled();
    // Preparation itself failed: every linked native site gets an operator item.
    prepare.mockRejectedValueOnce(new Error("systems unavailable"));
    expect(await createConfirmedNativeFactsEffect(prepare, ports)(facts, { kind: "session", actor: OWNER })).toEqual({ websitePending: true });
    expect(ports.report).toHaveBeenCalledExactlyOnceWith("native-site", 9);
  });
});
