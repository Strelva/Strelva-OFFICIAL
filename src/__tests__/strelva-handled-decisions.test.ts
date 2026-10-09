import { describe, expect, it, vi } from "vitest";

// What changed lists the owner's decided Needs you items
// (20261009130000_strelva_handled_decisions.sql): what Strelva did after an
// approval or a Not yet, and the honest undo for that lifecycle. None is a
// one-tap undo; each says why or what undoing takes.

const events = vi.hoisted(() => ({ getEvents: vi.fn() }));
vi.mock("@/lib/events", () => ({ getEvents: events.getEvents, getEventRaw: vi.fn() }));

import { approvedDecisionUndo, decidedTenantEventIds, handledFromStore, mergeHandled } from "@/platform/needs-you/handled";
import { readStrelvaHandled } from "@/platform/needs-you/server";
import type { NeedsYouStore } from "@/platform/needs-you/repository";
import type { UnifiedEvent } from "@/lib/types";

const AT = "2026-10-08T15:00:00.000Z";
const SYSTEM = "11111111-1111-4111-8111-111111111111";

function decision(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    actor: { kind: "platform" }, store: "owner_decisions", id: "22222222-2222-4222-8222-222222222222", at: AT, kind: "customer.commitment",
    title: "Booking request: Dana Reed, Tue, Oct 15 3:00 PM", state: "approved", outcome: "done", outcomeReason: null,
    sourceLifecycle: "booking_request", sourceId: "33333333-3333-4333-8333-333333333333", decidedByKind: "owner_link",
    receiptRef: "booking:33333333-3333-4333-8333-333333333333:confirmed",
    approveEffect: "The booking is confirmed for this time.", notYetEffect: "The time is released and the booking is not confirmed.",
    systemId: SYSTEM, openHref: "/workspace/bookings?view=week", undo: "not_undoable",
    ...overrides,
  };
}

describe("decided Needs you items in What changed", () => {
  it("an approved booking request reads as Strelva confirming it, with why it isn't one-tap undo", () => {
    const receipt = handledFromStore(decision());
    expect(receipt).toEqual({
      id: "decision:22222222-2222-4222-8222-222222222222", store: "owner_decisions", systemId: SYSTEM, at: AT, evidence: null, actor: { kind: "platform" },
      sentence: "Strelva confirmed the booking you approved: Dana Reed, Tue, Oct 15 3:00 PM",
      changed: "The booking is confirmed for this time.",
      undo: { state: "not_undoable", reason: "A confirmed booking isn't undone in one tap. Move or cancel it in Bookings, and the customer is told." },
    });
  });

  it("a declined booking request says the time was released", () => {
    const receipt = handledFromStore(decision({ state: "declined" }))!;
    expect(receipt.sentence).toBe("Strelva declined the booking request and released the time: Dana Reed, Tue, Oct 15 3:00 PM");
    expect(receipt.changed).toBe("The time is released and the booking is not confirmed.");
    expect(receipt.undo).toMatchObject({ state: "not_undoable" });
  });

  it("a Not yet on anything else changed nothing", () => {
    const receipt = handledFromStore(decision({ state: "declined", sourceLifecycle: "website_document", title: "Publish the new homepage" }))!;
    expect(receipt.sentence).toBe('Strelva held off on "Publish the new homepage", as you decided.');
    expect(receipt.undo).toEqual({ state: "not_undoable", reason: "Nothing changed, so there is nothing to undo." });
  });

  it("a lapse keeps its old sentence", () => {
    const receipt = handledFromStore(decision({ state: "expired", outcome: "done", decidedByKind: "expiry" }))!;
    expect(receipt.sentence).toBe('Strelva let "Booking request: Dana Reed, Tue, Oct 15 3:00 PM" lapse after 14 days. Nothing changed.');
    expect(receipt.undo.state).toBe("not_undoable");
  });

  it("a failed or unfinished approval never claims it happened", () => {
    const failed = handledFromStore(decision({ outcome: "failed", outcomeReason: "resolver_failed" }))!;
    expect(failed.sentence).toBe('Strelva couldn\'t finish "Booking request: Dana Reed, Tue, Oct 15 3:00 PM" after you decided.');
    expect(failed.undo).toMatchObject({ state: "not_undoable" });
    const running = handledFromStore(decision({ outcome: null }))!;
    expect(running.sentence).toMatch(/^Strelva is finishing /);
    expect(running.undo).toMatchObject({ state: "not_undoable", reason: "It's still in progress. Check back shortly." });
  });

  it("accepted but unverified carries the evidence", () => {
    const receipt = handledFromStore(decision({ outcome: "done_unverified", sourceLifecycle: "tenant_event", kind: "review.reply", title: "Reply to Sam's review" }))!;
    expect(receipt.evidence).toEqual({ providerAccepted: true, readBack: "not_verified" });
    expect(receipt.undo).toMatchObject({ state: "not_undoable", reason: expect.stringContaining("can't be unsent") });
  });

  it("names who decided when it wasn't the owner", () => {
    expect(handledFromStore(decision({ decidedByKind: "operator", sourceLifecycle: "website_document", title: "Fix the hours copy" }))!.sentence)
      .toBe('Strelva did "Fix the hours copy" after Platform operator (support) reviewed it.');
    expect(handledFromStore(decision({ decidedByKind: "admin_session" }))!.sentence)
      .toBe("Strelva confirmed the booking (an admin decided): Dana Reed, Tue, Oct 15 3:00 PM");
  });

  it("Make real says honestly whether anything live changed", () => {
    const isolated = handledFromStore(decision({ sourceLifecycle: "make_real", kind: "system.change_live", title: "Make it live: A rebuilt website",
      outcomeReason: "Approved. Make real ran on an isolated copy: nothing live changed yet.", receiptRef: "make_real:website-rebuild:abc@2" }))!;
    expect(isolated.changed).toBe("Approved. Make real ran on an isolated copy: nothing live changed yet.");
    expect(isolated.undo).toEqual({ state: "not_undoable", reason: "It ran on an isolated copy, so nothing live changed." });
    const live = handledFromStore(decision({ sourceLifecycle: "make_real", kind: "system.change_live", title: "Make it live: Hours", receiptRef: "act_123" }))!;
    expect(live.undo).toMatchObject({ state: "undo_needs_review" });
  });

  it("maps every lifecycle to a reason, and none to a one-tap undo", () => {
    const lifecycles = ["tenant_event", "service_request", "provider_delivery", "website_document", "standing_responsibility", "work_responsibility",
      "assignment_offer", "agency_grant", "application_release", "work_plan", "work_money", "workspace_exit", "make_real", "version_release", "booking_request", null];
    for (const lifecycle of lifecycles) {
      for (const kind of ["copy.routine", "review.reply", null]) {
        const undo = approvedDecisionUndo(lifecycle, kind, null);
        expect(undo.state).not.toBe("undo");
        expect("reason" in undo && undo.reason.length > 10).toBe(true);
      }
    }
    expect(approvedDecisionUndo("tenant_event", "copy.routine", null).state).toBe("undo_needs_review");
    expect(approvedDecisionUndo("work_money", "money", null)).toEqual({ state: "not_undoable", reason: "This is an agreement, not an edit. Ask Strelva to change it." });
  });

  it("drops withdrawn or superseded rows and anything without an id or time", () => {
    expect(handledFromStore(decision({ state: "withdrawn" }))).toBeNull();
    expect(handledFromStore(decision({ at: null }))).toBeNull();
  });

  it("lists a decided tenant event once, as the decision", async () => {
    const rows = [
      decision({ sourceLifecycle: "tenant_event", sourceId: "harbor:evt-1", kind: "review.reply", title: "Reply to Sam's review" }),
      decision({ id: "44444444-4444-4444-8444-444444444444", sourceLifecycle: "tenant_event", sourceId: "harbor:evt-9", state: "expired" }),
    ];
    expect([...decidedTenantEventIds(rows)]).toEqual(["harbor:evt-1"]);
    const event = (id: string): UnifiedEvent => ({
      id, type: "review_reply", title: "Reply", status: "approved", createdAt: AT, resolvedAt: AT,
      metadata: { kind: "review_reply_draft", autoPostAt: AT, author: "Sam" },
    } as unknown as UnifiedEvent);
    events.getEvents.mockResolvedValue([event("evt-1"), event("evt-2")]);
    const store = {
      handled: vi.fn().mockResolvedValue(rows),
      linkedTenants: vi.fn().mockResolvedValue([{ workspaceId: SYSTEM, tenantId: "harbor" }]),
    } as unknown as NeedsYouStore;
    const receipts = await readStrelvaHandled({ userId: SYSTEM, verifiedEmail: "owner@example.test" }, SYSTEM, store, Date.parse(AT) + 1000);
    expect(receipts.map((r) => r.id).sort()).toEqual([
      "decision:22222222-2222-4222-8222-222222222222", "decision:44444444-4444-4444-8444-444444444444", "tenant_event:evt-2",
    ]);
  });

  it("keeps newest first inside the 7-day window", () => {
    const old = handledFromStore(decision({ id: "55555555-5555-4555-8555-555555555555", at: "2026-09-01T00:00:00.000Z" }));
    const fresh = handledFromStore(decision());
    expect(mergeHandled([old, fresh], Date.parse("2026-10-01T00:00:00.000Z")).map((r) => r.id)).toEqual([fresh!.id]);
  });
});
