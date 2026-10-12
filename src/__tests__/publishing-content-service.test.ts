import { describe, expect, it, vi } from "vitest";
import { classifyTenantEvent } from "@/platform/needs-you/tenant-classify";
import { evaluateRoute } from "@/platform/needs-you/evaluator";
import { contentFingerprint, executePublishingEvent, prepareContentDraft, type ContentPorts, type ContentTarget } from "@/products/publishing/content-service";
import type { UnifiedEvent } from "@/lib/types";

const target: ContentTarget = { workspaceId: "ab000000-0000-4000-8000-000000000010", systemId: "ab000000-0000-4000-8000-000000000020", tenantId: "fixture-law", kind: "website" };
function ports(before: { status: string; data: unknown } | null = null): ContentPorts {
  return { authorize: vi.fn(async () => ({ allowed: true, actor: null })), enabled: vi.fn(async () => true), entry: vi.fn(async () => before), add: vi.fn(async event => ({ ...event, id: "evt-fixture", createdAt: "2026-10-06T12:00:00Z" })), publish: vi.fn(async () => ({ receiptId: "receipt-publish", verified: true })), approveIssue: vi.fn(async () => ({ receiptId: "receipt-issue", verified: true })) };
}
const approval = (event: UnifiedEvent, p: ContentPorts) => executePublishingEvent({ tenantId: target.tenantId, event, actorId: "owner", attemptId: "attempt-fixture" }, p);

describe("workspace publishing content", () => {
  it("flags off never enqueue, publish or approve", async () => {
    const p = ports(); p.enabled = vi.fn(async () => false);
    await expect(prepareContentDraft(target, { kind: "collection", type: "blog", data: { title: "Hello" } }, p)).rejects.toThrow("not enabled");
    expect(p.add).not.toHaveBeenCalled(); expect(p.publish).not.toHaveBeenCalled(); expect(p.approveIssue).not.toHaveBeenCalled();
    const on = ports(); const event = await prepareContentDraft(target, { kind: "collection", type: "blog", data: { title: "Hello" } }, on);
    expect(await approval(event, p)).toMatchObject({ accepted: false, reason: "publishing_disabled" });
    expect(p.publish).not.toHaveBeenCalled();
  });
  it("drafting a revision keeps the currently published entry and pins exact review content", async () => {
    const before = { status: "published", data: { title: "Before", body: "Keep this live" } }; const p = ports(before);
    const event = await prepareContentDraft(target, { kind: "collection", type: "blog", slug: "same-url", data: { title: "After", body: "New copy" } }, p);
    expect(p.publish).not.toHaveBeenCalled(); expect(p.approveIssue).not.toHaveBeenCalled();
    expect(event.status).toBe("pending"); expect(event.metadata?.publishing).toMatchObject({ before, slug: "same-url", data: { title: "After", body: "New copy" } });
    expect(evaluateRoute({ ...classifyTenantEvent(event)!, policies: [], systemId: target.systemId }).route).toBe("owner_decides");
    expect(await approval(event, p)).toMatchObject({ accepted: true, verified: true });
    expect(p.publish).toHaveBeenCalledWith(expect.objectContaining({ before, actor: "owner", eventId: event.id }));
  });
  it("stale, altered, wrong-tenant and invalid proposals refuse without publication", async () => {
    const p = ports(); const event = await prepareContentDraft(target, { kind: "collection", type: "blog", data: { title: "Hello" } }, p);
    p.entry = vi.fn(async () => ({ status: "published", data: { title: "Changed elsewhere" } }));
    p.publish = vi.fn(async () => { throw new Error("publishing_baseline_changed"); });
    expect(await approval(event, p)).toMatchObject({ accepted: false, reason: "publishing_stale" });
    const changed = structuredClone(event); (changed.metadata!.publishing as Record<string, unknown>).data = { title: "Tampered" };
    expect(await approval(changed, p)).toMatchObject({ accepted: false, reason: "publishing_draft_changed" });
    expect(await approval({ ...event, tenantId: "other" }, p)).toMatchObject({ accepted: false, reason: "publishing_wrong_scope" });
    await expect(prepareContentDraft(target, { kind: "collection", type: "product", data: { name: "Product", priceCents: -1 } }, p)).rejects.toThrow();
    expect(p.publish).toHaveBeenCalledTimes(1);
  });
  it("newsletter approval succeeds with an immutable output receipt and no send dependency", async () => {
    const p = ports(); const event = await prepareContentDraft({ ...target, kind: "newsletter" }, { kind: "newsletter", subject: "New collection", body: "Reviewed message" }, p);
    expect(event.metadata?.sendingPaused).toBe(true); expect(p.approveIssue).not.toHaveBeenCalled();
    expect(evaluateRoute({ ...classifyTenantEvent(event)!, policies: [] }).route).toBe("owner_decides");
    expect(await approval(event, p)).toMatchObject({ accepted: true, reason: "newsletter_sending_paused", receiptId: "receipt-issue" });
    expect(p.approveIssue).toHaveBeenCalledWith(expect.objectContaining({ subject: "New collection", body: "Reviewed message", draftHash: contentFingerprint({ subject: "New collection", body: "Reviewed message" }) }));
    expect(p.publish).not.toHaveBeenCalled();
  });
  it("storage failures never produce success; ordinary events preserve the legacy path", async () => {
    const p = ports(); const event = await prepareContentDraft({ ...target, kind: "newsletter" }, { kind: "newsletter", subject: "News", body: "Copy" }, p);
    p.approveIssue = vi.fn(async () => { throw new Error("Storage unavailable"); });
    expect(await approval(event, p)).toMatchObject({ accepted: false, reason: "publishing_storage_unconfirmed" });
    expect(await approval({ ...event, metadata: { kind: "legacy-newsletter" } }, p)).toBeNull();
  });
  it("an accepted publication replay reaches the atomic receipt replay instead of overwriting", async () => {
    const p = ports(); const event = await prepareContentDraft(target, { kind: "collection", type: "blog", data: { title: "Hello" } }, p);
    p.entry = vi.fn(async () => ({ status: "published", data: (event.metadata?.publishing as Record<string, unknown>).data }));
    expect(await approval(event, p)).toMatchObject({ accepted: true });
  });
  it("accepted recovery reaches the receipt even after later edits or an unavailable collection read", async () => {
    const p = ports(); const event = await prepareContentDraft(target, { kind: "collection", type: "blog", data: { title: "Hello" } }, p);
    p.entry = vi.fn(async () => ({ status: "draft", data: { title: "Later owner edit" } }));
    expect(await approval(event, p)).toMatchObject({ accepted: true, receiptId: "receipt-publish" });
    expect(p.entry).not.toHaveBeenCalled();
    p.entry = vi.fn(async () => { throw new Error("Collection read unavailable"); });
    expect(await approval(event, p)).toMatchObject({ accepted: true, receiptId: "receipt-publish" });
    expect(p.entry).not.toHaveBeenCalled();
    p.authorize = vi.fn(async () => ({ allowed: false, reason: "publishing_owner_changed" }));
    expect(await approval(event, p)).toMatchObject({ accepted: false, reason: "publishing_owner_changed" });
    expect(p.publish).toHaveBeenCalledTimes(2);
  });
});
