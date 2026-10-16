import { actorLabel, recordedActor, type RecordedActor } from "@/platform/presentation/actor";
import { STRELVA_HANDLED_LABEL, XA_PLACE_LABELS } from "@/platform/presentation/place-labels";
import { askChangeShowsSchema, askPossibilityExplainSchema, type AskChangeShows, type AskPossibilityExplain } from "@/platform/ask/contracts";
import type { AskChangeOutcome } from "@/platform/ask/outcomes";

export type { AskChangeOutcome } from "@/platform/ask/outcomes";

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
  /** The change or new System by its own name. */
  title?: string;
  /** A drafted website change as the decider reads it (AS3): Strelva's description of the saved draft. */
  shows?: Omit<AskChangeShows, "title">;
  /** A new System opened as a Possibility, in the owner's words (AS6). */
  explain?: AskPossibilityExplain;
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
  /** When it was said, for saved messages and the turn just sent. */
  at?: string | null;
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
      ...readView(entry),
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
const SHOWS = askChangeShowsSchema.omit({ title: true });

/** The title, change and explanation a receipt item may carry. Malformed parts are dropped, never the item. */
function readView(entry: Record<string, unknown>): Pick<AskReceiptItemView, "title" | "shows" | "explain"> {
  const title = typeof entry.title === "string" && entry.title.trim() && entry.title.length <= 120 && PLAIN.test(entry.title) ? entry.title.trim() : null;
  const shows = SHOWS.safeParse(entry.shows);
  const explain = askPossibilityExplainSchema.safeParse(entry.explain);
  return { ...(title ? { title } : {}), ...(shows.success && Object.keys(shows.data).length ? { shows: shows.data } : {}), ...(explain.success ? { explain: explain.data } : {}) };
}

const OUTCOME_STATES = new Set(["approved", "declined", "expired", "withdrawn"]);
const OUTCOME_RESULTS = new Set(["done", "done_unverified", "failed"]);
const UNDO_STATES = new Set(["available", "needs_review", "unavailable", "undone"]);
const iso = (value: unknown) => typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value)) ? value : null;
const name = (value: unknown) => typeof value === "string" && value.trim() && value.length <= 120 && PLAIN.test(value) ? value.trim() : null;

/** Outcomes from the conversation read, by item ref. Anything malformed is dropped: the draft then reads as waiting. */
export function readAskOutcomes(raw: unknown): Record<string, AskChangeOutcome> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, AskChangeOutcome> = {};
  for (const [ref, value] of Object.entries(raw as Record<string, unknown>).slice(0, 50)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;
    const decidedBy = name(entry.decidedBy);
    const decidedAt = iso(entry.decidedAt);
    if (typeof entry.state !== "string" || !OUTCOME_STATES.has(entry.state) || !decidedBy || !decidedAt) continue;
    const facts = Array.isArray(entry.facts) ? entry.facts.flatMap(row => Array.isArray(row) && row.length === 2 && name(row[0]) && typeof row[1] === "string" && row[1].trim() && row[1].length <= 300 ? [[name(row[0])!, row[1].trim()] as [string, string]] : []).slice(0, 6) : [];
    out[ref] = {
      state: entry.state as AskChangeOutcome["state"],
      outcome: typeof entry.outcome === "string" && OUTCOME_RESULTS.has(entry.outcome) ? entry.outcome as AskChangeOutcome["outcome"] : null,
      sentBy: name(entry.sentBy), sentAt: iso(entry.sentAt), decidedBy, decidedAt,
      liveBy: name(entry.liveBy), liveAt: iso(entry.liveAt), readBackAt: iso(entry.readBackAt),
      reason: typeof entry.reason === "string" && entry.reason.trim() && entry.reason.length <= 300 ? entry.reason.trim() : null,
      undo: typeof entry.undo === "string" && UNDO_STATES.has(entry.undo) ? entry.undo as AskChangeOutcome["undo"] : null,
      ...(facts.length ? { facts } : {}),
    };
  }
  return out;
}

/** Ideas to start from (AS1): the words, the System they touch, and what asking does. */
export interface AskIdeaView { text: string; kind: string; effect: string | null }

export function readAskIdeas(raw: unknown): AskIdeaView[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > 4) return null;
  const ideas = raw.flatMap((value): AskIdeaView[] => {
    if (!value || typeof value !== "object") return [];
    const entry = value as Record<string, unknown>;
    const words = typeof entry.text === "string" && entry.text.trim() && entry.text.length <= 300 && PLAIN.test(entry.text) ? entry.text.trim() : null;
    if (!words) return [];
    return [{ text: words, kind: typeof entry.kind === "string" && /^[a-z_-]{1,40}$/.test(entry.kind) ? entry.kind : "website", effect: typeof entry.effect === "string" && entry.effect.trim() && entry.effect.length <= 80 && PLAIN.test(entry.effect) ? entry.effect.trim() : null }];
  });
  return ideas.length === raw.length ? ideas : null;
}

/** Only the owner's name: who a drafted change waits for. */
export function readAskOwner(raw: unknown): string | null {
  return raw && typeof raw === "object" && "name" in raw ? name((raw as { name: unknown }).name) : null;
}

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
  owner_decides: `Waiting on the owner, on their ${XA_PLACE_LABELS.today}. Nothing is live until they say yes.`,
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
      const made = item.title ?? (item.summary.replace(/ · Draft$/, "") || "it");
      return [{ key, tone: "done", text: `I made ${made}. Nothing is on until it's turned on.`, ...(openHref ? { openHref, openLabel: item.tryHref ? "Try it" : "Open preview" } : {}), decideHref: sameAppPath(item.needsYou?.decideAt), ref }];
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
