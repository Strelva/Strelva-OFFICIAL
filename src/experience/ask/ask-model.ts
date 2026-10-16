import { actorLabel, recordedActor, type RecordedActor } from "@/platform/presentation/actor";
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
  actor?: RecordedActor | null;
  /** Recorded recipient of this Request, never the current viewer’s agency. */
  agencyName?: string | null;
  /** Exact saved candidate links supplied by the preparation port. */
  previewHref?: string;
  tryHref?: string;
  needsYou?: { route: string; itemRef: string | null; decideAt: string | null };
}

export interface AskTurnResult {
  kind: AskResultKind;
  items: AskReceiptItemView[];
  systemId: string | null;
  conversationId: string | null;
  saved: boolean;
  budgetRecovery?: "plan" | "agency";
  creationAction?: { kind: "website" | "booking"; label: string; href: string };
  /** One bounded question Strelva asks before it drafts (XA · AS2). Answering sends an ordinary message. */
  question?: AskQuestionView;
}

/**
 * A question with known answers Strelva read somewhere (a form, the business
 * record). The route does not emit this yet; the reader accepts it so the
 * screen is ready, and anything malformed reads as no question.
 */
export interface AskQuestionView {
  options: { label: string; source: string | null }[];
  /** What the add row says, e.g. "Add a plan the form doesn't have". */
  addLabel: string | null;
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

/** Only the bounded saved-message continuation can become a creation link. */
function readCreationAction(raw: unknown): AskTurnResult["creationAction"] {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  if ((value.kind !== "website" && value.kind !== "booking") || typeof value.label !== "string" || !value.label.trim() || value.label.length > 120 || typeof value.href !== "string") return undefined;
  const path = `/workspace/business/new/${value.kind}`;
  if (!value.href.startsWith(`${path}?`) || value.href.includes("\\") || /[\s#]/.test(value.href)) return undefined;
  const url = new URL(value.href, "https://strelva.invalid");
  if (url.pathname !== path) return undefined;
  const keys = ["workspaceId", "conversationId", "messageId"];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if ([...url.searchParams.keys()].some(key => !keys.includes(key)) || keys.some(key => url.searchParams.getAll(key).length !== 1 || !uuid.test(url.searchParams.get(key) ?? ""))) return undefined;
  return { kind: value.kind, label: value.label.trim(), href: value.href };
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
      actor: recordedActor(entry.actor),
      agencyName: text(entry.agencyName, 120).trim() || null,
      ...(sameAppPath(text(entry.previewHref, 4096)) ? { previewHref: sameAppPath(text(entry.previewHref, 4096)) } : {}),
      ...(sameAppPath(text(entry.tryHref, 4096)) ? { tryHref: sameAppPath(text(entry.tryHref, 4096)) } : {}),
      ...(needs ? { needsYou: { route: text(needs.route, 40), itemRef: typeof needs.itemRef === "string" ? needs.itemRef : null, decideAt: typeof needs.decideAt === "string" ? needs.decideAt : null } } : {}),
    }];
  }).slice(0, 20) : [];
  const creationAction = readCreationAction(value.creationAction);
  const question = readQuestion(value.question);
  return {
    kind: kind as AskResultKind,
    items,
    systemId: typeof value.systemId === "string" ? value.systemId : null,
    conversationId: typeof value.conversationId === "string" ? value.conversationId : null,
    saved: value.saved === true,
    ...((value.budgetRecovery === "plan" || value.budgetRecovery === "agency") ? { budgetRecovery: value.budgetRecovery } : {}),
    ...(creationAction ? { creationAction } : {}),
    ...(question ? { question } : {}),
  };
}

const PLAIN = /^[^\u0000-\u001f\u007f]+$/;

function readQuestion(raw: unknown): AskQuestionView | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.options) || value.options.length < 1 || value.options.length > 8) return undefined;
  const options = value.options.flatMap(option => {
    if (!option || typeof option !== "object") return [];
    const entry = option as Record<string, unknown>;
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    if (!label || label.length > 80 || !PLAIN.test(label)) return [];
    const source = typeof entry.source === "string" && entry.source.trim() && entry.source.length <= 60 && PLAIN.test(entry.source) ? entry.source.trim() : null;
    return [{ label, source }];
  });
  if (options.length !== value.options.length || new Set(options.map(option => option.label)).size !== options.length) return undefined;
  const addLabel = typeof value.addLabel === "string" && value.addLabel.trim() && value.addLabel.length <= 80 && PLAIN.test(value.addLabel) ? value.addLabel.trim() : null;
  return { options, addLabel };
}

/** The draft a finished turn produced, if any: the change the screen is about. */
export function latestDraft(messages: readonly AskMessageView[]): { message: AskMessageView; item: AskReceiptItemView } | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== "assistant" || !message.result) continue;
    const item = message.result.items.find(entry => entry.kind === "draft" && entry.status !== "failed");
    if (item) return { message, item };
    if (message.result.items.length || message.result.creationAction) return null;
  }
  return null;
}

/**
 * After the yes: what the decision record says happened to a drafted change.
 * Built from the Needs you item state and its What changed receipt
 * (src/platform/needs-you/contracts.ts). The Ask route does not read it yet;
 * callers that have it pass it in by the draft's item ref.
 */
export interface AskChangeOutcome {
  state: "approved" | "declined" | "expired" | "withdrawn";
  outcome: "done" | "done_unverified" | "failed" | null;
  decidedBy: string;
  decidedAt: string;
  /** Read back on the live page, when the receipt records it. */
  readBackAt: string | null;
  /** Every step, oldest first, each naming whoever acted. */
  steps: { at: string; text: string; by: { name: string; kind: "agency" | "owner" | "strelva" } }[];
  facts?: readonly (readonly [string, string])[];
  /** Minutes of agency time the record logged, when it logged any. */
  minutes?: { person: string; value: number; to: string } | null;
}

export interface ReceiptLine {
  key: string;
  tone: "done" | "waiting" | "failed";
  /** What happened, in one sentence. */
  text: string;
  /** Where the decision is made, when someone has one to make. A same-app path only. */
  decideHref?: string;
  openHref?: string;
  openLabel?: string;
  /** Ids, for the operator and for support. */
  ref?: string;
}

/** Only same-app paths become links; anything else is dropped. */
export function sameAppPath(value: string | null | undefined): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u0020\u007f]/.test(value)) return undefined;
  const parsed = new URL(value, "https://strelva.invalid");
  if (parsed.origin !== "https://strelva.invalid" || parsed.pathname !== value.split(/[?#]/)[0]) return undefined;
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
      const openHref = sameAppPath(item.tryHref) ?? sameAppPath(item.previewHref);
      return [{ key, tone: "done", text: `Opened a Possibility: ${item.summary || "an alternative"}. Nothing live changed. Make it live is a separate step.`, ...(openHref ? { openHref, openLabel: item.tryHref ? "Try it" : "Open preview" } : {}), decideHref: sameAppPath(item.needsYou?.decideAt), ref }];
    }
    return [{ key, tone: "done", text: `Request filed${item.agencyName ? ` for ${item.agencyName}` : ""}: ${item.summary || "your request"}. It's at Asked; scope and timing are agreed with you next.${item.actor ? ` Filed by ${actorLabel(item.actor)}.` : ""}`, ref }];
  });
}

/** The line under a finished turn, when there are no receipt items. */
export function resultHeadline(result: AskTurnResult): string | null {
  if (result.kind === "answer") return "Answered from what Strelva read. Nothing changed.";
  return null;
}

/** The route returns at most three bounded prompts, never raw contact or payer data. */
export function readAskSuggestions(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > 3 || raw.some(value => typeof value !== "string" || !value.trim() || value.length > 300 || /[\u0000-\u001f\u007f]/.test(value))) return null;
  return [...new Set(raw as string[])];
}

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
