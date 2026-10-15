import { describe, expect, it } from "vitest";
import { ownerDecisionSchema, type OwnerDecision } from "@/platform/needs-you/contracts";
import { handledFromStore } from "@/platform/needs-you/handled";
import { needsYouMemoryStore } from "./support/needs-you-memory";

const row = {
  id: "bbbbbbbb-0000-4000-8000-000000000001", workspaceId: "aaaaaaaa-0000-4000-8000-000000000001", systemId: null, kind: "review.reply", route: "handle_after_notice",
  title: "Reply", detail: null, approveEffect: "Strelva posts this reply on Google.", notYetEffect: "Nothing is posted.", sourceLifecycle: "tenant_event",
  sourceId: "fixture-firm:evt-1", revisionHash: "a".repeat(64), urgent: false, signInRequired: false, adminMayDecide: false, openHref: null, state: "approved",
  outcome: "done", outcomeReason: null, receiptRef: "tenant_event:evt-1", decidedByKind: "policy", decidedAt: "2026-10-06T11:00:00Z", deliveryState: "not_sent",
  operatorNote: null, openedAt: "2026-10-06T11:00:00Z", expiresAt: "2026-10-07T11:00:00Z", reminded1At: null, reminded2At: null, deliveries: [],
};

describe("the handle_after_notice route", () => {
  it("parses as a policy record", () => {
    expect(ownerDecisionSchema.parse(row).route).toBe("handle_after_notice");
  });

  it("is never listed as something to decide", async () => {
    const memory = needsYouMemoryStore({ clock: { now: Date.now() }, roles: { u1: "owner" } });
    memory.items.set(row.id, row as OwnerDecision);
    expect(await memory.store.list({ userId: "u1", verifiedEmail: "o@example.test" }, row.workspaceId, true)).toEqual([]);
  });

  it("reads as the notice setting in What changed, and an agency decision as the agency", () => {
    const policy = handledFromStore({ ...row, store: "owner_decisions", at: row.decidedAt });
    expect(policy?.sentence).toContain("your notice setting allowed it");
    const agency = handledFromStore({ ...row, route: "owner_decides", decidedByKind: "agency_session", store: "owner_decisions", at: row.decidedAt });
    expect(agency?.sentence).toContain("your agency decided");
  });
});
