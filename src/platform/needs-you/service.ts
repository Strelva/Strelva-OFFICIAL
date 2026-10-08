/**
 * Needs you: open items from each source, decide them through the source's
 * own resolver, chase them by email, and lapse them. Every dependency is a
 * port so the whole flow runs in tests without Redis, Postgres or Resend.
 */
import { bookingRemindersEnabled, bookingOwnerNoticeEnabled } from "@/platform/bookings/flags";
import type { SendEmailInput, SendEmailResult } from "@/platform/infra/email/send";
import type { EmailDecision, EmailOptions } from "@/platform/infra/email/layout";
import { buildWorkspaceApproveUrl, type WorkspaceApproveLinkClaims } from "@/lib/approve-link";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { nextChaseStep, type Decision, type OwnerDecision } from "./contracts";
import type { AdapterContext, ResolveBy, SourceAdapter } from "./adapters";
import { ServiceSessionRefusedError, type ServiceSession } from "./service-actor";
import { NeedsYouRefusedError, type DeliveryRow, type NeedsYouStore } from "./repository";

export interface NeedsYouDeps {
  store: NeedsYouStore;
  adapters: readonly SourceAdapter[];
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
  /** Origin that serves /api/approve and /workspace. */
  appOrigin: string;
  now(): number;
  /** New sources may impose additional opt-in gates without changing existing email delivery. */
  emailAllowed?(row: DeliveryRow): Promise<boolean>;
  /** Optional channel-specific release/send policy; false leaves the item
   * waiting without consuming its delivery state. */
  canDeliver?(row: DeliveryRow): Promise<boolean>;
  /** Booking calendar health is an owner action, separate from decisions. */
  bookingWorkspaces?(): Promise<string[]>;
  /** Businesses a source knows wait on the owner even with no tenant or
   * bookings to bring them in (business facts on a connected-site client). */
  pendingWorkspaces?(): Promise<string[]>;
  /** Overflow stays undelivered and joins the existing morning digest. */
  bookingUrgentAllowed?(workspaceId: string): Promise<boolean>;
  bookingCalendarHealth?(workspaceId: string, input: { now: number; appOrigin: string; sendEmail: NeedsYouDeps["sendEmail"] }): Promise<{ digests: number; ownerNotTold: number; failed: number; complete: boolean }>;
  /** New immediate inquiry delivery stays off unless the host supplies the
   * release switches and strict global/customer/per-tenant email gates. */
  urgentInquiryAllowed?(tenantId: string | null): Promise<boolean>;
}

export type DecideStatus =
  | "done"
  | "done_unverified"
  | "failed"
  | "already_handled"
  | "changed"
  | "expired"
  | "not_found"
  | "sign_in"
  | "not_owner"
  | "forbidden";

export interface DecideResult {
  status: DecideStatus;
  item: OwnerDecision | null;
}

export interface ChaseSummary {
  lapsed: number;
  reminded: number;
  digests: number;
  urgent: number;
  /** Deliveries recorded as suppressed: the owner was not told. */
  ownerNotTold: number;
  failed: number;
}

const DIGEST_HOUR = 7;

function localHour(now: number, timezone: string): number {
  try {
    return Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: timezone }).format(new Date(now)));
  } catch {
    return Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/New_York" }).format(new Date(now)));
  }
}

export function createNeedsYouService(deps: NeedsYouDeps) {
  const adapterFor = (lifecycle: string) => deps.adapters.find(adapter => adapter.lifecycle === lifecycle);

  /** Open (or keep) an item for every pending ask the adapters can read. */
  async function sync(ctx: AdapterContext): Promise<{ opened: OwnerDecision[]; complete: boolean }> {
    const opened: OwnerDecision[] = [];
    let complete = true;
    for (const adapter of deps.adapters) {
      const proposal = await adapter.propose(ctx).catch(() => ({ items: [], complete: false }));
      complete &&= proposal.complete;
      for (const item of proposal.items) {
        opened.push(ctx.service && deps.store.openAsService
          ? await deps.store.openAsService(ctx.workspaceId, ctx.service.sessionId, item)
          : await deps.store.open(ctx.workspaceId, item));
      }
    }
    return { opened, complete };
  }

  /**
   * The cron's read context for one business: Strelva (system) when Strelva
   * runs the business and it has a verified owner or admin, otherwise no
   * member (only sources that need none are read). One session per business
   * per chase.
   */
  async function cronContext(workspaceId: string, sessions: Map<string, AdapterContext>): Promise<AdapterContext> {
    const known = sessions.get(workspaceId);
    if (known) return known;
    const session = deps.store.serviceSession
      ? await deps.store.serviceSession(workspaceId).catch(() => null)
      : null;
    const ctx: AdapterContext = session && session.workspaceId === workspaceId && session.purpose === "needs_you_sync"
      ? { workspaceId, actor: session.actor, service: session }
      : { workspaceId };
    sessions.set(workspaceId, ctx);
    return ctx;
  }

  /** An open item whose source moved on: a newer revision supersedes it; a source no one waits on any more withdraws it. */
  async function reconcile(ctx: AdapterContext, item: OwnerDecision): Promise<"current" | "changed" | "gone" | "unknown"> {
    const adapter = adapterFor(item.sourceLifecycle);
    if (!adapter) return "unknown";
    if (adapter.needsMemberActor && !ctx.actor) return "unknown";
    let current: string | null;
    try {
      current = await adapter.currentRevision(ctx, item.sourceId);
    } catch {
      return "unknown";
    }
    if (current === item.revisionHash) return "current";
    if (current === null) {
      if (item.state === "open") {
        const reason = await adapter.goneReason?.(ctx, item.sourceId).catch(() => null);
        await deps.store.withdraw(ctx.workspaceId, item.id, reason || "The source no longer waits on a decision.").catch(() => null);
      }
      return "gone";
    }
    await sync(ctx);
    return "changed";
  }

  async function list(actor: WorkspaceActor, workspaceId: string): Promise<{ items: OwnerDecision[]; complete: boolean }> {
    const ctx = { workspaceId, actor };
    const synced = await sync(ctx);
    const open = await deps.store.list(actor, workspaceId, false);
    let moved = false;
    for (const item of open) {
      const fresh = await reconcile(ctx, item);
      if (fresh === "changed" || fresh === "gone") moved = true;
    }
    const items = (moved ? await deps.store.list(actor, workspaceId, false) : open)
      .filter(item => item.state === "open" && item.route === "owner_decides");
    const reviewed: OwnerDecision[] = [];
    for (const item of items) {
      const lines = await review(item, ctx);
      reviewed.push(lines === undefined ? item : { ...item, review: lines });
    }
    return { items: reviewed, complete: synced.complete };
  }

  /**
   * The complete lines an owner approves, for a source whose detail can't
   * hold them. Undefined: the item's own detail is the whole ask. Null: the
   * source moved on or can't be read, so nothing may be approved from it.
   */
  async function review(item: OwnerDecision, ctx: AdapterContext = { workspaceId: item.workspaceId }): Promise<string[] | null | undefined> {
    const adapter = adapterFor(item.sourceLifecycle);
    if (!adapter?.review) return undefined;
    if (ctx.workspaceId !== item.workspaceId) return null;
    return adapter.review(ctx, item).catch(() => null);
  }

  async function decide(input: {
    workspaceId: string;
    itemId: string;
    revision: string;
    decision: Decision;
    by: { kind: "owner_link"; recipient: string } | { kind: "session"; actor: WorkspaceActor };
  }): Promise<DecideResult> {
    const item = await deps.store.read(input.workspaceId, input.itemId);
    if (!item) return { status: "not_found", item: null };
    if (item.state === "superseded") return { status: "changed", item };
    if (item.state !== "open") return { status: "already_handled", item };
    if (item.revisionHash !== input.revision) return { status: "changed", item };
    const adapter = adapterFor(item.sourceLifecycle);
    if (!adapter) return { status: "failed", item };

    let memberActor: WorkspaceActor | null = input.by.kind === "session" ? input.by.actor : null;
    let linkService: ServiceSession | null = null;
    if (input.by.kind === "owner_link") {
      // A link never performs access, money or exit.
      if (item.signInRequired) return { status: "sign_in", item };
      if (adapter.needsMemberActor) {
        memberActor = await deps.store.ownerActor(input.workspaceId, input.by.recipient).catch(() => null);
        // An owner with no account (owner-entry decision 6): Strelva (system)
        // reads and runs this one item, bound to it and to the owner recipient.
        if (!memberActor && adapter.ownerLinkWithoutAccount && (deps.store.linkSession || deps.store.ownerLinkSession)) {
          let session: ServiceSession | null = null;
          try {
            session = item.sourceLifecycle === "make_real"
              ? await deps.store.linkSession?.(input.workspaceId, item.id, input.by.recipient) ?? null
              : await deps.store.ownerLinkSession?.(input.workspaceId, item.id, input.revision, input.by.recipient) ?? null;
          } catch (error) {
            // A link for anyone but the owner on record is refused like any other link.
            if (error instanceof ServiceSessionRefusedError && error.code === "owner_decision_recipient_not_owner") return { status: "not_owner", item };
            session = null;
          }
          const bound = session?.purpose === "owner_decision_link" && session.decisionId === item.id
            && session.revisionHash === input.revision && session.recipient === input.by.recipient.trim().toLowerCase()
            && Boolean(deps.store.authorizeOwnerLinkRun);
          if (session && session.workspaceId === input.workspaceId && (item.sourceLifecycle === "make_real" ? session.purpose === "make_real_link" : bound)) {
            linkService = session;
            memberActor = session.actor;
          }
        }
        if (!memberActor) return { status: "sign_in", item };
      }
    }
    const ctx: AdapterContext = { workspaceId: input.workspaceId, ...(memberActor ? { actor: memberActor } : {}) };
    const fresh = await reconcile(ctx, item);
    if (fresh === "changed") return { status: "changed", item };
    if (fresh === "gone") return { status: "already_handled", item };
    if (fresh === "unknown") return { status: "failed", item };

    let claimed;
    try {
      claimed = await deps.store.claim({
        workspaceId: input.workspaceId,
        itemId: item.id,
        revision: input.revision,
        decision: input.decision,
        by: input.by.kind === "owner_link" ? "owner_link" : "session",
        ...(input.by.kind === "owner_link" ? { recipient: input.by.recipient } : { actor: input.by.actor }),
      });
    } catch (error) {
      if (error instanceof NeedsYouRefusedError) {
        if (error.code === "owner_decision_recipient_not_owner") return { status: "not_owner", item };
        if (error.code === "owner_decision_sign_in_required") return { status: "sign_in", item };
        return { status: "forbidden", item };
      }
      throw error;
    }
    if (claimed.status !== "claimed") return { status: claimed.status, item: claimed.item };

    if (linkService?.purpose === "owner_decision_link") {
      try { await deps.store.authorizeOwnerLinkRun!(linkService); } catch {
        const finished = await deps.store.finish(input.workspaceId, item.id, "failed", "link_authority_changed", null);
        return { status: "failed", item: finished };
      }
    }
    const by: ResolveBy = input.by.kind === "owner_link"
      ? { kind: "owner_link", recipient: input.by.recipient, actor: memberActor, ...(linkService ? { service: linkService } : {}) }
      : { kind: "session", actor: input.by.actor };
    const outcome = await adapter.resolve(ctx, claimed.item, input.decision, by).catch(() => ({ outcome: "failed" as const, reason: "resolver_threw" }));
    const finished = await deps.store.finish(input.workspaceId, item.id, outcome.outcome, outcome.reason ?? null, "receiptRef" in outcome ? outcome.receiptRef ?? null : null);
    return { status: outcome.outcome, item: finished };
  }

  function links(row: OwnerDecision, recipient: string): EmailDecision {
    const open = { label: "Open", url: `${deps.appOrigin.replace(/\/+$/, "")}${row.openHref ?? `/workspace?workspaceId=${encodeURIComponent(row.workspaceId)}`}` };
    if (row.signInRequired) return { title: row.title, detail: row.detail ?? undefined, note: "This one needs you signed in. Open it to decide.", open };
    const claims = (action: WorkspaceApproveLinkClaims["action"]) => ({ workspaceId: row.workspaceId, itemId: row.id, action, recipient, revision: row.revisionHash });
    return {
      title: row.title,
      detail: row.detail ?? undefined,
      note: `Approve: ${row.approveEffect} Not yet: ${row.notYetEffect}`,
      approve: { label: "Approve", url: buildWorkspaceApproveUrl(deps.appOrigin, claims("approve")) },
      notYet: { label: "Not yet", url: buildWorkspaceApproveUrl(deps.appOrigin, claims("not-yet")) },
      open,
    };
  }

  function email(kind: "urgent" | "digest" | "reminder", business: string, rows: DeliveryRow[], recipient: string): EmailOptions {
    const count = rows.length;
    const heading = kind === "urgent" ? "A customer is waiting on you" : kind === "reminder" ? `Still waiting on you: ${count === 1 ? "1 decision" : `${count} decisions`}` : `Strelva needs ${count === 1 ? "1 decision" : `${count} decisions`}`;
    return {
      preheader: rows.map(row => row.title).join(" · ").slice(0, 140),
      heading,
      paragraphs: [kind === "reminder"
        ? `These are still open for ${business}. Nothing happens until you decide, and each one lapses after 14 days with nothing changed.`
        : `Only you can make ${count === 1 ? "this call" : "these calls"} for ${business}. Tap Approve or Not yet; you'll confirm on the next page.`],
      decisions: rows.map(row => links(row, recipient)),
      footerNote: `for ${business}`,
      manageUrl: `${deps.appOrigin.replace(/\/+$/, "")}/workspace?workspaceId=${encodeURIComponent(rows[0]!.workspaceId)}`,
    };
  }

  async function deliver(kind: "urgent" | "digest" | "reminder_1" | "reminder_2", rows: DeliveryRow[], summary: ChaseSummary, inquiryNotice?: { name: string; message: string | null }) {
    if (deps.emailAllowed) {
      const allowed: DeliveryRow[] = [];
      for (const row of rows) {
        if (await deps.emailAllowed(row).catch(() => false)) allowed.push(row);
        else {
          await deps.store.recordDelivery(row.workspaceId, row.id, kind, "suppressed", null, null, "source_email_disabled");
          summary.ownerNotTold += 1;
        }
      }
      rows = allowed;
      if (!rows.length) return;
    }
    const first = rows[0]!;
    // A source that accepts only the trusted owner never mails anyone else.
    if (first.recipient && first.recipient.trusted !== true) {
      const untrusted = rows.filter(row => adapterFor(row.sourceLifecycle)?.trustedRecipientOnly);
      for (const row of untrusted) await deps.store.recordDelivery(row.workspaceId, row.id, kind, "suppressed", null, null, "owner_recipient_unconfirmed");
      summary.ownerNotTold += untrusted.length;
      rows = rows.filter(row => !untrusted.includes(row));
      if (!rows.length) return;
    }
    const recipient = first.recipient?.email?.trim().toLowerCase() ?? null;
    if (!recipient) {
      // Only a trusted owner address gets owner links (#524). Not sent, and the operator queue says why.
      for (const row of rows) await deps.store.recordDelivery(row.workspaceId, row.id, kind, "suppressed", null, null, "no_trusted_owner_recipient");
      summary.ownerNotTold += rows.length;
      return;
    }
    const inquiryUrgent = rows.some(row => row.sourceLifecycle === "tenant_event" && (row.kind === "customer.message" || row.kind === "customer.commitment"));
    const inquiryRows = (await Promise.all(rows.map(async row => ({ row, inquiry: row.sourceLifecycle === "inquiry_fact"
      || (row.sourceLifecycle === "tenant_event" && (row.kind === "customer.message" || row.kind === "customer.commitment"))
      || (row.sourceLifecycle === "tenant_event" && (row.kind === "system.go_live" || row.kind === "system.change_live")
        && await (adapterFor(row.sourceLifecycle)?.inquiryEmailSource?.({ workspaceId: row.workspaceId }, row.sourceId).catch(() => true) ?? true)),
    })))).filter(item => item.inquiry).map(item => item.row);
    const sourceTenant = (row: DeliveryRow) => row.sourceLifecycle === "tenant_event"
      ? row.sourceId.indexOf(":") > 0 ? row.sourceId.slice(0, row.sourceId.indexOf(":")) : null
      : row.recipient?.tenantId ?? null;
    const inquiryTenants = [...new Set(inquiryRows.map(sourceTenant))];
    const mailTenant = inquiryRows.length && first.sourceLifecycle === "tenant_event" ? sourceTenant(first)
      : first.recipient?.tenantId ?? inquiryTenants.find(tenantId => tenantId !== null) ?? null;
    // A configured business owner has tenantId:null. It must not erase the
    // originating tenant's mail override, including in a multi-site digest.
    if (first.recipient?.tenantId && !inquiryTenants.includes(first.recipient.tenantId)) inquiryTenants.push(first.recipient.tenantId);
    if (mailTenant && !inquiryTenants.includes(mailTenant)) inquiryTenants.push(mailTenant);
    if (inquiryRows.length && (!deps.urgentInquiryAllowed
      || inquiryRows.some(row => row.sourceLifecycle === "tenant_event" && !sourceTenant(row))
      || !(await Promise.all(inquiryTenants.map(tenantId => deps.urgentInquiryAllowed!(tenantId)))).every(Boolean))) {
      for (const row of rows) await deps.store.recordDelivery(row.workspaceId, row.id, kind, "suppressed", recipient, null, "inquiry_email_gates_off");
      summary.ownerNotTold += rows.length;
      return "suppressed";
    }
    const options = email(kind === "urgent" ? "urgent" : kind === "digest" ? "digest" : "reminder", first.businessName, rows, recipient);
    const subject = kind === "urgent" ? `${first.businessName}: a customer is waiting on you` : options.heading;
    const durableUrgent = inquiryUrgent && kind === "urgent";
    if (durableUrgent) {
      // Immediate delivery and the hourly chase share this SQL claim. A stale
      // not_sent projection cannot send after a timeout or failed checkpoint.
      if (rows.length !== 1 || !deps.store.claimInquiryNotice || !deps.store.finishInquiryNotice) {
        await deps.store.recordDelivery(first.workspaceId, first.id, kind, "suppressed", recipient, null, "inquiry_send_claim_unavailable");
        return "suppressed";
      }
      try {
        const claim = await deps.store.claimInquiryNotice(first, recipient, subject);
        if (!claim.acquired) {
          if (["accepted", "delivered", "deferred"].includes(claim.status)) return "sent";
          if (claim.status === "suppressed") return "suppressed";
          return "failed";
        }
      } catch {
        return "failed";
      }
    }
    if (inquiryNotice) options.paragraphs = [
      `New inquiry from ${inquiryNotice.name.slice(0, 160)}.`,
      ...(inquiryNotice.message ? [inquiryNotice.message.slice(0, 2000)] : []),
      ...(options.paragraphs ?? []),
    ];
    let result: SendEmailResult | null = null;
    let reason: string | null = null;
    try {
      result = await deps.sendEmail({
        audience: "client",
        // Client email is tenant-aware; without a linked tenant the global switch decides.
        ...(mailTenant ? { tenantId: mailTenant } : {}),
        to: recipient,
        subject,
        options,
        idempotencyKey: `needs-you:${kind}:${rows.map(row => row.id).sort().join(",")}`.slice(0, 256),
        tags: { stream: "needs_you", kind, ...(rows.every(row => row.sourceLifecycle === "booking_request") ? { lifecycle: "booking_request", bookingWorkspaceId: first.workspaceId } : {}), ...(durableUrgent ? { strelva_inquiry_decision_id: first.id, strelva_workspace_id: first.workspaceId } : {}) },
      });
    } catch (error) {
      reason = error instanceof Error ? error.message.slice(0, 200) : "send_failed";
    }
    const status = result?.status === "accepted" ? "sent" : result?.status === "suppressed" ? "suppressed" : "failed";
    if (durableUrgent) {
      // Provider acceptance is the result even if checkpoint persistence
      // fails. The earlier durable sending claim still excludes another send.
      await deps.store.finishInquiryNotice!(first, status === "sent" ? "accepted" : status === "suppressed" ? "suppressed" : "unknown",
        result?.status === "accepted" ? result.providerMessageId : null,
        result?.status === "accepted" ? result.acceptedAt : null,
        result?.status === "suppressed" ? result.reason : reason).catch(() => undefined);
      if (status === "suppressed") summary.ownerNotTold += 1;
      if (status === "failed") summary.failed += 1;
      return status;
    }
    for (const row of rows) {
      await deps.store.recordDelivery(row.workspaceId, row.id, kind, status, recipient,
        result?.status === "accepted" ? result.providerMessageId : null,
        result?.status === "suppressed" ? result.reason : reason);
    }
    if (status === "suppressed") summary.ownerNotTold += rows.length;
    if (status === "failed") summary.failed += rows.length;
    return status;
  }

  /** One just-created inquiry decision, without waiting for the hourly chase
   * or contacting any other business. Source revision is re-read before send. */
  async function deliverUrgentSource(workspaceId: string, sourceLifecycle: string, sourceId: string, inquiryNotice?: { name: string; message: string | null }): Promise<"sent" | "suppressed" | "failed" | "none"> {
    if (!deps.urgentInquiryAllowed) return "none";
    const adapter = adapterFor(sourceLifecycle);
    if (!adapter || adapter.needsMemberActor) return "none";
    const ctx = { workspaceId };
    const proposal = await adapter.propose(ctx);
    if (!proposal.complete) return "none";
    const proposed = proposal.items.find(item => item.sourceId === sourceId && item.sourceLifecycle === sourceLifecycle);
    if (!proposed || !proposed.urgent || proposed.route !== "owner_decides") return "none";
    await deps.store.open(workspaceId, proposed);
    const row = deps.store.deliveryForSource
      ? await deps.store.deliveryForSource(workspaceId, sourceLifecycle, sourceId)
      : (await deps.store.dueForDelivery(500)).find(item => item.workspaceId === workspaceId && item.sourceLifecycle === sourceLifecycle && item.sourceId === sourceId) ?? null;
    if (!row || row.state !== "open" || !row.urgent || row.route !== "owner_decides") return "none";
    if (await reconcile(ctx, row) !== "current") return "none";
    if (row.deliveryState !== "not_sent") return row.deliveryState === "suppressed" ? "suppressed" : row.deliveryState === "bounced" ? "failed" : "sent";
    if (!(await deps.urgentInquiryAllowed(row.recipient?.tenantId ?? null))) {
      await deps.store.recordDelivery(workspaceId, row.id, "urgent", "suppressed", row.recipient?.email ?? null, null, "inquiry_email_gates_off");
      return "suppressed";
    }
    const summary: ChaseSummary = { lapsed: 0, reminded: 0, digests: 0, urgent: 0, ownerNotTold: 0, failed: 0 };
    return (await deliver("urgent", [row], summary, inquiryNotice)) ?? "suppressed";
  }

  /** The hourly chase: lapse at day 14, urgent at once, morning email and reminders at 07:00 local. */
  async function chase(): Promise<ChaseSummary> {
    const now = deps.now();
    const summary: ChaseSummary = { lapsed: 0, reminded: 0, digests: 0, urgent: 0, ownerNotTold: 0, failed: 0 };
    // Open items for converted businesses even when nobody visits Home or
    // signs in: workspace sources are read as Strelva (system).
    const sessions = new Map<string, AdapterContext>();
    const linked = await deps.store.linkedTenants(null).catch(() => []);
    const native = await deps.bookingWorkspaces?.().catch(() => { summary.failed += 1; return []; }) ?? [];
    const pending = await deps.pendingWorkspaces?.().catch(() => { summary.failed += 1; return []; }) ?? [];
    for (const workspaceId of new Set([...linked.map(link => link.workspaceId), ...native, ...pending])) {
      await sync(await cronContext(workspaceId, sessions)).catch(() => { summary.failed += 1; });
      if (deps.bookingCalendarHealth) {
        const health = await deps.bookingCalendarHealth(workspaceId, { now, appOrigin: deps.appOrigin, sendEmail: deps.sendEmail }).catch(() => ({ digests: 0, ownerNotTold: 0, failed: 1, complete: false }));
        summary.digests += health.digests; summary.ownerNotTold += health.ownerNotTold; summary.failed += health.failed;
      }
    }
    const rows = await deps.store.dueForDelivery(500);
    const byBusiness = new Map<string, DeliveryRow[]>();
    for (const row of rows) byBusiness.set(row.workspaceId, [...(byBusiness.get(row.workspaceId) ?? []), row]);

    for (const [workspaceId, items] of byBusiness) {
      const morning = localHour(now, items[0]!.timezone) === DIGEST_HOUR;
      const digest: DeliveryRow[] = [];
      const remind1: DeliveryRow[] = [];
      const remind2: DeliveryRow[] = [];
      for (const row of items) {
        // Bookings own the 24 h / 72 h clock; the generic day 3/7/14
        // clock must never send another chase or expire an existing booking.
        const step = row.sourceLifecycle === "booking_request" && bookingRemindersEnabled() ? "none" : nextChaseStep(row, now);
        if (step === "lapse") {
          try {
            const expired = await deps.store.expire(workspaceId, row.id);
            const adapter = adapterFor(row.sourceLifecycle);
            const outcome = adapter
              ? await adapter.resolve({ workspaceId }, expired, "not_yet", { kind: "expiry" }).catch(() => ({ outcome: "failed" as const, reason: "resolver_threw" }))
              : { outcome: "failed" as const, reason: "no_adapter" };
            await deps.store.finish(workspaceId, row.id, outcome.outcome, outcome.reason ?? "Expired, nothing changed", null);
            summary.lapsed += 1;
          } catch {
            summary.failed += 1;
          }
          continue;
        }
        // Don't chase an ask whose source already moved on.
        const adapter = adapterFor(row.sourceLifecycle);
        const readCtx = adapter?.needsMemberActor ? await cronContext(workspaceId, sessions) : { workspaceId };
        if (adapter && (!adapter.needsMemberActor || readCtx.actor)) {
          const fresh = await reconcile(readCtx, row);
          if (fresh === "gone" || fresh === "changed") continue;
        }
        if (row.sourceLifecycle === "booking_request" && !bookingOwnerNoticeEnabled()) continue;
        if (deps.canDeliver && !(await deps.canDeliver(row))) { summary.ownerNotTold += 1; continue; }
        if (row.urgent && row.deliveryState === "not_sent"
          && (row.sourceLifecycle !== "booking_request" || !deps.bookingUrgentAllowed || await deps.bookingUrgentAllowed(workspaceId))) {
          await deliver("urgent", [row], summary);
          summary.urgent += 1;
          continue;
        }
        if (!morning) continue;
        if (row.deliveryState === "not_sent") digest.push(row);
        else if (step === "reminder_2") remind2.push(row);
        else if (step === "reminder_1") remind1.push(row);
      }
      if (digest.length) { await deliver("digest", digest, summary); summary.digests += 1; }
      if (remind1.length) { await deliver("reminder_1", remind1, summary); summary.reminded += remind1.length; }
      if (remind2.length) { await deliver("reminder_2", remind2, summary); summary.reminded += remind2.length; }
    }
    return summary;
  }

  /** One newly captured booking reaches its owner now, without chasing other work. */
  async function notifyBookingRequest(workspaceId: string, itemId: string): Promise<ChaseSummary> {
    const summary: ChaseSummary = { lapsed: 0, reminded: 0, digests: 0, urgent: 0, ownerNotTold: 0, failed: 0 };
    if (!bookingOwnerNoticeEnabled()) return summary;
    const row = (await deps.store.dueForDelivery(500)).find(item => item.workspaceId === workspaceId && item.id === itemId && item.sourceLifecycle === "booking_request" && item.state === "open" && item.urgent && item.deliveryState === "not_sent");
    if (!row || await reconcile({ workspaceId }, row) !== "current") return summary;
    if (deps.bookingUrgentAllowed && !await deps.bookingUrgentAllowed(workspaceId)) return summary;
    await deliver("urgent", [row], summary); summary.urgent = 1;
    return summary;
  }

  return { sync, list, review, decide, chase, notifyBookingRequest, deliverUrgentSource };
}

export type NeedsYouService = ReturnType<typeof createNeedsYouService>;
