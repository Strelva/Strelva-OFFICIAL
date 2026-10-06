/**
 * Strelva handled: one read model over receipt stores that already exist
 * (read_strelva_handled in SQL, plus the linked tenant's events). It adds no
 * receipt store. Each receipt says, with Strelva as the subject, what was
 * done, and its undo state honestly: only a business record revision with
 * nothing after it is one tap; everything else says why it isn't. Decided
 * Needs you items (approved, Not yet, lapsed) are receipts too
 * (20261009130000_strelva_handled_decisions.sql).
 */
import type { UnifiedEvent } from "@/lib/types";
import type { HandledReceipt, UndoState } from "./contracts";

const FACT_LABELS: Record<string, string> = {
  hours: "hours", phone: "phone number", email: "email address", address: "address", service_area: "service area",
  links: "links", description: "description", legal_name: "legal name", display_name: "business name", owner_recipient: "contact for decisions",
};

const ROUTE_LABELS: Record<string, string> = {
  handle: "Strelva handles it", handle_after_notice: "Strelva handles it after notice", strelva_reviews: "Strelva reviews it", owner_decides: "you decide",
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function recordSentence(changes: unknown): { sentence: string; changed: string | null } {
  const entities = Array.isArray(changes) ? changes.filter((c): c is string => typeof c === "string") : [];
  const facts = entities.filter(e => e.startsWith("fact:")).map(e => FACT_LABELS[e.slice(5)] ?? e.slice(5).replace(/_/g, " "));
  const other = entities.filter(e => !e.startsWith("fact:"));
  if (facts.length && !other.length) return { sentence: `Strelva updated your ${facts.join(", ")} in your business record`, changed: facts.join(", ") };
  return { sentence: "Strelva updated your business record", changed: entities.length ? `${entities.length} ${entities.length === 1 ? "item" : "items"}` : null };
}

function recordUndo(value: unknown): UndoState {
  if (value === "undo") return { state: "undo" };
  if (value === "undone") return { state: "undone" };
  if (value === "not_undoable") return { state: "not_undoable", reason: "This was itself an undo." };
  return { state: "undo_needs_review", reason: "Something changed after this, so undoing it needs a look first." };
}

/** Map one row of read_strelva_handled. Unknown stores are dropped, never guessed at. */
export function handledFromStore(row: Record<string, unknown>): HandledReceipt | null {
  const at = str(row.at);
  const id = str(row.id);
  if (!at || !id) return null;
  switch (row.store) {
    case "business_record_revisions": {
      const { sentence, changed } = recordSentence(row.changes);
      return { id: `record:${id}`, store: "business_record_revisions", systemId: null, sentence, at, changed, evidence: null, undo: recordUndo(row.undo) };
    }
    case "website_document_receipts":
      return {
        id: `website:${id}`, store: "website_document_receipts", systemId: null,
        sentence: typeof row.revision === "number" ? `Strelva saved version ${row.revision} of your website` : "Strelva saved a new version of your website",
        at, changed: str(row.action), evidence: null,
        undo: { state: "undo_needs_review", reason: "Restoring an earlier version saves it as a new draft for your approval." },
      };
    case "decision_policy_history": {
      const kind = str(row.kind) ?? "a kind of change";
      const next = str(row.newRoute);
      const sentence = row.layer === "owner"
        ? `Your setting for ${kind} changed to ${next ? ROUTE_LABELS[next] ?? next : "Strelva's default"}`
        : `Strelva set ${kind} to ${next ? ROUTE_LABELS[next] ?? next : "its default"}`;
      return { id: `policy:${id}`, store: "decision_policy_history", systemId: null, sentence, at, changed: `${str(row.oldRoute) ?? "default"} → ${next ?? "default"}`, evidence: null,
        undo: { state: "not_undoable", reason: "Ask Strelva to change this setting back." } };
    }
    case "owner_decisions":
      return decisionReceipt(row, id, at);
    default:
      return null;
  }
}

const NOTHING_CHANGED = "Nothing changed, so there is nothing to undo.";

/** Kinds whose approval sent something to a person or a provider: sent stays sent. */
const SENT_KINDS = new Set(["review.reply", "review.reply_critical", "customer.message", "customer.broadcast", "google.post", "google.photo"]);

/**
 * The honest undo for an approved decision, by the lifecycle that carried it
 * out (needs-you spec, "Undo, honestly, by kind"). No lifecycle has a one-tap
 * undo of an owner's decision today, so none of these is `undo`: each says
 * what undoing would take, or why it can't be undone.
 */
export function approvedDecisionUndo(lifecycle: string | null, kind: string | null, receiptRef: string | null): UndoState {
  switch (lifecycle) {
    case "booking_request":
      return { state: "not_undoable", reason: "A confirmed booking isn't undone in one tap. Move or cancel it in Bookings, and the customer is told." };
    case "make_real":
      // An isolated run has no activation receipt (src/platform/needs-you/sources/make-real.ts).
      return receiptRef?.startsWith("make_real:")
        ? { state: "not_undoable", reason: "It ran on an isolated copy, so nothing live changed." }
        : { state: "undo_needs_review", reason: "Rolling it back is its own change. Ask Strelva and it rolls back step by step." };
    case "website_document":
      return { state: "undo_needs_review", reason: "Restoring an earlier version saves it as a new draft for your approval." };
    case "version_release":
    case "application_release":
      return { state: "undo_needs_review", reason: "Going back to the earlier release is a new release you approve." };
    case "tenant_event":
      if (kind && SENT_KINDS.has(kind)) return { state: "not_undoable", reason: "It was sent, and a sent reply or post can't be unsent from here." };
      return { state: "undo_needs_review", reason: "Undo drafts a revert that Strelva reviews before it goes live." };
    default:
      return { state: "not_undoable", reason: "This is an agreement, not an edit. Ask Strelva to change it." };
  }
}

function decider(kind: string | null): string {
  if (kind === "operator") return "Strelva reviewed it";
  if (kind === "admin_session") return "an admin decided";
  if (kind === "member_session") return "a member decided";
  return "you decided";
}

/**
 * One owner decision as a receipt: a lapse, or an approval or Not yet that
 * Strelva carried out. Strelva is the subject; the reason says what undo
 * would take. An approval that failed or is still finishing says so instead
 * of claiming it happened.
 */
function decisionReceipt(row: Record<string, unknown>, id: string, at: string): HandledReceipt | null {
  const title = str(row.title) ?? "an ask";
  const systemId = str(row.systemId);
  const base = { id: `decision:${id}`, store: "owner_decisions", systemId, at, evidence: null };
  const lifecycle = str(row.sourceLifecycle);
  if (row.state === "expired") {
    return { ...base, sentence: `Strelva let "${title}" lapse after 14 days. Nothing changed.`, changed: null, undo: { state: "not_undoable", reason: NOTHING_CHANGED } };
  }
  if (row.state !== "approved" && row.state !== "declined") return null;
  const who = decider(str(row.decidedByKind));
  if (row.outcome === "failed") {
    return { ...base, sentence: `Strelva couldn't finish "${title}" after ${who}. We're on it.`, changed: null,
      undo: { state: "not_undoable", reason: "It didn't go through, so there is nothing to undo yet." } };
  }
  if (row.outcome !== "done" && row.outcome !== "done_unverified") {
    return { ...base, sentence: `Strelva is finishing "${title}" after ${who}.`, changed: null,
      undo: { state: "not_undoable", reason: "It's still in progress. Check back shortly." } };
  }
  const unverified = row.outcome === "done_unverified";
  const evidence = unverified ? { providerAccepted: true, readBack: "not_verified" as const } : null;
  const booking = lifecycle === "booking_request" ? title.replace(/^Booking request:\s*/, "") : null;
  if (row.state === "declined") {
    if (booking) {
      return { ...base, evidence, sentence: `Strelva declined the booking request and released the time: ${booking}`, changed: str(row.notYetEffect),
        undo: { state: "not_undoable", reason: "The time was released and the customer was told. Offer them another time in Bookings." } };
    }
    return { ...base, evidence, sentence: `Strelva held off on "${title}", as ${who}.`, changed: str(row.notYetEffect), undo: { state: "not_undoable", reason: NOTHING_CHANGED } };
  }
  const sentence = booking
    ? `Strelva confirmed the booking ${who === "you decided" ? "you approved" : `(${who})`}: ${booking}`
    : `Strelva did "${title}" ${who === "you decided" ? "as you approved" : `after ${who}`}.`;
  const changed = lifecycle === "make_real" ? str(row.outcomeReason) ?? str(row.approveEffect) : str(row.approveEffect);
  return { ...base, evidence, sentence, changed, undo: approvedDecisionUndo(lifecycle, str(row.kind), str(row.receiptRef)) };
}

/**
 * The tenant events a decided Needs you item already accounts for, so one
 * approval doesn't show twice (the item's receipt wins). Tenant-event items
 * carry `<tenantId>:<eventId>` as their source id.
 */
export function decidedTenantEventIds(rows: readonly Record<string, unknown>[]): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.store !== "owner_decisions" || row.sourceLifecycle !== "tenant_event") continue;
    if (row.state !== "approved" && row.state !== "declined") continue;
    const source = str(row.sourceId);
    if (source) ids.add(source);
  }
  return ids;
}

/** What Strelva did on its own on a linked tenant: auto-published updates and review replies posted after the notice window. */
export function handledFromTenantEvent(event: UnifiedEvent): HandledReceipt | null {
  const m = (event.metadata ?? {}) as Record<string, unknown>;
  const at = event.resolvedAt ?? event.createdAt;
  if (m.kind === "review_reply_draft" && event.status === "approved" && typeof m.autoPostAt === "string") {
    const author = str(m.author);
    return {
      id: `tenant_event:${event.id}`, store: "tenant_events", systemId: null,
      sentence: author ? `Strelva replied to ${author}'s review on Google` : "Strelva replied to a review on Google",
      at, changed: null,
      evidence: { providerAccepted: true, readBack: "not_checked" },
      undo: { state: "not_undoable", reason: "Google has the reply; delete it on Google." },
    };
  }
  if (event.status === "auto_approved" && event.type === "content_update") {
    return {
      id: `tenant_event:${event.id}`, store: "tenant_events", systemId: null,
      sentence: `Strelva updated your website: ${event.title}`,
      at, changed: str(m.section),
      evidence: null,
      undo: { state: "undo_needs_review", reason: "Undo drafts a revert that Strelva reviews before it goes live." },
    };
  }
  return null;
}

/** Newest first, within the window. */
export function mergeHandled(receipts: readonly (HandledReceipt | null)[], since: number): HandledReceipt[] {
  return receipts
    .filter((r): r is HandledReceipt => Boolean(r) && Date.parse(r!.at) >= since)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
