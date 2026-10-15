/**
 * Needs you sources for Dental intake (src/products/vertical-intake).
 *
 * `app_intake_live`: the owner's "Make it live" decision for the install. Approve records a numbered Release
 * of the install, then looks at the live page for the form. Not yet and a lapse withdraw the request and
 * change nothing on the website.
 *
 * `app_intake_visit`: one proposed new-patient visit. Strelva proposes a concrete time that matches the
 * patient's preferred days and times, from the same slots Bookings offers. Approve books it through the one
 * booking store (createManualBooking, then decideBookingRequest): there is no second booking write path. The
 * booking is confirmed in the same step, so the booking_request item that creating it could open is
 * superseded by its own revision rule. Not yet marks the request "not booked" and leaves it in Inquiries
 * for a phone call.
 *
 * Both are owner only (adminMayDecide false), and both are off with the business's `vertical_intake` flag.
 * Nothing here emails a patient; confirmations follow the existing booking email gates.
 */
import { createHash } from "node:crypto";
import { createManualBooking, manualBookingsEnabled } from "@/platform/bookings/manual";
import { resolveBookingScope } from "@/platform/bookings/booking-scope";
import { nativeServices, nativeSlots } from "@/platform/bookings/native";
import { PublicBookingError } from "@/platform/bookings/errors";
import { deliverBookingUpdates } from "@/platform/bookings/updates";
import { decideBookingRequest, type StoreBooking } from "@/platform/bookings/store";
import type { SourceAdapter } from "@/platform/needs-you/adapters";
import type { ProposedItem } from "@/platform/needs-you/contracts";
import { itemDetail, itemTitle, memberActor, revisionOf } from "@/platform/needs-you/sources/shared";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { connectedSitesStore } from "@/products/connected-sites/server";
import {
  checkIntakeOnPage, intakeEmailOn, intakeSensitiveFieldsAvailable, verticalIntakePublicFor, verticalIntakeStore,
  type IntakeLiveCheck, type IntakeVisit, type VerticalIntakeStore,
} from "@/products/vertical-intake/server";
import {
  intakeDefinition, intakeInstallConfigSchema, intakeReviewLines, pickVisitSlot, publicIntakeForm, summarizeIntakeAnswers,
  type IntakeInstallConfig, type PublicIntakeForm,
} from "@/products/vertical-intake";

export interface AppIntakeNeedsPorts {
  /** The same rule as the public form: the env may reach it, and the business's vertical_intake row is not off. */
  enabled(workspaceId: string): Promise<boolean>;
  store: VerticalIntakeStore;
  services: typeof nativeServices;
  slots: typeof nativeSlots;
  manualOn(): Promise<boolean>;
  book: typeof createManualBooking;
  decide: typeof decideBookingRequest;
  /** Keeps booking updates (and their own email gates) in step after a decision. Best effort. */
  afterDecision(booking: StoreBooking): Promise<void>;
  /** Where the live check looks: the install's page, or the first verified site. */
  site(actor: WorkspaceActor, workspaceId: string, config: IntakeInstallConfig): Promise<{ url: string; siteKey: string } | null>;
  checkPage: typeof checkIntakeOnPage;
  emailOn(): boolean;
  now(): Date;
}

const defaultPorts = (): AppIntakeNeedsPorts => ({
  enabled: verticalIntakePublicFor,
  store: verticalIntakeStore(),
  services: nativeServices,
  slots: nativeSlots,
  manualOn: () => manualBookingsEnabled().catch(() => false),
  book: createManualBooking,
  decide: decideBookingRequest,
  afterDecision: async booking => { await deliverBookingUpdates(booking.id).catch(() => undefined); },
  async site(actor, workspaceId, config) {
    const site = (await connectedSitesStore().list(actor, workspaceId)).find(item => item.status === "active" && item.verifiedAt);
    return site ? { url: config.pageUrl ?? site.siteUrl, siteKey: site.publicKey } : null;
  },
  checkPage: checkIntakeOnPage,
  emailOn: intakeEmailOn,
  now: () => new Date(),
});

const APP_ID = "dental_intake" as const;
const LIVE = "app_intake_live" as const;
const VISIT = "app_intake_visit" as const;

function formFor(release: number, config: IntakeInstallConfig, facts: Record<string, unknown>, now: Date): PublicIntakeForm {
  return publicIntakeForm(intakeDefinition(APP_ID), release, config, facts, { sensitiveAvailable: intakeSensitiveFieldsAvailable(), now });
}

// ---- Make it live ---------------------------------------------------------

export function appIntakeLiveRevision(request: { installId: string; draftRevision: number; requestedAt: string }): string {
  return revisionOf(LIVE, request.installId, request.draftRevision, request.requestedAt);
}

export function appIntakeLiveAdapter(ports: AppIntakeNeedsPorts = defaultPorts()): SourceAdapter {
  async function read(workspaceId: string) {
    if (!(await ports.enabled(workspaceId))) return null;
    return ports.store.listLiveRequests(workspaceId);
  }
  async function serviceName(workspaceId: string, config: IntakeInstallConfig): Promise<string | null> {
    if (!config.bookingServiceId) return null;
    try { return (await ports.services(resolveBookingScope(workspaceId))).services.find(service => service.id === config.bookingServiceId)?.name ?? null; } catch { return null; }
  }
  return {
    lifecycle: LIVE,
    needsMemberActor: true,
    ownerLinkWithoutAccount: false,
    ownerLinkApprovalRequiresSignIn: true,
    async propose(ctx) {
      try {
        const data = await read(ctx.workspaceId);
        if (!data) return { items: [], complete: true };
        const now = ports.now();
        const items: ProposedItem[] = data.requests.map(request => {
          const release = (request.liveRelease ?? 0) + 1;
          const form = formFor(release, request.draftConfig, data.facts, now);
          const asksMemberId = form.fields.some(field => field.sensitive);
          return {
            kind: "system.go_live", route: "owner_decides",
            title: itemTitle(`Make Dental intake live on your website: Release ${release}`),
            detail: itemDetail(`${form.fields.length} questions · Member ID ${asksMemberId ? "asked" : "not asked"}`),
            approveEffect: "Patients can send the Dental intake form on your website. Strelva records this Release and checks your live page.",
            notYetEffect: "Nothing on your website changes. The form stays as it is now.",
            sourceLifecycle: LIVE, sourceId: request.installId, revisionHash: appIntakeLiveRevision(request),
            urgent: false, adminMayDecide: false,
            openHref: `/workspace/inquiries?workspaceId=${ctx.workspaceId}#dental-intake`,
          };
        });
        return { items, complete: true };
      } catch {
        return { items: [], complete: false };
      }
    },
    async review(ctx, item) {
      try {
        const data = await read(ctx.workspaceId);
        const request = data?.requests.find(row => row.installId === item.sourceId);
        if (!data || !request || appIntakeLiveRevision(request) !== item.revisionHash) return null;
        const form = formFor((request.liveRelease ?? 0) + 1, request.draftConfig, data.facts, ports.now());
        return intakeReviewLines(form, request.draftConfig, await serviceName(ctx.workspaceId, request.draftConfig), ports.emailOn());
      } catch {
        return null;
      }
    },
    async currentRevision(ctx, sourceId) {
      const data = await read(ctx.workspaceId);
      const request = data?.requests.find(row => row.installId === sourceId);
      return request ? appIntakeLiveRevision(request) : null;
    },
    async resolve(ctx, item, decision, by) {
      if (by.kind === "expiry" || decision === "not_yet") {
        try { await ports.store.withdrawLiveRequest(ctx.workspaceId, item.sourceId); } catch { return { outcome: "failed", reason: "resolver_failed" }; }
        return { outcome: "done", reason: by.kind === "expiry" ? "Expired, nothing changed" : "Not yet" };
      }
      const actor = memberActor(by);
      if (!actor) return { outcome: "failed", reason: "Sign in to make this live." };
      try {
        const data = await read(ctx.workspaceId);
        const request = data?.requests.find(row => row.installId === item.sourceId);
        if (!request) return { outcome: "done", reason: "already_resolved" };
        if (appIntakeLiveRevision(request) !== item.revisionHash) return { outcome: "failed", reason: "source_changed" };
        const made = await ports.store.makeLive({
          workspaceId: ctx.workspaceId, installId: request.installId, draftRevision: request.draftRevision,
          ownerDecisionId: item.id, userId: actor.userId, verifiedEmail: actor.verifiedEmail,
        });
        const place = await ports.site(actor, ctx.workspaceId, request.draftConfig).catch(() => null);
        let check: IntakeLiveCheck | null = null;
        if (place) {
          check = await ports.checkPage({ url: place.url, siteKey: place.siteKey, appId: APP_ID, release: made.release }).catch(() => null);
          if (check) await ports.store.recordLiveCheck(request.installId, check).catch(() => undefined);
        }
        const seen = check?.state === "found";
        return {
          outcome: seen ? "done" : "done_unverified",
          receiptRef: `app_intake_release:${request.installId}:${made.release}`,
          ...(seen ? {} : { reason: "Release recorded. We couldn't see the form on your live page yet." }),
        };
      } catch {
        return { outcome: "failed", reason: "resolver_failed" };
      }
    },
  };
}

// ---- A proposed visit -------------------------------------------------------

/** "Tue Oct 21 9:00 AM", in the office's own time. */
export function visitWhen(startIso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(new Date(startIso));
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${get("weekday")} ${get("month")} ${get("day")} ${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()}`;
}

export function appIntakeVisitRevision(submissionId: string, slotStart: string, serviceId: string): string {
  return revisionOf(VISIT, submissionId, "new", slotStart, serviceId);
}

interface Proposal { visit: IntakeVisit; serviceId: string; slot: { start: string; end: string }; timeZone: string; facts: Record<string, unknown> }

export function appIntakeVisitAdapter(ports: AppIntakeNeedsPorts = defaultPorts()): SourceAdapter {
  type Slots = Awaited<ReturnType<typeof nativeSlots>>;
  /** One proposal, or null when no time matches. Throws when the slots can't be read. */
  async function propose(workspaceId: string, visit: IntakeVisit, facts: Record<string, unknown>, cache: Map<string, Promise<Slots>>): Promise<Proposal | null> {
    const serviceId = visit.bookingServiceId;
    if (!serviceId || !visit.email || visit.state !== "new") return null;
    const now = ports.now();
    const scope = resolveBookingScope(workspaceId);
    let offered = cache.get(serviceId);
    if (!offered) {
      offered = ports.slots(scope, serviceId, new Date(now.getTime() + 2 * 3600_000).toISOString(), new Date(now.getTime() + 14 * 86_400_000).toISOString());
      cache.set(serviceId, offered);
    }
    const { slots, timeZone } = await offered;
    const slot = pickVisitSlot(slots.map(item => ({ start: item.start, end: item.end })), timeZone, visit.answers, visit.triage ?? "routine", now);
    return slot ? { visit, serviceId, slot, timeZone, facts } : null;
  }
  async function enabled(workspaceId: string): Promise<boolean> {
    return (await ports.enabled(workspaceId)) && (await ports.manualOn());
  }
  function itemFor(workspaceId: string, proposal: Proposal): ProposedItem {
    const { visit, slot, timeZone } = proposal;
    const form = formFor(0, intakeInstallConfigSchema.parse({}), proposal.facts, ports.now());
    const summary = summarizeIntakeAnswers(form, visit.answers);
    const when = visitWhen(slot.start, timeZone);
    const who = visit.name.replace(/\s+/g, " ").trim() || "A new patient";
    const urgent = visit.triage === "urgent";
    return {
      kind: "customer.commitment", route: "owner_decides",
      title: itemTitle(`${urgent ? "Urgent · " : ""}New patient visit: ${who}, ${when}`),
      detail: itemDetail([summary, visit.answers.note?.slice(0, 200)].filter(Boolean).join(" · ").slice(0, 600)),
      approveEffect: `The visit is booked for ${when}. ${ports.emailOn() ? "The patient gets a confirmation email." : "The patient isn't emailed; call them to confirm."}`,
      notYetEffect: "Nothing is booked. The request stays in Inquiries so you can call them.",
      sourceLifecycle: VISIT, sourceId: visit.submissionId,
      revisionHash: appIntakeVisitRevision(visit.submissionId, slot.start, proposal.serviceId),
      urgent, adminMayDecide: false,
      openHref: `/workspace/inquiries?workspaceId=${workspaceId}`,
    };
  }
  async function current(workspaceId: string, submissionId: string): Promise<Proposal | null> {
    const visit = await ports.store.readVisit(workspaceId, submissionId);
    if (!visit || visit.state !== "new") return null;
    return propose(workspaceId, visit, visit.facts, new Map());
  }
  return {
    lifecycle: VISIT,
    needsMemberActor: true,
    ownerLinkWithoutAccount: false,
    ownerLinkApprovalRequiresSignIn: true,
    async propose(ctx) {
      try {
        if (!(await enabled(ctx.workspaceId))) return { items: [], complete: true };
        const { facts, visits } = await ports.store.listOpenVisits(ctx.workspaceId);
        const cache = new Map<string, Promise<Slots>>();
        const items: ProposedItem[] = [];
        let complete = true;
        for (const visit of visits) {
          try {
            const proposal = await propose(ctx.workspaceId, visit, facts, cache);
            // No open time matched (or no email to book with): the panel on Inquiries says "Call them."
            if (proposal) items.push(itemFor(ctx.workspaceId, proposal));
          } catch {
            complete = false;
          }
        }
        return { items, complete };
      } catch {
        return { items: [], complete: false };
      }
    },
    async currentRevision(ctx, sourceId) {
      if (!(await enabled(ctx.workspaceId))) return null;
      const proposal = await current(ctx.workspaceId, sourceId);
      return proposal ? appIntakeVisitRevision(proposal.visit.submissionId, proposal.slot.start, proposal.serviceId) : null;
    },
    async resolve(ctx, item, decision, by) {
      if (by.kind === "expiry" || decision === "not_yet") {
        try { await ports.store.decideVisit(ctx.workspaceId, item.sourceId, "not_booked", null, item.id); } catch { return { outcome: "failed", reason: "resolver_failed" }; }
        return { outcome: "done", reason: by.kind === "expiry" ? "Expired, nothing booked" : "Not yet" };
      }
      const actor = memberActor(by);
      if (!actor) return { outcome: "failed", reason: "Sign in to book this visit." };
      try {
        const proposal = await current(ctx.workspaceId, item.sourceId);
        if (!proposal) return { outcome: "done", reason: "already_resolved" };
        const revision = appIntakeVisitRevision(proposal.visit.submissionId, proposal.slot.start, proposal.serviceId);
        if (revision !== item.revisionHash) return { outcome: "failed", reason: "That time was just taken. A new time will appear here." };
        const { visit } = proposal;
        const reason = visit.answers.reason;
        const { booking } = await ports.book(actor, {
          workspaceId: ctx.workspaceId, serviceId: proposal.serviceId, start: proposal.slot.start,
          requestId: `intake_${visit.submissionId.replaceAll("-", "")}`,
          customer: { name: visit.name.slice(0, 160), email: visit.email!, ...(visit.phone ? { phone: visit.phone.slice(0, 80) } : {}) },
          intakeAnswers: {
            notes: `Dental intake: ${reason ?? "new patient visit"}`.slice(0, 5000),
            ...(reason ? { reason } : {}),
            ...(visit.answers.patient_status ? { patient_status: visit.answers.patient_status } : {}),
          },
        });
        const decided = await ports.decide(ctx.workspaceId, booking.id, "approve", "owner");
        await ports.afterDecision(decided.booking).catch(() => undefined);
        await ports.store.decideVisit(ctx.workspaceId, visit.submissionId, "visit_booked", booking.id, item.id);
        return { outcome: "done", receiptRef: `booking:${booking.id}` };
      } catch (error) {
        if (error instanceof PublicBookingError) return { outcome: "failed", reason: error.message };
        return { outcome: "failed", reason: "resolver_failed" };
      }
    },
  };
}
