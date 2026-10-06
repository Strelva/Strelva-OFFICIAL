/**
 * Strelva handled: one read model over receipt stores that already exist
 * (read_strelva_handled in SQL, plus the linked tenant's events). It adds no
 * receipt store. Each receipt says, with Strelva as the subject, what was
 * done, and its undo state honestly: only a business record revision with
 * nothing after it is one tap; everything else says why it isn't.
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
      return { id: `decision:${id}`, store: "owner_decisions", systemId: null, sentence: `Strelva let "${str(row.title) ?? "an ask"}" lapse after 14 days. Nothing changed.`, at, changed: null, evidence: null,
        undo: { state: "not_undoable", reason: "Nothing changed, so there is nothing to undo." } };
    default:
      return null;
  }
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
