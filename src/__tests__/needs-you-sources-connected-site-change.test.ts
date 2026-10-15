import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ResolveBy } from "@/platform/needs-you/adapters";
import type { OwnerDecision, ProposedItem } from "@/platform/needs-you/contracts";
import { KIND_RULES } from "@/platform/needs-you/contracts";
import { connectedSiteChangeAdapter, connectedSiteChangeItem, connectedSiteChangeRevision, type ConnectedSiteChangePorts, type PendingConnectedSiteChange } from "@/platform/needs-you/sources/connected-site-change";

const WS = "aaaaaaaa-0000-4000-8000-000000000001";
const OWNER = { userId: "aaaaaaaa-0000-4000-8000-0000000000a1", verifiedEmail: "owner@example.test" };
const session: ResolveBy = { kind: "session", actor: OWNER };
const expiry: ResolveBy = { kind: "expiry" };
const ctx = { workspaceId: WS, actor: OWNER };
const pending = (patch: Partial<PendingConnectedSiteChange> = {}): PendingConnectedSiteChange => ({
  changeId: "aaaaaaaa-0000-4000-8000-0000000000c1", systemId: "aaaaaaaa-0000-4000-8000-0000000000d1", siteHost: "bakery.example", platform: "wix",
  title: "Update the Saturday hours", planStepId: "aaaaaaaa-0000-4000-8000-0000000000e1", pageUrl: "https://bakery.example/hours",
  expectText: "Open Saturday 9-2", removeText: "Closed Saturdays", agencyName: "Agency", recordedAt: "2026-10-20T00:00:00Z", ...patch,
});
function ports(rows: PendingConnectedSiteChange[] = [pending()], enabled = true) {
  const decide = vi.fn(async () => ({ stage: "ready_to_make" }));
  const value: ConnectedSiteChangePorts = {
    enabled: vi.fn(async () => enabled), pending: vi.fn(async () => rows), decide, platformLabel: platform => platform === "wix" ? "Wix" : "your site builder",
  };
  return { value, decide };
}
const asItem = (p: ProposedItem): OwnerDecision => ({
  id: randomUUID(), workspaceId: WS, systemId: p.systemId ?? null, kind: p.kind, route: p.route, title: p.title, detail: p.detail ?? null, approveEffect: p.approveEffect, notYetEffect: p.notYetEffect,
  sourceLifecycle: p.sourceLifecycle, sourceId: p.sourceId, revisionHash: p.revisionHash, urgent: p.urgent, signInRequired: KIND_RULES["system.change_live"].signInRequired, adminMayDecide: p.adminMayDecide,
  openHref: p.openHref ?? null, state: "approved", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null, deliveryState: "not_sent", operatorNote: null,
  openedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(), reminded1At: null, reminded2At: null, deliveries: [],
});

describe("connected-site change adapter", () => {
  it("proposes nothing and reads nothing while keep_your_site is off", async () => {
    const { value } = ports([pending()], false);
    const result = await connectedSiteChangeAdapter(value).propose(ctx);
    expect(result).toEqual({ items: [], complete: true });
    expect(value.pending).not.toHaveBeenCalled();
  });
  it("turns a planned change into one Make it live item", async () => {
    const { value } = ports();
    const adapter = connectedSiteChangeAdapter(value);
    const { items, complete } = await adapter.propose(ctx);
    expect(complete).toBe(true);
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item).toMatchObject({
      kind: "system.change_live", route: "owner_decides", adminMayDecide: false, urgent: false, sourceLifecycle: "connected_site_change",
      sourceId: "aaaaaaaa-0000-4000-8000-0000000000c1", systemId: "aaaaaaaa-0000-4000-8000-0000000000d1",
      title: "Change bakery.example: Update the Saturday hours",
      approveEffect: "Agency makes this edit in Wix. Strelva checks the live page afterwards.",
      notYetEffect: "Nothing changes on your site. Your agency sees you said not yet.",
    });
    expect(item.openHref).toContain(`workspaceId=${WS}`);
    expect(item.openHref).toContain("view=system");
    expect(item.detail).toContain("Page: https://bakery.example/hours");
    expect(item.detail).toContain("“Open Saturday 9-2”");
    expect(item.detail).toContain("no longer say “Closed Saturdays”");
    expect(item.revisionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await adapter.currentRevision(ctx, item.sourceId)).toBe(item.revisionHash);
  });
  it("names the owner's agency generically when it has no name", () => {
    expect(connectedSiteChangeItem(pending({ agencyName: null, removeText: null }), WS, () => "Wix").approveEffect).toMatch(/^Your agency makes this edit in Wix/);
  });
  it("treats a re-plan as a new revision", () => {
    expect(connectedSiteChangeRevision(pending())).not.toBe(connectedSiteChangeRevision(pending({ planStepId: "aaaaaaaa-0000-4000-8000-0000000000e2" })));
  });
  it("records approved once for Make it live and declined for Not yet", async () => {
    const { value, decide } = ports();
    const adapter = connectedSiteChangeAdapter(value);
    const item = asItem((await adapter.propose(ctx)).items[0]!);
    expect(await adapter.resolve(ctx, item, "approve", session)).toEqual({ outcome: "done", receiptRef: "connected_site_change:aaaaaaaa-0000-4000-8000-0000000000c1:approved" });
    expect(decide).toHaveBeenCalledTimes(1);
    expect(decide).toHaveBeenLastCalledWith(OWNER, WS, item.sourceId, "approved");
    expect(await adapter.resolve(ctx, item, "not_yet", session)).toEqual({ outcome: "done", receiptRef: "connected_site_change:aaaaaaaa-0000-4000-8000-0000000000c1:declined" });
    expect(decide).toHaveBeenLastCalledWith(OWNER, WS, item.sourceId, "declined");
  });
  it("changes nothing on expiry", async () => {
    const { value, decide } = ports();
    const adapter = connectedSiteChangeAdapter(value);
    const item = asItem((await adapter.propose(ctx)).items[0]!);
    expect(await adapter.resolve(ctx, item, "approve", expiry)).toEqual({ outcome: "done", reason: "Expired, nothing changed" });
    expect(decide).not.toHaveBeenCalled();
  });
  it("refuses an approval of a plan that changed since the owner looked", async () => {
    const { value, decide } = ports();
    const adapter = connectedSiteChangeAdapter(value);
    const item = asItem((await adapter.propose(ctx)).items[0]!);
    (value.pending as ReturnType<typeof vi.fn>).mockResolvedValue([pending({ planStepId: "aaaaaaaa-0000-4000-8000-0000000000e9" })]);
    expect(await adapter.resolve(ctx, item, "approve", session)).toEqual({ outcome: "failed", reason: "source_changed" });
    expect(decide).not.toHaveBeenCalled();
  });
  it("is already resolved once nothing is waiting", async () => {
    const { value } = ports([]);
    const adapter = connectedSiteChangeAdapter(value);
    const item = asItem(connectedSiteChangeItem(pending(), WS, () => "Wix"));
    expect(await adapter.resolve(ctx, item, "approve", session)).toEqual({ outcome: "done", reason: "already_resolved" });
  });
  it("needs a signed-in member", async () => {
    const { value, decide } = ports();
    const adapter = connectedSiteChangeAdapter(value);
    const item = asItem((await adapter.propose(ctx)).items[0]!);
    expect(await adapter.resolve(ctx, item, "approve", { kind: "owner_link", recipient: "owner@example.test", actor: null })).toEqual({ outcome: "failed", reason: "owner_not_member" });
    expect(decide).not.toHaveBeenCalled();
  });
  it("reports a failed decision as failed", async () => {
    const { value, decide } = ports();
    decide.mockRejectedValue(new Error("db"));
    const adapter = connectedSiteChangeAdapter(value);
    const item = asItem((await adapter.propose(ctx)).items[0]!);
    expect(await adapter.resolve(ctx, item, "approve", session)).toEqual({ outcome: "failed", reason: "resolver_failed" });
  });
  it("cannot be read without a member (the hourly cron)", async () => {
    const { value } = ports();
    expect(await connectedSiteChangeAdapter(value).propose({ workspaceId: WS })).toEqual({ items: [], complete: false });
  });
});
