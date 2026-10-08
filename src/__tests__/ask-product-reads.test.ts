import { describe, expect, it, vi } from "vitest";
import { readAskBookingSummary, type AskBookingReadDependencies } from "@/products/bookings/ask-read";
import { readAskInquirySummary, type AskInquiryReadDependencies } from "@/products/inquiries/ask-read";
import { WorkspaceAccessError, type SavedWork } from "@/platform/workspaces/types";
import { businessRecordSchema } from "@/platform/business-record/contracts";
import type { BookingRow, WorkspaceBookings } from "@/products/bookings/server";
import type { WorkspaceLeads } from "@/products/inquiries/linked-leads";
import type { InquiryDeliveryCheckpoint } from "@/products/inquiries/delivery-types";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const workId = "22222222-2222-4222-8222-222222222222";
const actor = { userId: "33333333-3333-4333-8333-333333333333", verifiedEmail: "owner@example.test" };
const now = new Date("2026-10-07T12:00:00.000Z");
const business = businessRecordSchema.parse({ workspaceId, access: "owner", revision: 3, lastSequence: 3, updatedAt: now.toISOString(), facts: {}, services: [], people: [], contactCount: 0 });
const legacyRow = (id: string, patch: Partial<BookingRow> = {}): BookingRow => ({ id, date: "2026-10-08", startTime: "13:00", endTime: "14:00", clientName: "Customer", clientEmail: "customer@example.test", clientPhone: "", serviceName: "Consulting", status: "confirmed", ...patch });
function bookingDeps() {
  const legacy: WorkspaceBookings = { view: "week", from: "2026-10-07", to: "2026-11-06", sites: [{ tenantId: "example", siteName: "Example", timezone: "UTC", today: "2026-10-07", unavailable: false, bookings: [legacyRow("one"), legacyRow("one"), legacyRow("cancel", { status: "cancelled" }), legacyRow("done", { status: "completed" }), legacyRow("past", { date: "2026-10-06" }), legacyRow("later", { date: "2026-11-10" }), legacyRow("request", { status: "requested" })] }] };
  const work: SavedWork[] = [{ id: workId, workspaceId, productId: "scheduling", resourceKind: "schedule", title: "Consulting", input: {}, createdBy: actor.userId, createdAt: now.toISOString(), updatedAt: now.toISOString(), payload: { version: 1, revision: 4, title: "Consulting", createdBy: actor.userId, createdAt: now.toISOString(), history: [], availability: [], reservations: [{ requestId: "public-one", title: "Consulting", start: "2026-10-08T15:00:00Z", end: "2026-10-08T16:00:00Z", status: "accepted", verification: "pending" }, { requestId: "cancelled", title: "Consulting", start: "2026-10-08T15:00:00Z", end: "2026-10-08T16:00:00Z", status: "accepted" }] } }];
  const receipts = { truncated: false, rows: [{ id: "receipt-one", workId, requestId: "public-one", tenantId: "example", title: "Consulting", start: "2026-10-08T15:00:00Z", status: "confirmed" as const }, { id: "receipt-cancel", workId, requestId: "cancelled", tenantId: "example", title: "Consulting", start: "2026-10-08T15:00:00Z", status: "cancelled" as const }] };
  const deps: AskBookingReadDependencies = { member: vi.fn(async () => {}), legacy: vi.fn(async () => legacy), work: vi.fn(async () => work), publicReceipts: vi.fn(async () => receipts), business: vi.fn(async () => business) };
  return { deps, legacy, work, receipts };
}
describe("Ask booking reads", () => {
  it("counts distinct future confirmations, separating requests and overriding schedule with public cancellation", async () => {
    const h = bookingDeps();
    const result = await readAskBookingSummary(actor, workspaceId, now, h.deps);
    expect(result).toMatchObject({ complete: true, upcomingCount: 2, pendingCount: 1, unknownCount: 0, businessRecord: { revision: 3 } });
    expect(result.bookings.map(row => row.id)).toEqual(["legacy:example:one", "legacy:example:request", `schedule:${workId}:public-one`]);
    expect(result.range).toMatchObject({ from: now.toISOString(), to: "2026-11-06T12:00:00.000Z" });
    expect(result.sourceProof).toContain("no live calendar check");
  });
  it("compares same-day legacy starts using each site's timezone", async () => {
    const h = bookingDeps();
    h.legacy.sites[0]!.timezone = "America/New_York";
    h.legacy.sites[0]!.bookings = [legacyRow("past", { date: "2026-10-07", startTime: "07:59" }), legacyRow("future", { date: "2026-10-07", startTime: "08:01" })];
    const result = await readAskBookingSummary(actor, workspaceId, now, h.deps);
    expect(result.bookings.filter(row => row.source === "legacy").map(row => row.id)).toEqual(["legacy:example:future"]);
  });
  it.each(["legacy", "work", "publicReceipts", "business"] as const)("reports %s failure as unknown rather than zero", async source => {
    const h = bookingDeps();
    vi.mocked(h.deps[source]).mockRejectedValueOnce(new Error("unavailable"));
    expect(await readAskBookingSummary(actor, workspaceId, now, h.deps)).toMatchObject({ complete: false, upcomingCount: null });
  });
  it("propagates authority denial before reading any stores", async () => {
    const h = bookingDeps(); vi.mocked(h.deps.member).mockRejectedValueOnce(new WorkspaceAccessError());
    await expect(readAskBookingSummary(actor, workspaceId, now, h.deps)).rejects.toBeInstanceOf(WorkspaceAccessError);
    for (const spy of [h.deps.legacy, h.deps.work, h.deps.publicReceipts, h.deps.business]) expect(spy).not.toHaveBeenCalled();
  });
  it("does not claim confirmed count when native provider acceptance is unresolved", async () => {
    const h = bookingDeps();
    const payload = h.work[0]!.payload as { reservations: Array<{ status: string }> };
    payload.reservations.push({ status: "unknown", requestId: "ambiguous", title: "Uncertain", start: "2026-10-09T12:00:00Z", end: "2026-10-09T13:00:00Z" } as never);
    expect(await readAskBookingSummary(actor, workspaceId, now, h.deps)).toMatchObject({ complete: false, upcomingCount: null, unknownCount: 1 });
  });
});

function inquiryDeps() {
  const leads: WorkspaceLeads = { sites: [{ key: "example", tenantId: "example", siteName: "Example", unavailable: false, lastThirtyDays: 3, leads: ["new", "sent", "handled", "bounced", "reply", "unknown"].map(id => ({ id, name: id, email: `${id}@example.test`, message: "Question", source: "form", fields: [], createdAt: "2026-10-06T12:00:00Z" })) }], denied: [], held: { items: [{ rowId: "spam", tenantId: "example", name: "Held", email: null, message: "Spam", reason: "held", createdAt: now.toISOString() }], unavailable: false } };
  const checkpoint = (id: string, status: InquiryDeliveryCheckpoint["status"]): InquiryDeliveryCheckpoint => ({ tenantId: "example", inquiryId: id, action: "reply", status, attemptId: "attempt", attempts: 1, startedAt: "2026-10-06T13:00:00Z", acceptedAt: ["accepted", "bounced"].includes(status) ? "2026-10-06T13:00:00Z" : undefined });
  const deps: AskInquiryReadDependencies = {
    member: vi.fn(async () => {}), leads: vi.fn(async () => leads),
    repository: { getSnapshot: vi.fn(async () => null), getRecordOverlays: vi.fn(async () => [{ tenantId: "example", tenantStableId: null, businessId: workspaceId, inquiryId: "handled", capabilityId: "form", status: "handled" as const, assigneeId: null, updatedBy: actor.userId, createdAt: now.toISOString(), updatedAt: now.toISOString() }]) },
    delivery: { getCheckpoint: vi.fn(async input => input.action !== "reply" ? null : input.inquiryId === "sent" || input.inquiryId === "reply" ? checkpoint(input.inquiryId, "accepted") : input.inquiryId === "bounced" ? checkpoint(input.inquiryId, "bounced") : input.inquiryId === "unknown" ? checkpoint(input.inquiryId, "unknown") : null), getReplyState: vi.fn(async input => input.inquiryId === "reply" ? { ...input, providerMessageId: "message", providerEventId: "event", receivedAt: "2026-10-06T14:00:00Z" } : null) },
  };
  return { deps, leads };
}
describe("Ask inquiry reads", () => {
  it("uses accepted message and native handled evidence, not capture state; newer customer reply needs response", async () => {
    const h = inquiryDeps();
    const result = await readAskInquirySummary(actor, workspaceId, now, h.deps);
    expect(result).toMatchObject({ complete: false, recentCount: 6, unansweredCount: null, observedUnanswered: 2, needsAttentionCount: 1, unknownCount: 1 });
    expect(Object.fromEntries(result.inquiries.map(row => [row.id, row.answerState]))).toEqual({ new: "unanswered", sent: "answered", handled: "handled", bounced: "needs_attention", reply: "customer_replied", unknown: "unknown" });
    expect(result.held.items).toHaveLength(1);
    expect(h.deps.delivery.getCheckpoint).not.toHaveBeenCalledWith(expect.objectContaining({ inquiryId: "spam" }));
  });
  it("counts known unanswered only within the declared recent range and deduplicates captures", async () => {
    const h = inquiryDeps();
    const first = h.leads.sites[0]!.leads[0]!;
    h.leads.sites[0]!.leads = [first, first, { ...first, id: "old", createdAt: "2026-08-01T00:00:00Z" }];
    expect(await readAskInquirySummary(actor, workspaceId, now, h.deps)).toMatchObject({ complete: true, recentCount: 1, unansweredCount: 1 });
  });
  it("does not turn failed message or overlay reads into unanswered", async () => {
    const h = inquiryDeps();
    vi.mocked(h.deps.delivery.getCheckpoint).mockRejectedValue(new Error("delivery unavailable"));
    expect(await readAskInquirySummary(actor, workspaceId, now, h.deps)).toMatchObject({ complete: false, unansweredCount: null, observedUnanswered: 0, unknownCount: 6 });
    vi.mocked(h.deps.repository.getRecordOverlays).mockRejectedValueOnce(new Error("native state unavailable"));
    expect(await readAskInquirySummary(actor, workspaceId, now, h.deps)).toMatchObject({ complete: false, unansweredCount: null, unknownCount: 6 });
  });
  it("does not show capture outage as an empty inbox", async () => {
    const h = inquiryDeps(); vi.mocked(h.deps.leads).mockRejectedValueOnce(new Error("capture unavailable"));
    expect(await readAskInquirySummary(actor, workspaceId, now, h.deps)).toMatchObject({ complete: false, recentCount: null, unansweredCount: null });
    expect(h.deps.delivery.getCheckpoint).not.toHaveBeenCalled();
  });
  it("checks authority before capture, native state and cached message reads", async () => {
    const h = inquiryDeps(); vi.mocked(h.deps.member).mockRejectedValueOnce(new WorkspaceAccessError());
    await expect(readAskInquirySummary(actor, workspaceId, now, h.deps)).rejects.toBeInstanceOf(WorkspaceAccessError);
    for (const spy of [h.deps.leads, h.deps.repository.getSnapshot, h.deps.repository.getRecordOverlays, h.deps.delivery.getCheckpoint]) expect(spy).not.toHaveBeenCalled();
  });
});
