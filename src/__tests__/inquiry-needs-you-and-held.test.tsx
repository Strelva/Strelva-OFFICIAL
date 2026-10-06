import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { UnifiedEvent } from "@/lib/types";
import { commitmentSignals } from "@/platform/needs-you/inquiry-policy";
import { classifyTenantEvent } from "@/platform/needs-you/tenant-classify";
import { tenantEventItem } from "@/platform/needs-you/adapters";
import { evaluateRoute } from "@/platform/needs-you/evaluator";
import { readWorkspaceLeads, type LeadDependencies } from "@/products/inquiries/linked-leads";
import { WorkspaceInquiries } from "@/experience/places/WorkspaceInquiries";
import { heldErrorMessage } from "@/experience/places/HeldInquiryActions";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import type { WorkspaceInquiryLead } from "@/products/inquiries/workspace-records";
import { createRedisInquiryDeliveryStore } from "@/products/inquiries/delivery-store";
import { setInquiryRecordsDb } from "@/lib/inquiry-records";
import type { LeadMirrorDb } from "@/lib/lead-mirror";
import { makeRedisMock } from "./support/redis-mock";

function review(body: string, extra: Record<string, unknown> = {}): UnifiedEvent {
  return {
    id: "evt_1", tenantId: "mclears", type: "change_request", status: "pending", title: "Reply to Dana", body: "Draft reply",
    createdAt: "2026-10-06T10:00:00.000Z",
    metadata: { kind: "inquiry_delivery_approval", reviewAudience: "owner", subject: "Your party", messageBody: body, ...extra },
  } as unknown as UnifiedEvent;
}

describe("the inquiry policy in Needs you", () => {
  it("finds a price, a date or a promise in a drafted reply", () => {
    expect(commitmentSignals("We can host 30 guests at $45 per head.")).toEqual(["price"]);
    expect(commitmentSignals("Saturday at 7pm works.")).toEqual(["date"]);
    expect(commitmentSignals("We'll hold the back room for you.")).toEqual(["promise"]);
    expect(commitmentSignals("The deposit is 200, due Nov 14. Your table is reserved.")).toEqual(["price", "date", "promise"]);
    expect(commitmentSignals("Thanks for reaching out! We'd love to hear more about your party.")).toEqual([]);
    expect(commitmentSignals("I sat down with the team and we'd love to chat.")).toEqual([]);
  });

  it("a reply that quotes a price is a commitment: owner decides, urgent, owner only, even when Strelva was reviewing it", () => {
    const quoted = review("We can do the private room for $40 per person.");
    expect(classifyTenantEvent(quoted)?.kind).toBe("customer.commitment");
    expect(tenantEventItem(quoted)).toMatchObject({ kind: "customer.commitment", route: "owner_decides", urgent: true, adminMayDecide: false });
    const operatorReviewed = review("Booked! See you Saturday.", { reviewAudience: "operator" });
    expect(tenantEventItem(operatorReviewed)).toMatchObject({ kind: "customer.commitment", route: "owner_decides", adminMayDecide: false });
  });

  it("a plain reply stays a customer message on its observed route", () => {
    const plain = review("Thanks Dana, we'd love to host you. What did you have in mind?");
    expect(tenantEventItem(plain)).toMatchObject({ kind: "customer.message", route: "owner_decides", adminMayDecide: true });
    expect(tenantEventItem(review("Thanks Dana, tell us more.", { reviewAudience: "operator" }))).toMatchObject({ kind: "customer.message", route: "strelva_reviews", urgent: false });
  });

  it("no inquiry policy decision or trust moves a commitment; a message follows the policy above its floor", () => {
    expect(evaluateRoute({ kind: "customer.commitment", origin: "strelva", signals: { inquiryDecision: "allow" } }).route).toBe("owner_decides");
    expect(evaluateRoute({ kind: "customer.message", origin: "strelva", signals: { inquiryDecision: "allow" } }).route).toBe("strelva_reviews");
    expect(evaluateRoute({ kind: "customer.message", origin: "strelva", signals: { inquiryDecision: "approval_required" } }).route).toBe("owner_decides");
  });
});

const WS = "7f000000-0000-4000-8000-000000000010";
const ACTOR = { userId: "7f000000-0000-4000-8000-000000000002", verifiedEmail: "owner@example.test" };
const site = { tenantId: "mclears", tenantStableId: "7f000000-0000-4000-8000-0000000000b2", siteName: "McClear's" };
const row = (patch: Partial<WorkspaceInquiryLead>): WorkspaceInquiryLead => ({
  id: "7f000000-0000-4000-8000-0000000000d1", tenantId: "mclears", leadId: "lead_spam_a", name: "Ana", email: "ana@example.test", message: "gluten free?",
  source: "v1-leads", fields: {}, intakeState: "held_as_spam", heldReason: "content-score", intakeStateAt: null, contactId: null,
  capturedAt: "2026-10-05T10:00:00.000Z", ...patch,
});

describe("held spam on the workspace Inquiries page", () => {
  const deps = (patch: Partial<LeadDependencies> = {}): LeadDependencies => ({
    sites: async () => ({ sites: [site], denied: [] }),
    storeReady: () => true,
    leads: async () => [{ id: "lead_1", name: "Dana", email: "dana@example.test", createdAt: "2026-10-04T10:00:00.000Z" }],
    now: () => Date.parse("2026-10-06T12:00:00Z"),
    ...patch,
  });
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("lists held items and merges released ones into the site's inbox", async () => {
    const released = row({ id: "7f000000-0000-4000-8000-0000000000d2", leadId: "lead_spam_b", name: "Marta", intakeState: "released", capturedAt: "2026-10-05T12:00:00.000Z" });
    const otherSite = row({ id: "7f000000-0000-4000-8000-0000000000d3", tenantId: "not-mine" });
    const result = await readWorkspaceLeads(ACTOR, WS, deps({ records: async () => ({ held: [row({}), otherSite], released: [released] }) }));
    expect(result.held).toEqual({ items: [expect.objectContaining({ rowId: row({}).id, reason: "content-score" })], unavailable: false });
    expect(result.sites[0]!.leads.map((lead) => [lead.id, lead.releasedRowId ?? null])).toEqual([["lead_spam_b", released.id], ["lead_1", null]]);
  });

  it("shows nothing new when the switch is off", async () => {
    const result = await readWorkspaceLeads(ACTOR, WS, deps({ records: () => null }));
    expect(result).not.toHaveProperty("held");
  });

  it("a failed held read is unavailable, never an empty list; a refusal passes through", async () => {
    const result = await readWorkspaceLeads(ACTOR, WS, deps({ records: async () => { throw new Error("pg down"); } }));
    expect(result.held).toEqual({ items: [], unavailable: true });
    expect(result.sites[0]!.leads).toHaveLength(1);
    await expect(readWorkspaceLeads(ACTOR, WS, deps({ records: async () => { throw new WorkspaceAccessError(); } }))).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("renders held items with Release and It's spam, and released ones with Move back", () => {
    const html = renderToStaticMarkup(<WorkspaceInquiries workspaceId={WS} state={{ kind: "ready", data: {
      denied: [],
      sites: [{ key: "mclears", tenantId: "mclears", siteName: "McClear's", lastThirtyDays: 1, unavailable: false,
        leads: [{ id: "lead_spam_b", releasedRowId: "r2", name: "Marta", email: null, message: "Bread?", source: null, fields: [], createdAt: "2026-10-05T12:00:00.000Z" }] }],
      held: { items: [{ rowId: "r1", tenantId: "mclears", name: "Ana", email: "ana@example.test", message: "gluten free?", reason: "honeypot", createdAt: "2026-10-05T10:00:00.000Z" }], unavailable: false },
    } }} />);
    expect(html).toContain("Held as spam");
    expect(html).toContain("Not spam, release it");
    expect(html).toContain("It&#x27;s spam");
    expect(html).toContain("Filled in a field people can&#x27;t see");
    expect(html).toContain("Move back to held");
    const empty = renderToStaticMarkup(<WorkspaceInquiries workspaceId={WS} state={{ kind: "ready", data: { denied: [], sites: [], held: { items: [], unavailable: false } } }} />);
    expect(empty).not.toContain("Held as spam");
    const failed = renderToStaticMarkup(<WorkspaceInquiries workspaceId={WS} state={{ kind: "ready", data: { denied: [], sites: [], held: { items: [], unavailable: true } } }} />);
    expect(failed).toContain("Held messages couldn&#x27;t be read right now");
  });

  it("explains a refusal in the owner's words", () => {
    expect(heldErrorMessage(403, null)).toBe("Only the business owner can decide on held messages. Nothing changed.");
    expect(heldErrorMessage(404, null)).toBe("This message is no longer here.");
    expect(heldErrorMessage(503, { error: "The decision couldn't be saved. Nothing changed." })).toBe("The decision couldn't be saved. Nothing changed.");
  });
});

describe("delivery, reply and timeline copies into inquiry_events", () => {
  afterEach(() => {
    setInquiryRecordsDb(undefined);
    vi.unstubAllEnvs();
  });

  it("copies each once with a stable key and never fails the Redis write", async () => {
    vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1");
    const rpc = vi.fn(async () => ({ data: { status: "recorded" }, error: null }));
    setInquiryRecordsDb({ rpc } as unknown as LeadMirrorDb);
    const store = createRedisInquiryDeliveryStore(makeRedisMock() as never);
    await store.appendTimeline({ tenantId: "mclears", inquiryId: "lead_a", type: "received" as never, summary: "Inquiry received", outcome: "recorded", at: "2026-10-06T10:00:00.000Z" });
    await store.markReplyReceived({ tenantId: "mclears", inquiryId: "lead_a", providerMessageId: "m1", providerEventId: "e1", receivedAt: "2026-10-06T11:00:00.000Z" });
    const keys = (rpc.mock.calls as unknown as Array<[string, Record<string, unknown>]>).filter(([n]) => n === "record_inquiry_event").map(([, a]) => [a.p_kind, a.p_dedupe_key]);
    expect(keys[0]![0]).toBe("timeline");
    expect(String(keys[0]![1])).toMatch(/^timeline:[a-f0-9]{64}$/);
    expect(keys[1]).toEqual(["reply", "reply:e1"]);
    rpc.mockImplementation(async () => { throw new Error("pg down"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(store.appendTimeline({ tenantId: "mclears", inquiryId: "lead_a", type: "received" as never, summary: "Again", outcome: "recorded" })).resolves.toBeUndefined();
  });
});
