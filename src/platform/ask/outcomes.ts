import { ACTOR_NOT_RECORDED, actorPresentation } from "@/platform/presentation/actor";
import type { RecordedActor } from "@/platform/workspaces/types";

/**
 * What happened to a change Ask Strelva drafted, once someone decided it
 * (XA · AS5). Joined from the Needs you decision (its state, outcome and who
 * decided) and the What changed receipt it points at (who put it live, when,
 * and whether it was read back). Nothing here is inferred: a missing actor
 * reads "Actor not recorded", and Live is claimed only from a done outcome.
 */
export interface AskChangeOutcome {
  state: "approved" | "declined" | "expired" | "withdrawn";
  /** Null while an approved change is still going live. */
  outcome: "done" | "done_unverified" | "failed" | null;
  /** Who sent it for a yes, and when the decision opened. */
  sentBy: string | null;
  sentAt: string | null;
  decidedBy: string;
  decidedAt: string;
  /** Who put it live and when, from the What changed receipt. */
  liveBy: string | null;
  liveAt: string | null;
  /** When the live page was read back, only when the receipt verified it. */
  readBackAt: string | null;
  /** Why it did not go live, when the decision records a reason. */
  reason: string | null;
  /** What the receipt says about reversing it. */
  undo: "available" | "needs_review" | "unavailable" | "undone" | null;
  /** Plain facts from the receipt, label then value. */
  facts?: [string, string][];
}

/** The parts of a Needs you decision this join reads (src/platform/needs-you/contracts.ts OwnerDecision). */
export interface AskDecisionRecord {
  id: string;
  state: "open" | "approved" | "declined" | "expired" | "withdrawn" | "superseded";
  outcome: "done" | "done_unverified" | "failed" | null;
  outcomeReason: string | null;
  receiptRef: string | null;
  decidedByKind: string | null;
  decidedAt: string | null;
  openedAt: string;
  actor?: RecordedActor | null;
  decidedActor?: RecordedActor | null;
}

/** The parts of a What changed receipt this join reads (HandledReceipt). */
export interface AskReceiptRecord {
  id: string;
  at: string;
  changed: string | null;
  actor?: RecordedActor;
  evidence: { providerAccepted: boolean; readBack: "verified" | "not_verified" | "not_checked" } | null;
  undo: { state: "undo" | "undo_needs_review" | "not_undoable" | "undone" };
}

const UNDO: Record<AskReceiptRecord["undo"]["state"], AskChangeOutcome["undo"]> = {
  undo: "available", undo_needs_review: "needs_review", not_undoable: "unavailable", undone: "undone",
};

/** The owner's name as the business record holds it: the owner recipient, else a verified person titled Owner. */
export function askOwnerName(record: { facts: Partial<Record<string, { value: unknown } | undefined>>; people: readonly { name: string; roleTitle: string | null; active: boolean; verified: boolean }[] } | null | undefined): string | null {
  if (!record) return null;
  const recipient = record.facts.owner_recipient?.value;
  const named = recipient && typeof recipient === "object" && "name" in recipient && typeof recipient.name === "string" ? recipient.name.trim() : "";
  if (named) return named.slice(0, 80);
  const person = (record.people ?? []).find(item => item.active && item.verified && /^owner$/i.test(item.roleTitle?.trim() ?? "") && item.name.trim());
  return person ? person.name.trim().slice(0, 80) : null;
}

function nameOf(actor: RecordedActor | null | undefined): string | null {
  return actorPresentation(actor).name;
}

/**
 * Outcomes by the draft's item ref, for refs that have been decided. Open
 * items are left out: the change is still waiting, which the draft shows.
 */
export function askOutcomes(input: { refs: readonly string[]; decisions: readonly AskDecisionRecord[]; receipts: readonly AskReceiptRecord[]; ownerName?: string | null }): Record<string, AskChangeOutcome> {
  const wanted = new Set(input.refs);
  const out: Record<string, AskChangeOutcome> = {};
  for (const decision of input.decisions) {
    if (!wanted.has(decision.id) || decision.state === "open" || !decision.decidedAt) continue;
    const receipt = decision.receiptRef ? input.receipts.find(item => item.id === decision.receiptRef) ?? null : null;
    const decidedBy = nameOf(decision.decidedActor)
      ?? (decision.decidedByKind === "owner_link" ? input.ownerName?.trim() || "The owner" : ACTOR_NOT_RECORDED);
    const done = decision.state === "approved" && (decision.outcome === "done" || decision.outcome === "done_unverified");
    out[decision.id] = {
      state: decision.state === "superseded" ? "withdrawn" : decision.state,
      outcome: decision.state === "approved" ? decision.outcome : null,
      sentBy: nameOf(decision.actor),
      sentAt: decision.openedAt || null,
      decidedBy,
      decidedAt: decision.decidedAt,
      liveBy: done && receipt ? nameOf(receipt.actor) ?? ACTOR_NOT_RECORDED : null,
      liveAt: done && receipt ? receipt.at : null,
      readBackAt: done && receipt?.evidence?.readBack === "verified" ? receipt.at : null,
      reason: decision.outcome === "failed" ? decision.outcomeReason?.trim() || null : null,
      undo: done && receipt ? UNDO[receipt.undo.state] : null,
      ...(done && receipt?.changed ? { facts: [["What changed", receipt.changed]] as [string, string][] } : {}),
    };
  }
  return out;
}

/** Item refs of the drafts saved in a conversation's results. */
export function askDraftRefs(messages: readonly { result: Record<string, unknown> | null }[]): string[] {
  const refs = new Set<string>();
  for (const message of messages) {
    const items = Array.isArray(message.result?.items) ? message.result.items as unknown[] : [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const entry = item as { kind?: unknown; needsYou?: { itemRef?: unknown } };
      if (entry.kind === "draft" && typeof entry.needsYou?.itemRef === "string") refs.add(entry.needsYou.itemRef);
    }
  }
  return [...refs].slice(0, 50);
}
