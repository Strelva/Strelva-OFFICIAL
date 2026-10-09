import { STRELVA_HANDLED_LABEL } from "@/platform/presentation/place-labels";

/**
 * Browser-side model for Ask Strelva (docs/product/specs/ask-strelva.md).
 *
 * The route streams text plus `__TOOL__`, `__CARD__` and `__RESULT__` lines
 * (src/experience/conversation/stream.ts decodes them). The final result
 * carries `ask`: the turn's result kind and its receipt items. This module
 * turns those into the sentences the person reads. It never claims more than
 * the receipt says: a draft is "not live", a Request is "at Asked", and a
 * refusal adds nothing beyond what Strelva already said.
 */

export type AskResultKind = "answer" | "draft" | "possibility" | "request" | "refusal";

export interface AskReceiptItemView {
  kind: Exclude<AskResultKind, "answer">;
  toolId: string;
  status: "queued" | "drafted" | "opened" | "filed" | "refused" | "failed";
  ids: string[];
  summary: string;
  needsYou?: { route: string; itemRef: string | null; decideAt: string | null };
}

export interface AskTurnResult {
  kind: AskResultKind;
  items: AskReceiptItemView[];
  systemId: string | null;
  conversationId: string | null;
  saved: boolean;
}

export interface AskMessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  result: AskTurnResult | null;
  /** Assistant message still streaming. */
  pending?: boolean;
  askedOnBehalf?: "email" | "phone" | null;
}

export interface AskConversationSummaryView {
  id: string;
  systemId: string | null;
  title: string;
  messageCount: number;
  mine: boolean;
  updatedAt: string;
}

const KINDS = new Set<AskResultKind>(["answer", "draft", "possibility", "request", "refusal"]);
const STATUSES = new Set(["queued", "drafted", "opened", "filed", "refused", "failed"]);

function text(value: unknown, max = 600): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/** Reads the `ask` block of a streamed result, or a stored message's result. Anything malformed reads as no result. */
export function readAskResult(raw: unknown): AskTurnResult | null {
  if (!raw || typeof raw !== "object") return null;
  const value = ("ask" in raw && raw.ask && typeof raw.ask === "object" ? raw.ask : raw) as Record<string, unknown>;
  const kind = value.kind;
  if (typeof kind !== "string" || !KINDS.has(kind as AskResultKind)) return null;
  const items = Array.isArray(value.items) ? value.items.flatMap((item): AskReceiptItemView[] => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    if (typeof entry.kind !== "string" || !KINDS.has(entry.kind as AskResultKind) || entry.kind === "answer") return [];
    if (typeof entry.status !== "string" || !STATUSES.has(entry.status)) return [];
    const needs = entry.needsYou && typeof entry.needsYou === "object" ? entry.needsYou as Record<string, unknown> : null;
    return [{
      kind: entry.kind as AskReceiptItemView["kind"],
      toolId: text(entry.toolId, 80),
      status: entry.status as AskReceiptItemView["status"],
      ids: Array.isArray(entry.ids) ? entry.ids.filter((id): id is string => typeof id === "string").slice(0, 10) : [],
      summary: text(entry.summary, 300),
      ...(needs ? { needsYou: { route: text(needs.route, 40), itemRef: typeof needs.itemRef === "string" ? needs.itemRef : null, decideAt: typeof needs.decideAt === "string" ? needs.decideAt : null } } : {}),
    }];
  }).slice(0, 20) : [];
  return {
    kind: kind as AskResultKind,
    items,
    systemId: typeof value.systemId === "string" ? value.systemId : null,
    conversationId: typeof value.conversationId === "string" ? value.conversationId : null,
    saved: value.saved === true,
  };
}

export interface ReceiptLine {
  key: string;
  tone: "done" | "waiting" | "failed";
  /** What happened, in one sentence. */
  text: string;
  /** Where the decision is made, when someone has one to make. A same-app path only. */
  decideHref?: string;
  /** Ids, for the operator and for support. */
  ref?: string;
}

/** Only same-app paths become links; anything else is dropped. */
export function sameAppPath(value: string | null | undefined): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return undefined;
  return value;
}

const ROUTE_LINE: Record<string, string> = {
  owner_decides: "Waiting on the owner in Needs you. Nothing is live until they say yes.",
  strelva_reviews: "It is reviewed first. Nothing is live yet.",
  handle_after_notice: "The change will be made after a notice. Nothing is live yet.",
  handle: `The change will be made and reported under ${STRELVA_HANDLED_LABEL}.`,
  never: "Nothing was sent anywhere.",
};

/** One line per receipt item, in the order they happened. Refusals add no line: Strelva already said why. */
export function receiptLines(result: AskTurnResult): ReceiptLine[] {
  return result.items.flatMap((item, index): ReceiptLine[] => {
    const key = `${index}:${item.toolId}:${item.ids.join(",")}`;
    const ref = item.ids.length ? item.ids.join(", ") : undefined;
    if (item.kind === "refusal") return [];
    if (item.status === "failed") {
      const what = item.kind === "request" ? "filed" : item.kind === "possibility" ? "opened" : "drafted";
      return [{ key, tone: "failed", text: `Couldn't be ${what}: ${item.summary || "nothing changed"}. Nothing was sent.` }];
    }
    if (item.kind === "draft") {
      const route = item.needsYou?.route ? ROUTE_LINE[item.needsYou.route] : undefined;
      return [{ key, tone: "waiting", text: `Drafted: ${item.summary || "a change"}. ${route ?? "It is not live."}`, decideHref: sameAppPath(item.needsYou?.decideAt), ref }];
    }
    if (item.kind === "possibility") {
      return [{ key, tone: "done", text: `Opened a Possibility: ${item.summary || "an alternative"}. Nothing live changed. Make real is a separate step.`, ref }];
    }
    return [{ key, tone: "done", text: `Filed for Strelva: ${item.summary || "your request"}. It's at Asked; scope and timing are agreed with you next.`, ref }];
  });
}

/** The line under a finished turn, when there are no receipt items. */
export function resultHeadline(result: AskTurnResult): string | null {
  if (result.kind === "answer") return "Answered from what Strelva read. Nothing changed.";
  return null;
}

export const ASK_EXAMPLES = {
  home: ["What changed on my site this month?", "How many inquiries came in this week?", "Add estate planning consults to our services"],
  system: ["What does the homepage say right now?", "Put the holiday gift boxes at the top of the homepage", "Add a private events page"],
} as const;

/** Errors from the route, in words the person can act on. */
export function askErrorMessage(status: number, fallback: string | null): string {
  if (status === 401) return "Sign in again to keep asking. Your words are still in the box.";
  if (status === 403) return fallback || "This business is unavailable to your account.";
  if (status === 404) return fallback || "This conversation is unavailable to your account.";
  if (status === 409) return fallback || "This conversation changed. Start a new one.";
  if (status === 429) return "Too many requests. Try again in a minute.";
  if (status === 503) return fallback?.includes("not enabled") ? "Ask Strelva isn't on for this business yet. Nothing was sent." : "Strelva can't answer right now. Nothing was changed.";
  return fallback || "Strelva can't answer right now. Nothing was changed.";
}
/** A storage outage is not a release switch. Only an explicit release refusal is off. */
export function askHistoryFailure(status: number, body: unknown): "off" | "unavailable" {
  const error = body && typeof body === "object" && "error" in body ? body.error : null;
  return status === 503 && typeof error === "string" && /^Ask Strelva is not enabled\b/.test(error) ? "off" : "unavailable";
}
