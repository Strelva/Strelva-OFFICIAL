import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedEvent } from "@/lib/types";
import type { SendEmailInput, SendEmailResult } from "@/platform/infra/email/send";
import type { ServiceRequest } from "@/platform/service-requests/types";
import type { OwnerDecision, ProposedItem } from "@/platform/needs-you/contracts";
import { serviceRequestAdapter, tenantEventAdapter, tenantEventItem, type SourceAdapter } from "@/platform/needs-you/adapters";
import { NeedsYouRefusedError, type DeliveryRow, type NeedsYouStore } from "@/platform/needs-you/repository";
import { createNeedsYouService } from "@/platform/needs-you/service";
import { tenantEventRevision } from "@/platform/needs-you/tenant-classify";
import { verifyWorkspaceApproveToken } from "@/lib/approve-link";

const WS = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_WS = "aaaaaaaa-0000-4000-8000-000000000002";
const OWNER = { userId: "aaaaaaaa-0000-4000-8000-0000000000a1", verifiedEmail: "owner@example.test" };
const DAY = 24 * 3600 * 1000;

/** In-memory twin of the SQL functions, enough to drive the service. The SQL itself is proven by tests/needs-you-schema.sql. */
function memoryStore(clock: { now: number }) {
  const items = new Map<string, OwnerDecision>();
  const noticeClaims = new Map<string, "sending" | "accepted" | "suppressed" | "unknown">();
  const state = { ownerRecipient: "owner@example.test" as string | null, ownerMember: true };
  const store: NeedsYouStore = {
    async open(workspaceId, p: ProposedItem) {
      const same = [...items.values()].find(i => i.workspaceId === workspaceId && i.sourceLifecycle === p.sourceLifecycle && i.sourceId === p.sourceId && i.revisionHash === p.revisionHash);
      if (same) return same;
      for (const i of items.values()) if (i.workspaceId === workspaceId && i.sourceId === p.sourceId && i.state === "open") items.set(i.id, { ...i, state: "superseded", decidedAt: new Date(clock.now).toISOString() });
      const openedAt = new Date(clock.now).toISOString();
      const row: OwnerDecision = {
        id: randomUUID(), workspaceId, systemId: null, kind: p.kind, route: p.route, title: p.title, detail: p.detail ?? null,
        approveEffect: p.approveEffect, notYetEffect: p.notYetEffect, sourceLifecycle: p.sourceLifecycle, sourceId: p.sourceId,
        revisionHash: p.revisionHash, urgent: p.urgent, signInRequired: ["access.grant", "money", "exit"].includes(p.kind), adminMayDecide: p.adminMayDecide,
        openHref: p.openHref ?? null, state: "open", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null,
        deliveryState: "not_sent", operatorNote: null, openedAt, expiresAt: new Date(clock.now + 14 * DAY).toISOString(), reminded1At: null, reminded2At: null, deliveries: [],
      };
      items.set(row.id, row);
      return row;
    },
    async withdraw(_ws, id) { const i = items.get(id)!; const next = { ...i, state: "withdrawn" as const, decidedAt: "now" }; items.set(id, next); return next; },
    async read(ws, id) { const i = items.get(id); return i && i.workspaceId === ws ? i : null; },
    async list(_actor, ws) { return [...items.values()].filter(i => i.workspaceId === ws && i.state === "open" && i.route === "owner_decides"); },
    async claim(input) {
      const i = items.get(input.itemId);
      if (!i || i.workspaceId !== input.workspaceId) throw new Error("owner_decision_not_found");
      if (i.state !== "open") return { status: i.state === "superseded" ? "changed" : "already_handled", item: i };
      if (i.revisionHash !== input.revision) return { status: "changed", item: i };
      if (clock.now >= Date.parse(i.expiresAt)) return { status: "expired", item: i };
      if (input.by === "owner_link") {
        if (i.signInRequired) throw new NeedsYouRefusedError("owner_decision_sign_in_required", "x");
        if (input.recipient !== state.ownerRecipient) throw new NeedsYouRefusedError("owner_decision_recipient_not_owner", "x");
      }
      const next = { ...i, state: input.decision === "approve" ? "approved" as const : "declined" as const, decidedAt: new Date(clock.now).toISOString(), decidedByKind: input.by };
      items.set(i.id, next);
      return { status: "claimed", item: next };
    },
    async expire(_ws, id) { const i = items.get(id)!; const next = { ...i, state: "expired" as const, decidedAt: "now", decidedByKind: "expiry" }; items.set(id, next); return next; },
    async finish(_ws, id, outcome, reason, receiptRef) { const i = items.get(id)!; const next = { ...i, outcome, outcomeReason: reason, receiptRef }; items.set(id, next); return next; },
    async recordDelivery(_ws, id, kind, status, _recipient, providerMessageId, reason) {
      const i = items.get(id)!;
      const deliveryState = status === "failed" ? i.deliveryState : status === "sent" ? (kind === "reminder_1" ? "reminded_1" : kind === "reminder_2" ? "reminded_2" : "sent") : status;
      const next: OwnerDecision = { ...i, deliveryState, reminded1At: kind === "reminder_1" ? "now" : i.reminded1At, reminded2At: kind === "reminder_2" ? "now" : i.reminded2At,
        deliveries: [...i.deliveries, { kind, status, providerMessageId, reason, at: "now" }] };
      items.set(id, next);
      return next;
    },
    async dueForDelivery() {
      return [...items.values()].filter(i => i.state === "open" && i.route === "owner_decides")
        .map(i => ({ ...i, businessName: "Mooney Fixture Firm", timezone: "America/New_York", recipient: state.ownerRecipient ? { email: state.ownerRecipient, from: "tenant_fallback", tenantId: "fixture-firm" } : null }) as DeliveryRow);
    },
    async claimInquiryNotice(row, recipient) {
      const prior = noticeClaims.get(row.id);
      if (prior) return { acquired: false, status: prior };
      if (items.get(row.id)?.revisionHash !== row.revisionHash || recipient !== state.ownerRecipient) throw new Error("changed");
      noticeClaims.set(row.id, "sending");
      return { acquired: true, status: "sending" };
    },
    async finishInquiryNotice(row, status, providerMessageId, _acceptedAt, reason) {
      if (noticeClaims.get(row.id) !== "sending") return;
      noticeClaims.set(row.id, status);
      await store.recordDelivery(row.workspaceId, row.id, "urgent", status === "accepted" ? "sent" : status === "suppressed" ? "suppressed" : "failed", state.ownerRecipient, providerMessageId, reason);
    },
    async linkedTenants(ws) { return ws === OTHER_WS ? [] : [{ workspaceId: WS, tenantId: "fixture-firm" }]; },
    async ownerActor(_ws, recipient) { return state.ownerMember && recipient === state.ownerRecipient ? OWNER : null; },
    async policies() { return []; },
    async setPolicy() { throw new Error("unused"); },
    async handled() { return []; },
  };
  return { store, items, state, noticeClaims };
}

function ev(over: Partial<UnifiedEvent>): UnifiedEvent {
  return { id: "evt-1", tenantId: "fixture-firm", source: "ai", type: "review", title: "Drafted reply for Dana's 4-star review", body: "Thank you, Dana!", status: "pending",
    createdAt: "2026-10-05T09:02:00Z", metadata: { kind: "review_reply_draft", rating: 4, reviewId: "r1" }, ...over };
}

let clock: { now: number };
let mem: ReturnType<typeof memoryStore>;
let events: Map<string, UnifiedEvent>;
let resolveEventAction: ReturnType<typeof vi.fn>;
let sendEmail: ReturnType<typeof vi.fn<(input: SendEmailInput) => Promise<SendEmailResult>>>;
let requests: ServiceRequest[];
let change: ReturnType<typeof vi.fn>;

function service(adapters?: SourceAdapter[], urgentInquiryAllowed?: (tenantId: string | null) => Promise<boolean>) {
  return createNeedsYouService({
    store: mem.store,
    appOrigin: "https://app.example.test",
    now: () => clock.now,
    sendEmail,
    urgentInquiryAllowed,
    adapters: adapters ?? [
      tenantEventAdapter({
        linkedTenants: async (ws) => (await mem.store.linkedTenants(ws)).map(l => l.tenantId),
        pendingEvents: async (tenantId) => [...events.values()].filter(e => e.tenantId === tenantId && e.status === "pending"),
        readEvent: async (id) => events.get(id) ?? null,
        resolveEventAction: resolveEventAction as never,
      }),
      serviceRequestAdapter({ list: async () => requests, change: change as never }),
    ],
  });
}

afterEach(() => vi.unstubAllEnvs());

beforeEach(() => {
  process.env.APPROVE_LINK_SECRET = "needs-you-test-secret";
  // Tuesday 2026-10-06 07:00 in New York.
  clock = { now: Date.parse("2026-10-06T11:00:00Z") };
  mem = memoryStore(clock);
  events = new Map([["evt-1", ev({})]]);
  resolveEventAction = vi.fn(async (_t: string, id: string, action: string) => {
    const e = events.get(id)!;
    events.set(id, { ...e, status: action === "approved" ? "approved" : "dismissed" });
    return { changed: true };
  });
  sendEmail = vi.fn(async () => ({ status: "suppressed" as const, reason: "email_suppressed_or_unconfigured" }));
  requests = [];
  change = vi.fn();
});

describe("Needs you items from the tenant model", () => {
  it("opens one item per owner-visible pending event and nothing for operator or auto-post asks", async () => {
    events.set("evt-2", ev({ id: "evt-2", metadata: { kind: "agent_preview", governanceReason: "marketing_copy", reviewAudience: "operator" }, type: "content_update" }));
    events.set("evt-3", ev({ id: "evt-3", metadata: { kind: "review_reply_draft", rating: 5, autoPostAt: "2026-10-06T21:00:00Z" } }));
    events.set("evt-4", ev({ id: "evt-4", type: "change_verify_failed", metadata: {} }));
    const { items } = await service().list(OWNER, WS);
    expect(items.map(i => i.sourceId)).toEqual(["fixture-firm:evt-1"]);
    expect(items[0]).toMatchObject({ kind: "review.reply", route: "owner_decides", urgent: true });
    // The operator and the read-back failure are strelva_reviews items, never the owner's.
    expect([...mem.items.values()].filter(i => i.route === "strelva_reviews").map(i => i.sourceId).sort()).toEqual(["fixture-firm:evt-2", "fixture-firm:evt-4"]);
  });

  it("another business never sees this tenant's asks", async () => {
    const { items } = await service().list(OWNER, OTHER_WS);
    expect(items).toEqual([]);
  });
});

describe("deciding", () => {
  async function opened() {
    const svc = service();
    const [item] = (await svc.list(OWNER, WS)).items;
    return { svc, item: item! };
  }

  it("a link approve resolves through resolveEventAction once; a replay is already handled", async () => {
    const { svc, item } = await opened();
    const result = await svc.decide({ workspaceId: WS, itemId: item.id, revision: item.revisionHash, decision: "approve", by: { kind: "owner_link", recipient: "owner@example.test" } });
    expect(result.status).toBe("done");
    expect(resolveEventAction).toHaveBeenCalledWith("fixture-firm", "evt-1", "approved", "owner-link:owner@example.test");
    expect(result.item).toMatchObject({ state: "approved", outcome: "done", receiptRef: "tenant_event:evt-1" });
    const replay = await svc.decide({ workspaceId: WS, itemId: item.id, revision: item.revisionHash, decision: "approve", by: { kind: "owner_link", recipient: "owner@example.test" } });
    expect(replay.status).toBe("already_handled");
    expect(resolveEventAction).toHaveBeenCalledTimes(1);
  });

  it("not yet dismisses through the same resolver", async () => {
    const { svc, item } = await opened();
    await svc.decide({ workspaceId: WS, itemId: item.id, revision: item.revisionHash, decision: "not_yet", by: { kind: "session", actor: OWNER } });
    expect(resolveEventAction).toHaveBeenCalledWith("fixture-firm", "evt-1", "dismissed", OWNER.userId);
  });

  it("refuses a link once the reply changed since the email, and opens the new revision", async () => {
    const { svc, item } = await opened();
    events.set("evt-1", ev({ body: "Thanks so much, Dana!", metadata: { kind: "review_reply_draft", rating: 4, reviewId: "r1", draftedReply: "edited" } }));
    const result = await svc.decide({ workspaceId: WS, itemId: item.id, revision: item.revisionHash, decision: "approve", by: { kind: "owner_link", recipient: "owner@example.test" } });
    expect(result.status).toBe("changed");
    expect(resolveEventAction).not.toHaveBeenCalled();
    const fresh = [...mem.items.values()].find(i => i.state === "open");
    expect(fresh?.revisionHash).toBe(tenantEventRevision(events.get("evt-1")!));
    expect(mem.items.get(item.id)?.state).toBe("superseded");
  });

  it("refuses a stale revision in the link even when the item is current", async () => {
    const { svc, item } = await opened();
    const result = await svc.decide({ workspaceId: WS, itemId: item.id, revision: "f".repeat(64), decision: "approve", by: { kind: "owner_link", recipient: "owner@example.test" } });
    expect(result.status).toBe("changed");
    expect(resolveEventAction).not.toHaveBeenCalled();
  });

  it("refuses a recipient who is no longer the owner", async () => {
    const { svc, item } = await opened();
    mem.state.ownerRecipient = "new-owner@example.test";
    const result = await svc.decide({ workspaceId: WS, itemId: item.id, revision: item.revisionHash, decision: "approve", by: { kind: "owner_link", recipient: "owner@example.test" } });
    expect(result.status).toBe("not_owner");
    expect(resolveEventAction).not.toHaveBeenCalled();
  });

  it("refuses a link for access, money and exit", async () => {
    events.set("evt-1", ev({ type: "content_update", title: "Hand off my website", metadata: { kind: "offboarding_handoff_request" } }));
    const { svc, item } = await opened();
    expect(item.kind).toBe("exit");
    const result = await svc.decide({ workspaceId: WS, itemId: item.id, revision: item.revisionHash, decision: "approve", by: { kind: "owner_link", recipient: "owner@example.test" } });
    expect(result.status).toBe("sign_in");
    expect(resolveEventAction).not.toHaveBeenCalled();
  });

  it("a provider failure leaves the source pending and records failed", async () => {
    resolveEventAction.mockResolvedValueOnce({ changed: false, reason: "gbp_publish_failed" });
    const { svc, item } = await opened();
    const result = await svc.decide({ workspaceId: WS, itemId: item.id, revision: item.revisionHash, decision: "approve", by: { kind: "owner_link", recipient: "owner@example.test" } });
    expect(result.status).toBe("failed");
    expect(events.get("evt-1")?.status).toBe("pending");
    expect(result.item).toMatchObject({ outcome: "failed", outcomeReason: "gbp_publish_failed" });
  });

  it("accepted but unverified is recorded as such and never retried", async () => {
    resolveEventAction.mockResolvedValueOnce({ changed: true, reason: "accepted_unverified" });
    const { svc, item } = await opened();
    const result = await svc.decide({ workspaceId: WS, itemId: item.id, revision: item.revisionHash, decision: "approve", by: { kind: "owner_link", recipient: "owner@example.test" } });
    expect(result.status).toBe("done_unverified");
    const again = await svc.decide({ workspaceId: WS, itemId: item.id, revision: item.revisionHash, decision: "approve", by: { kind: "owner_link", recipient: "owner@example.test" } });
    expect(again.status).toBe("already_handled");
    expect(resolveEventAction).toHaveBeenCalledTimes(1);
  });
});

describe("service requests", () => {
  const request = (status: "proposed" | "submitted"): ServiceRequest => ({
    id: "bbbbbbbb-0000-4000-8000-000000000001", businessId: WS, status: "requested", request: "A booking page", outcome: "Clients book consults online",
    context: {}, scope: ["booking page"], provider: { kind: "strelva" },
    providerAcceptance: { status: "accepted", actorId: null, acceptedAt: null, note: null }, installationId: null, deliveryId: null,
    deliveryCommitment: { version: 1, status, operatorId: OWNER.userId, termsReference: "Terms", deliveryDefinition: "A live booking page", scope: ["page"],
      proposedAt: "2026-10-01T00:00:00Z", startedAt: null, dueAt: null, customerAcceptedBy: null, customerAcceptedAt: null, blocker: null, result: null, decision: null },
    revision: 3, createdBy: OWNER.userId, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
  });

  it("agree by link acts as the owner member through the commitment resolver", async () => {
    events.clear();
    requests = [request("proposed")];
    change.mockResolvedValue({ ...requests[0], revision: 4 });
    const svc = service();
    const [item] = (await svc.list(OWNER, WS)).items;
    expect(item).toMatchObject({ kind: "request.scope", sourceId: `${requests[0]!.id}:proposed`, openHref: `/workspace/delivery/${requests[0]!.id}` });
    const result = await svc.decide({ workspaceId: WS, itemId: item!.id, revision: item!.revisionHash, decision: "approve", by: { kind: "owner_link", recipient: "owner@example.test" } });
    expect(result.status).toBe("done");
    expect(change).toHaveBeenCalledWith(OWNER, expect.objectContaining({ requestId: requests[0]!.id, expectedRevision: 3, change: { kind: "agree" } }));
  });

  it("needs a sign-in when the owner recipient is not a member", async () => {
    events.clear();
    requests = [request("submitted")];
    const svc = service();
    const [item] = (await svc.list(OWNER, WS)).items;
    mem.state.ownerMember = false;
    const result = await svc.decide({ workspaceId: WS, itemId: item!.id, revision: item!.revisionHash, decision: "approve", by: { kind: "owner_link", recipient: "owner@example.test" } });
    expect(result.status).toBe("sign_in");
    expect(change).not.toHaveBeenCalled();
  });

  it("not yet changes nothing at the source", async () => {
    events.clear();
    requests = [request("submitted")];
    const svc = service();
    const [item] = (await svc.list(OWNER, WS)).items;
    const result = await svc.decide({ workspaceId: WS, itemId: item!.id, revision: item!.revisionHash, decision: "not_yet", by: { kind: "session", actor: OWNER } });
    expect(result.status).toBe("done");
    expect(change).not.toHaveBeenCalled();
  });
});

describe("the chase", () => {
  it("never sends an inquiry decision without the explicit inquiry email gates", async () => {
    requests = [];
    clock.now = Date.parse("2026-10-06T15:00:00Z");
    events = new Map([["evt-1", ev({ type: "change_request", metadata: {
      kind: "inquiry_delivery_approval", inquiryId: "lead_fixture", action: "reply",
      subject: "Party", messageBody: "We can host 30 guests for $40 each.",
    } })]]);
    const svc = service();
    await svc.list(OWNER, WS);
    expect((await svc.chase()).ownerNotTold).toBeGreaterThan(0);
    expect(sendEmail).not.toHaveBeenCalled();
    expect([...mem.items.values()][0]?.deliveries[0]).toMatchObject({ status: "suppressed", reason: "inquiry_email_gates_off" });
  });
  it("emails an urgent ask at once, records owner not told while email is gated, and never repeats it", async () => {
    clock.now = Date.parse("2026-10-06T15:00:00Z"); // 11:00 New York: not digest time
    const svc = service();
    const first = await svc.chase();
    expect(first).toMatchObject({ urgent: 1, digests: 0, ownerNotTold: 1 });
    const call = sendEmail.mock.calls[0]![0];
    expect(call).toMatchObject({ audience: "client", tenantId: "fixture-firm", to: "owner@example.test" });
    const item = [...mem.items.values()][0]!;
    expect(item.deliveryState).toBe("suppressed");
    expect(item.deliveries[0]).toMatchObject({ kind: "urgent", status: "suppressed", reason: "email_suppressed_or_unconfigured" });
    // The email carries signed links bound to this item, recipient and revision.
    const approve = call.options!.decisions![0]!.approve!.url;
    const claims = verifyWorkspaceApproveToken(decodeURIComponent(approve.split("token=")[1]!));
    expect(claims).toEqual({ workspaceId: WS, itemId: item.id, action: "approve", recipient: "owner@example.test", revision: item.revisionHash });
    expect((await svc.chase()).urgent).toBe(0);
  });

  it("sends the morning email at 07:00 local only, with every non-urgent ask", async () => {
    events.set("evt-1", ev({ type: "newsletter_draft", title: "Send the October newsletter", metadata: { kind: "newsletter_approval" } }));
    events.set("evt-2", ev({ id: "evt-2", type: "content_update", title: "New services page", metadata: { kind: "manual_structural_change" } }));
    sendEmail.mockResolvedValue({ status: "accepted", providerMessageId: "msg_1", acceptedAt: "now" });
    clock.now = Date.parse("2026-10-06T13:00:00Z"); // 09:00 New York
    expect((await service().chase()).digests).toBe(0);
    clock.now = Date.parse("2026-10-07T11:00:00Z"); // 07:00 New York
    const summary = await service().chase();
    expect(summary).toMatchObject({ digests: 1, ownerNotTold: 0 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]![0].options!.heading).toBe("Strelva needs 2 decisions");
    expect([...mem.items.values()].every(i => i.deliveryState === "sent")).toBe(true);
  });

  it("reminds on day 3 and lapses on day 14 without touching the source", async () => {
    events.set("evt-1", ev({ type: "newsletter_draft", title: "Send the October newsletter", metadata: { kind: "newsletter_approval" } }));
    sendEmail.mockResolvedValue({ status: "accepted", providerMessageId: "msg_1", acceptedAt: "now" });
    await service().chase(); // 07:00: digest
    clock.now += 3 * DAY;
    expect((await service().chase()).reminded).toBe(1);
    expect(sendEmail.mock.calls.at(-1)![0].options!.heading).toBe("Still waiting on you: 1 decision");
    clock.now += 11 * DAY;
    const summary = await service().chase();
    expect(summary.lapsed).toBe(1);
    const item = [...mem.items.values()][0]!;
    expect(item).toMatchObject({ state: "expired", outcome: "done", outcomeReason: "Expired, nothing changed" });
    // Silence never approves: no resolver ran, the source is still pending for the operator.
    expect(resolveEventAction).not.toHaveBeenCalled();
    expect(events.get("evt-1")?.status).toBe("pending");
    // A lapsed ask is not reopened for the same revision.
    await service().chase();
    expect([...mem.items.values()].filter(i => i.state === "open")).toHaveLength(0);
  });

  it("withdraws an ask the source resolved elsewhere instead of chasing it", async () => {
    const svc = service();
    await svc.list(OWNER, WS);
    events.set("evt-1", { ...events.get("evt-1")!, status: "approved" });
    clock.now = Date.parse("2026-10-06T15:00:00Z");
    const summary = await svc.chase();
    expect(summary.urgent).toBe(0);
    expect([...mem.items.values()][0]!.state).toBe("withdrawn");
  });

  it("records owner not told when the business has no owner recipient", async () => {
    mem.state.ownerRecipient = null;
    clock.now = Date.parse("2026-10-06T15:00:00Z");
    const summary = await service().chase();
    expect(summary.ownerNotTold).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();
    expect([...mem.items.values()][0]!.deliveries[0]).toMatchObject({ status: "suppressed", reason: "no_owner_recipient" });
  });
});


describe("booking request clock ownership", () => {
  async function setup() {
    const row = await mem.store.open(WS, { kind: "customer.commitment", route: "owner_decides", title: "Consultation request", approveEffect: "Confirm", notYetEffect: "Decline", sourceLifecycle: "booking_request", sourceId: "booking-clock", revisionHash: "revision", urgent: true, adminMayDecide: false });
    const resolve = vi.fn(async () => ({ outcome: "done" as const }));
    const adapter: SourceAdapter = { lifecycle: "booking_request", needsMemberActor: false, propose: async () => ({ items: [], complete: true }), currentRevision: async () => "revision", resolve };
    return { row, resolve, svc: service([adapter]) };
  }
  it("delivers only the newly captured booking and leaves unrelated work for the cron", async () => {
    vi.stubEnv("STRELVA_BOOKING_OWNER_NOTICE","1");
    const { row, svc } = await setup();
    const other = await mem.store.open(WS, { kind:"structure", route:"owner_decides", title:"Unrelated publish", approveEffect:"Publish", notYetEffect:"Keep draft", sourceLifecycle:"website_document", sourceId:"other", revisionHash:"other", urgent:true, adminMayDecide:false });
    expect((await svc.notifyBookingRequest(WS,row.id)).urgent).toBe(1);
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail.mock.calls[0]?.[0].tags).toMatchObject({lifecycle:"booking_request",kind:"urgent"});
    expect(mem.items.get(other.id)?.deliveryState).toBe("not_sent");
    expect((await svc.notifyBookingRequest(WS,row.id)).urgent).toBe(0);
  });
  it("leaves day 3/7/14 to the booking clock when reminders are armed", async () => {
    vi.stubEnv("STRELVA_BOOKING_STORE_WRITE", "1"); vi.stubEnv("STRELVA_BOOKING_REMINDERS", "1"); vi.stubEnv("STRELVA_BOOKING_OWNER_NOTICE", "1");
    const { row, resolve, svc } = await setup();
    await svc.chase(); sendEmail.mockClear();
    for (const day of [3,7,14]) { clock.now = Date.parse(row.openedAt) + day * DAY; const result = await svc.chase(); expect(result.lapsed).toBe(0); expect(result.reminded).toBe(0); }
    expect(sendEmail).not.toHaveBeenCalled(); expect(resolve).not.toHaveBeenCalled();
    expect(mem.items.get(row.id)?.state).toBe("open");
  });
  it("keeps the prior generic clock with booking reminders off", async () => {
    vi.stubEnv("STRELVA_BOOKING_REMINDERS", "0"); vi.stubEnv("STRELVA_BOOKING_OWNER_NOTICE", "1");
    const { row, resolve, svc } = await setup(); clock.now = Date.parse(row.openedAt) + 14 * DAY;
    expect((await svc.chase()).lapsed).toBe(1); expect(resolve).toHaveBeenCalledOnce();
  });
  it("does not email booking asks while owner notices are off", async () => {
    vi.stubEnv("STRELVA_BOOKING_OWNER_NOTICE", "0");
    const { svc } = await setup(); expect((await svc.chase()).urgent).toBe(0); expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("booking calendar health alongside Needs You decisions", () => {
  it("checks each linked business once and counts owner-not-told without opening a decision", async () => {
    const bookingCalendarHealth = vi.fn(async () => ({ digests: 0, ownerNotTold: 1, failed: 0, complete: true }));
    const svc = createNeedsYouService({ store: mem.store, adapters: [], sendEmail, now: () => clock.now, appOrigin: "https://app.example.test", bookingCalendarHealth });
    const result = await svc.chase();
    expect(bookingCalendarHealth).toHaveBeenCalledTimes(1);
    expect(bookingCalendarHealth).toHaveBeenCalledWith(WS, { now: clock.now, appOrigin: "https://app.example.test", sendEmail });
    expect(result.ownerNotTold).toBe(1);
    expect(mem.items.size).toBe(0);
  });
  it("calendar source failure keeps the hourly chase honest without aborting its decision work", async () => {
    const bookingCalendarHealth = vi.fn(async () => { throw new Error("health source down"); });
    const svc = createNeedsYouService({ store: mem.store, adapters: [], sendEmail, now: () => clock.now, appOrigin: "https://app.example.test", bookingCalendarHealth });
    expect(await svc.chase()).toMatchObject({failed:1,digests:0});
describe("strict inquiry fact and publication email gates", () => {
  it.each(["inquiry_capability_publish","inquiry_capability_undo"])("gates %s digests and reminders before generic tenant overrides", async kind => {
    requests=[]; events=new Map([["evt-1",ev({type:"change_request",metadata:{kind}})]]);
    const svc=service(undefined,async()=>false); await svc.list(OWNER,WS);
    const item=[...mem.items.values()][0]!;
    await svc.chase(); expect(sendEmail).not.toHaveBeenCalled();
    mem.items.set(item.id,{...item,deliveryState:"sent"}); clock.now+=4*DAY;
    await svc.chase(); expect(sendEmail).not.toHaveBeenCalled();
    expect([...mem.items.values()][0]?.deliveries.at(-1)).toMatchObject({status:"suppressed",reason:"inquiry_email_gates_off"});
  });
  it("gates inquiry fact digests and reminders while generic review notices retain their path", async () => {
    requests=[]; events.clear();
    const item:ProposedItem={kind:"fact.inferred",route:"owner_decides",title:"Confirm website fact",approveEffect:"Confirm",notYetEffect:"Nothing",sourceLifecycle:"inquiry_fact",sourceId:"fact",revisionHash:"a".repeat(64),urgent:false,adminMayDecide:false};
    const adapter:SourceAdapter={lifecycle:"inquiry_fact",needsMemberActor:false,propose:async()=>({items:[item],complete:true}),currentRevision:async()=>item.revisionHash,resolve:async()=>({outcome:"done"})};
    const original=mem.store.dueForDelivery; mem.store.dueForDelivery=async limit=>(await original(limit)).map(row=>({...row,recipient:row.recipient?{...row.recipient,tenantId:null}:null}));
    const gates=vi.fn(async()=>false); const svc=service([adapter],gates); await svc.list(OWNER,WS); await svc.chase(); expect(sendEmail).not.toHaveBeenCalled(); expect(gates).toHaveBeenCalledWith(null);
    const opened=[...mem.items.values()][0]!; mem.items.set(opened.id,{...opened,deliveryState:"sent"}); clock.now+=4*DAY;
    await svc.chase(); expect(sendEmail).not.toHaveBeenCalled();
    expect([...mem.items.values()][0]?.deliveries.at(-1)).toMatchObject({status:"suppressed",reason:"inquiry_email_gates_off"});
    events=new Map([["evt-1",ev({})]]); mem=memoryStore(clock); await service(undefined,async()=>false).chase(); expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("durable urgent inquiry owner notices", () => {
  it.each(["inquiry_capability_publish", "inquiry_capability_undo"])("keeps %s owner-only even when its old event was operator-routed", kind => {
    const item = tenantEventItem(ev({ type: "change_request", metadata: { kind, reviewAudience: "operator" } }));
    expect(item).toMatchObject({ route: "owner_decides", adminMayDecide: false });
  });
  it("a configured business owner cannot erase the source tenant's disabled mail override", async () => {
    inquiryService(); const original=mem.store.dueForDelivery;
    mem.store.dueForDelivery=async limit=>(await original(limit)).map(row=>({...row,recipient:row.recipient?{...row.recipient,tenantId:null}:null}));
    const allowed=vi.fn(async (tenantId:string|null)=>tenantId!=="fixture-firm");
    const closed=service(undefined,allowed);
    expect(await deliver(closed)).toBe("suppressed"); expect(allowed).toHaveBeenCalledWith("fixture-firm"); expect(sendEmail).not.toHaveBeenCalled();
  });
  it("sends an allowed urgent notice with its source tenant even when the configured owner has no tenant context",async()=>{
    const svc=inquiryService(); const original=mem.store.dueForDelivery;
    mem.store.dueForDelivery=async limit=>(await original(limit)).map(row=>({...row,recipient:row.recipient?{...row.recipient,tenantId:null}:null}));
    expect(await deliver(svc)).toBe("suppressed"); // The fake transport suppresses; it still exposes the send context.
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({tenantId:"fixture-firm"}));
  });
  it("checks every inquiry origin before sending a multi-site digest", async()=>{
    events.clear(); requests=[];
    const proposals:ProposedItem[]=["fixture-firm","other-site"].map(tenant=>({kind:"system.go_live",route:"owner_decides",title:"Publish",approveEffect:"Publishes",notYetEffect:"Nothing",sourceLifecycle:"tenant_event",sourceId:`${tenant}:publish`,revisionHash:"a".repeat(64),urgent:false,adminMayDecide:false}));
    const adapter:SourceAdapter={lifecycle:"tenant_event",needsMemberActor:false,propose:async()=>({items:proposals,complete:true}),currentRevision:async()=>"a".repeat(64),inquiryEmailSource:async()=>true,resolve:async()=>({outcome:"done"})};
    const allowed=vi.fn(async(tenantId:string|null)=>tenantId!=="other-site"); const svc=service([adapter],allowed);
    await svc.list(OWNER,WS); await svc.chase();
    expect(allowed).toHaveBeenCalledWith("fixture-firm"); expect(allowed).toHaveBeenCalledWith("other-site"); expect(sendEmail).not.toHaveBeenCalled();
  });
  function inquiryService() {
    requests = [];
    clock.now = Date.parse("2026-10-06T15:00:00Z");
    events = new Map([["evt-1", ev({ type: "change_request", metadata: {
      kind: "inquiry_delivery_approval", inquiryId: "lead_fixture", action: "reply",
      subject: "Party", messageBody: "We can host 30 guests for $40 each.",
    } })]]);
    return service(undefined, async () => true);
  }
  const deliver = (svc: ReturnType<typeof service>) => svc.deliverUrgentSource(WS, "tenant_event", "fixture-firm:evt-1");

  it("serializes immediate delivery against another immediate call and the chase", async () => {
    const svc = inquiryService();
    let started!: () => void;
    const inProvider = new Promise<void>(resolve => { started = resolve; });
    let accept!: (result: SendEmailResult) => void;
    sendEmail.mockImplementationOnce(async () => { started(); return new Promise<SendEmailResult>(resolve => { accept = resolve; }); });
    const first = deliver(svc);
    await inProvider;
    expect(await deliver(svc)).toBe("failed");
    await svc.chase();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    accept({ status: "accepted", providerMessageId: "msg-race", acceptedAt: new Date(clock.now).toISOString() });
    expect(await first).toBe("sent");
    expect(await deliver(svc)).toBe("sent");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("keeps acceptance closed when its durable checkpoint fails past provider idempotency expiry", async () => {
    const svc = inquiryService();
    sendEmail.mockResolvedValue({ status: "accepted", providerMessageId: "msg-accepted", acceptedAt: new Date(clock.now).toISOString() });
    mem.store.finishInquiryNotice = vi.fn().mockRejectedValue(new Error("database down"));
    expect(await deliver(svc)).toBe("sent");
    expect([...mem.noticeClaims.values()]).toEqual(["sending"]);
    clock.now += 2 * DAY;
    expect(await deliver(svc)).toBe("failed");
    await svc.chase();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("never retries an ambiguous provider response or calls it sent", async () => {
    const svc = inquiryService();
    sendEmail.mockRejectedValue(new Error("provider response lost"));
    expect(await deliver(svc)).toBe("failed");
    expect([...mem.noticeClaims.values()]).toEqual(["unknown"]);
    clock.now += 2 * DAY;
    expect(await deliver(svc)).toBe("failed");
    await svc.chase();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("reports a bounced decision as failed without a new email", async () => {
    const svc = inquiryService();
    await svc.list(OWNER, WS);
    const row = [...mem.items.values()][0]!;
    mem.items.set(row.id, { ...row, deliveryState: "bounced" });
    expect(await deliver(svc)).toBe("failed");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("fails closed without the durable claim port", async () => {
    const svc = inquiryService();
    delete mem.store.claimInquiryNotice;
    expect(await deliver(svc)).toBe("suppressed");
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
