import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OwnerDecision, ProposedItem } from "@/platform/needs-you/contracts";
import type { ResolveBy } from "@/platform/needs-you/adapters";
import { PublicBookingError } from "@/platform/bookings/errors";
import { appIntakeLiveAdapter, appIntakeVisitAdapter, visitWhen, type AppIntakeNeedsPorts } from "@/server/needs-you/sources/app-intake";
import { intakeInstallConfigSchema } from "@/products/vertical-intake";
import type { IntakeVisit, IntakeVisitRead, VerticalIntakeStore } from "@/products/vertical-intake/server";

const captured = vi.hoisted(() => ({ deps: null as null | { emailAllowed(row: { sourceLifecycle: string; workspaceId: string; sourceId: string }): Promise<boolean> } }));
vi.mock("@/platform/needs-you/service", () => ({ createNeedsYouService: (deps: never) => { captured.deps = deps; return {}; } }));

const WS = "aaaaaaaa-0000-4000-8000-000000000001";
const INSTALL = "bbbbbbbb-0000-4000-8000-000000000001";
const SUBMISSION = "cccccccc-0000-4000-8000-000000000001";
const BOOKING = "dddddddd-0000-4000-8000-000000000001";
const OWNER = { userId: "aaaaaaaa-0000-4000-8000-0000000000a1", verifiedEmail: "owner@example.test" };
const session: ResolveBy = { kind: "session", actor: OWNER };
const ctx = { workspaceId: WS, actor: OWNER };
const NOW = new Date("2026-10-20T12:00:00Z"); // Tue 8:00 AM in New York
const FACTS = { display_name: "North Dental", phone: "716-555-0100", insurance_accepted: { carriers: ["Delta Dental PPO", "Cigna"] } };
const SLOTS = [
  { id: "a", start: "2026-10-20T13:00:00Z", end: "2026-10-20T14:00:00Z", calendarChecked: true }, // too soon
  { id: "b", start: "2026-10-20T19:00:00Z", end: "2026-10-20T20:00:00Z", calendarChecked: true }, // Tue 3pm
  { id: "c", start: "2026-10-22T14:00:00Z", end: "2026-10-22T15:00:00Z", calendarChecked: true }, // Thu 10am
];

function asItem(p: ProposedItem, over: Partial<OwnerDecision> = {}): OwnerDecision {
  return {
    id: randomUUID(), workspaceId: WS, systemId: p.systemId ?? null, kind: p.kind, route: p.route, title: p.title, detail: p.detail ?? null,
    approveEffect: p.approveEffect, notYetEffect: p.notYetEffect, sourceLifecycle: p.sourceLifecycle, sourceId: p.sourceId,
    revisionHash: p.revisionHash, urgent: p.urgent, signInRequired: false, adminMayDecide: p.adminMayDecide, openHref: p.openHref ?? null,
    state: "approved", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null, deliveryState: "not_sent",
    operatorNote: null, openedAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 14 * 86400000).toISOString(),
    reminded1At: null, reminded2At: null, deliveries: [], ...over,
  } as unknown as OwnerDecision;
}

const visit = (over: Partial<IntakeVisit> = {}): IntakeVisit => ({
  submissionId: SUBMISSION, name: "Pat Lee", email: "pat@example.test", phone: "716 555 0111",
  answers: { patient_status: "new", reason: "checkup", insurance_carrier: "p_delta_dental_ppo", preferred_days: "thu", preferred_times: "morning", note: "Thanks!" },
  triage: "routine", state: "new", bookingId: null, createdAt: NOW.toISOString(), bookingServiceId: "svc-exam", ...over,
});

function setup(options: { visits?: IntakeVisit[]; enabled?: boolean; manual?: boolean; slots?: () => Promise<unknown>; emailOn?: boolean } = {}) {
  const visits = options.visits ?? [visit()];
  const store = {
    listOpenVisits: vi.fn(async () => ({ facts: FACTS, visits })),
    readVisit: vi.fn(async (_ws: string, id: string): Promise<IntakeVisitRead | null> => { const found = visits.find(v => v.submissionId === id); return found ? { ...found, facts: FACTS } : null; }),
    decideVisit: vi.fn(async () => ({ submissionId: SUBMISSION, state: "visit_booked", bookingId: BOOKING })),
    listLiveRequests: vi.fn(async () => ({ facts: FACTS, requests: [{ installId: INSTALL, appId: "dental_intake" as const, draftRevision: 3, draftConfig: intakeInstallConfigSchema.parse({ bookingServiceId: "svc-exam" }), liveRelease: null, requestedAt: "2026-10-20T11:00:00Z" }] })),
    withdrawLiveRequest: vi.fn(async () => undefined),
    makeLive: vi.fn(async () => ({ install: {} as never, release: 1 })),
    recordLiveCheck: vi.fn(async () => undefined),
  } as unknown as VerticalIntakeStore;
  const booking = { id: BOOKING, status: "requested" };
  const ports = {
    enabled: vi.fn(async () => options.enabled ?? true),
    store,
    services: vi.fn(async () => ({ timeZone: "America/New_York", paused: false, services: [{ id: "svc-exam", name: "New patient exam" }] })),
    slots: vi.fn(options.slots ?? (async () => ({ version: 1, timeZone: "America/New_York", paused: false, slots: SLOTS }))),
    manualOn: vi.fn(async () => options.manual ?? true),
    book: vi.fn(async () => ({ booking, created: true })),
    decide: vi.fn(async () => ({ status: "decided" as const, booking: { ...booking, status: "confirmed" } })),
    afterDecision: vi.fn(async () => undefined),
    site: vi.fn(async () => ({ url: "https://north.example/visit", siteKey: "sk_pub_abcdefghijklmnopqrstuvwx" })),
    checkPage: vi.fn(async (input: { url: string; release: number | null }) => ({ state: "found" as const, checkedAt: NOW.toISOString(), url: input.url, release: input.release })),
    emailOn: vi.fn(() => options.emailOn ?? false),
    now: () => NOW,
  } as unknown as AppIntakeNeedsPorts;
  return { ports, store, live: appIntakeLiveAdapter(ports), visitAdapter: appIntakeVisitAdapter(ports) };
}

afterEach(() => vi.unstubAllEnvs());

describe("the Make it live source", () => {
  it("proposes an owner-only go-live item with the Release number", async () => {
    const { live } = setup();
    const { items, complete } = await live.propose(ctx);
    expect(complete).toBe(true);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "system.go_live", route: "owner_decides", adminMayDecide: false, urgent: false, sourceLifecycle: "app_intake_live", sourceId: INSTALL,
      title: "Make Dental intake live on your website: Release 1",
      detail: "9 questions · Member ID not asked",
      approveEffect: "Patients can send the Dental intake form on your website. Strelva records this Release and checks your live page.",
      notYetEffect: "Nothing on your website changes. The form stays as it is now.",
      openHref: `/workspace/inquiries?workspaceId=${WS}#dental-intake`,
    });
  });

  it("reads nothing while the flag is off", async () => {
    const { live, store } = setup({ enabled: false });
    expect(await live.propose(ctx)).toEqual({ items: [], complete: true });
    expect(await live.currentRevision(ctx, INSTALL)).toBeNull();
    expect(store.listLiveRequests).not.toHaveBeenCalled();
  });

  it("shows the whole review, including that the member ID is not asked and patients aren't emailed", async () => {
    const { live } = setup();
    const item = asItem((await live.propose(ctx)).items[0]!);
    const lines = (await live.review!(ctx, item))!;
    expect(lines).toContain("Member ID: not asked");
    expect(lines).toContain("Patients aren't emailed. The office calls them back.");
    expect(lines).toContain("Visits are proposed for: New patient exam");
    expect(lines).toContain("Insurance plans shown: Delta Dental PPO, Cigna");
    expect(await live.review!(ctx, { ...item, revisionHash: "stale" })).toBeNull();
  });

  it("approve with a session makes it live under the decision id, then checks the page", async () => {
    const { live, store, ports } = setup();
    const item = asItem((await live.propose(ctx)).items[0]!);
    const result = await live.resolve(ctx, item, "approve", session);
    expect(store.makeLive).toHaveBeenCalledWith({ workspaceId: WS, installId: INSTALL, draftRevision: 3, ownerDecisionId: item.id, userId: OWNER.userId, verifiedEmail: OWNER.verifiedEmail });
    expect(ports.checkPage).toHaveBeenCalledWith({ url: "https://north.example/visit", siteKey: "sk_pub_abcdefghijklmnopqrstuvwx", appId: "dental_intake", release: 1 });
    expect(store.recordLiveCheck).toHaveBeenCalledWith(INSTALL, expect.objectContaining({ state: "found" }));
    expect(result).toEqual({ outcome: "done", receiptRef: `app_intake_release:${INSTALL}:1` });
  });

  it("is done_unverified when the live page does not show the form", async () => {
    const { live, ports } = setup();
    (ports.checkPage as ReturnType<typeof vi.fn>).mockResolvedValue({ state: "not_seen", checkedAt: NOW.toISOString(), url: "https://north.example/visit", release: 1 });
    const item = asItem((await live.propose(ctx)).items[0]!);
    expect(await live.resolve(ctx, item, "approve", session)).toMatchObject({ outcome: "done_unverified", reason: "Release recorded. We couldn't see the form on your live page yet." });
  });

  it("still records the Release when the check can't run", async () => {
    const { live, ports } = setup();
    (ports.checkPage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    const item = asItem((await live.propose(ctx)).items[0]!);
    expect((await live.resolve(ctx, item, "approve", session)).outcome).toBe("done_unverified");
  });

  it("not yet and a lapse withdraw the request", async () => {
    const { live, store } = setup();
    const item = asItem((await live.propose(ctx)).items[0]!);
    expect((await live.resolve(ctx, item, "not_yet", session)).outcome).toBe("done");
    expect((await live.resolve(ctx, item, "approve", { kind: "expiry" })).outcome).toBe("done");
    expect(store.withdrawLiveRequest).toHaveBeenCalledTimes(2);
    expect(store.makeLive).not.toHaveBeenCalled();
  });

  it("approving by link without an account fails with the sign-in message", async () => {
    const { live, store } = setup();
    const item = asItem((await live.propose(ctx)).items[0]!);
    expect(await live.resolve(ctx, item, "approve", { kind: "owner_link", recipient: "owner@example.test", actor: null })).toEqual({ outcome: "failed", reason: "Sign in to make this live." });
    expect(store.makeLive).not.toHaveBeenCalled();
  });

  it("refuses an approval from a changed draft", async () => {
    const { live, store } = setup();
    const item = asItem((await live.propose(ctx)).items[0]!, { revisionHash: "old" });
    expect(await live.resolve(ctx, item, "approve", session)).toEqual({ outcome: "failed", reason: "source_changed" });
    expect(store.makeLive).not.toHaveBeenCalled();
  });
});

describe("the new patient visit source", () => {
  it("proposes the slot that matches the patient's days and times, with the title formatted", async () => {
    const { visitAdapter } = setup();
    const { items, complete } = await visitAdapter.propose(ctx);
    expect(complete).toBe(true);
    expect(items[0]).toMatchObject({
      kind: "customer.commitment", route: "owner_decides", urgent: false, adminMayDecide: false, sourceLifecycle: "app_intake_visit", sourceId: SUBMISSION,
      title: "New patient visit: Pat Lee, Thu Oct 22 10:00 AM",
      approveEffect: "The visit is booked for Thu Oct 22 10:00 AM. The patient isn't emailed; call them to confirm.",
      notYetEffect: "Nothing is booked. The request stays in Inquiries so you can call them.",
      openHref: `/workspace/inquiries?workspaceId=${WS}`,
    });
    expect(items[0]!.detail).toBe("New patient · Checkup and cleaning · Delta Dental PPO · Prefers Thu · Mornings · Thanks!");
    expect(visitWhen("2026-10-22T14:00:00Z", "America/New_York")).toBe("Thu Oct 22 10:00 AM");
  });

  it("says the patient gets a confirmation email only when customer email is on", async () => {
    const { visitAdapter } = setup({ emailOn: true });
    expect((await visitAdapter.propose(ctx)).items[0]!.approveEffect).toContain("The patient gets a confirmation email.");
  });

  it("proposes nothing without a service or an email, or while bookings or the flag are off", async () => {
    expect((await setup({ visits: [visit({ bookingServiceId: null })] }).visitAdapter.propose(ctx)).items).toEqual([]);
    expect((await setup({ visits: [visit({ email: null })] }).visitAdapter.propose(ctx)).items).toEqual([]);
    const off = setup({ manual: false });
    expect(await off.visitAdapter.propose(ctx)).toEqual({ items: [], complete: true });
    expect(off.store.listOpenVisits).not.toHaveBeenCalled();
    expect((await setup({ enabled: false }).visitAdapter.propose(ctx)).items).toEqual([]);
  });

  it("puts an urgent visit first in words and in the flag, on the first open time", async () => {
    const { visitAdapter } = setup({ visits: [visit({ triage: "urgent", answers: { patient_status: "new", reason: "urgent" } })] });
    const item = (await visitAdapter.propose(ctx)).items[0]!;
    expect(item.urgent).toBe(true);
    expect(item.title).toBe("Urgent · New patient visit: Pat Lee, Tue Oct 20 3:00 PM");
  });

  it("never puts a member ID in the detail, even if one is in the answers", async () => {
    const { visitAdapter } = setup({ visits: [visit({ answers: { patient_status: "new", reason: "checkup", insurance_member_id: "ABC123XYZ", note: "ok" } })] });
    const item = (await visitAdapter.propose(ctx)).items[0]!;
    expect(JSON.stringify(item)).not.toContain("ABC123XYZ");
  });

  it("is incomplete, not empty, when the slots can't be read", async () => {
    const { visitAdapter } = setup({ slots: async () => { throw new Error("calendar down"); } });
    expect(await visitAdapter.propose(ctx)).toEqual({ items: [], complete: false });
  });

  it("skips a visit when no open time matches", async () => {
    const { visitAdapter } = setup({ visits: [visit({ answers: { preferred_days: "sat" } })] });
    expect((await visitAdapter.propose(ctx)).items).toEqual([]);
  });

  it("approve books the visit, confirms it as the owner, then records the decision with ids only", async () => {
    const { visitAdapter, ports, store } = setup();
    const item = asItem((await visitAdapter.propose(ctx)).items[0]!);
    const result = await visitAdapter.resolve(ctx, item, "approve", session);
    expect(ports.book).toHaveBeenCalledWith(OWNER, expect.objectContaining({
      workspaceId: WS, serviceId: "svc-exam", start: "2026-10-22T14:00:00Z", requestId: `intake_${SUBMISSION.replaceAll("-", "")}`,
      customer: { name: "Pat Lee", email: "pat@example.test", phone: "716 555 0111" },
      intakeAnswers: { notes: "Dental intake: checkup", reason: "checkup", patient_status: "new" },
    }));
    expect(ports.decide).toHaveBeenCalledWith(WS, BOOKING, "approve", "owner");
    expect(ports.afterDecision).toHaveBeenCalledTimes(1);
    expect(store.decideVisit).toHaveBeenCalledWith(WS, SUBMISSION, "visit_booked", BOOKING, item.id);
    expect(result).toEqual({ outcome: "done", receiptRef: `booking:${BOOKING}` });
    const booked = JSON.stringify((ports.book as ReturnType<typeof vi.fn>).mock.calls[0]);
    expect(booked).not.toContain("insurance_member_id");
  });

  it("fails without booking when the proposed time changed", async () => {
    const { visitAdapter, ports } = setup();
    const item = asItem((await visitAdapter.propose(ctx)).items[0]!, { revisionHash: "old" });
    expect(await visitAdapter.resolve(ctx, item, "approve", session)).toEqual({ outcome: "failed", reason: "That time was just taken. A new time will appear here." });
    expect(ports.book).not.toHaveBeenCalled();
  });

  it("fails with the booking message when the store refuses the time", async () => {
    const { visitAdapter, ports, store } = setup();
    (ports.book as ReturnType<typeof vi.fn>).mockRejectedValue(new PublicBookingError("conflict", "That time has just been taken. Choose another time."));
    const item = asItem((await visitAdapter.propose(ctx)).items[0]!);
    expect(await visitAdapter.resolve(ctx, item, "approve", session)).toEqual({ outcome: "failed", reason: "That time has just been taken. Choose another time." });
    expect(store.decideVisit).not.toHaveBeenCalled();
  });

  it("not yet and a lapse mark the request not booked without booking anything", async () => {
    const { visitAdapter, ports, store } = setup();
    const item = asItem((await visitAdapter.propose(ctx)).items[0]!);
    expect((await visitAdapter.resolve(ctx, item, "not_yet", session)).outcome).toBe("done");
    expect((await visitAdapter.resolve(ctx, item, "approve", { kind: "expiry" })).outcome).toBe("done");
    expect(store.decideVisit).toHaveBeenCalledWith(WS, SUBMISSION, "not_booked", null, item.id);
    expect(ports.book).not.toHaveBeenCalled();
  });

  it("asks for sign-in when approved by link without an account", async () => {
    const { visitAdapter, ports } = setup();
    const item = asItem((await visitAdapter.propose(ctx)).items[0]!);
    expect(await visitAdapter.resolve(ctx, item, "approve", { kind: "owner_link", recipient: "owner@example.test", actor: null })).toEqual({ outcome: "failed", reason: "Sign in to book this visit." });
    expect(ports.book).not.toHaveBeenCalled();
  });

  it("reports the current revision, and null once the visit is decided", async () => {
    const { visitAdapter } = setup();
    const item = (await visitAdapter.propose(ctx)).items[0]!;
    expect(await visitAdapter.currentRevision(ctx, SUBMISSION)).toBe(item.revisionHash);
    const decided = setup({ visits: [visit({ state: "visit_booked" })] });
    expect(await decided.visitAdapter.currentRevision(ctx, SUBMISSION)).toBeNull();
  });
});

describe("owner email for Dental intake", () => {
  it("is off for both lifecycles unless STRELVA_INTAKE_OWNER_EMAIL and the global switch are on", async () => {
    const { needsYouService } = await import("@/server/needs-you/server");
    needsYouService({} as never);
    for (const sourceLifecycle of ["app_intake_live", "app_intake_visit"]) {
      const row = { sourceLifecycle, workspaceId: WS, sourceId: INSTALL };
      const allowed = () => captured.deps!.emailAllowed(row);
      expect(await allowed()).toBe(false);
      vi.stubEnv("EMAIL_SENDING_ENABLED", "true");
      expect(await allowed()).toBe(false);
      vi.stubEnv("STRELVA_INTAKE_OWNER_EMAIL", "1");
      expect(await allowed()).toBe(true);
      vi.stubEnv("EMAIL_SENDING_ENABLED", "");
      expect(await allowed()).toBe(false);
      vi.unstubAllEnvs();
    }
    expect(await captured.deps!.emailAllowed({ sourceLifecycle: "tenant_event", workspaceId: WS, sourceId: INSTALL })).toBe(true);
  });
});
