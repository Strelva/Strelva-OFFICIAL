import type { AiVisibilityScorecard } from "@/platform/infra/ai-visibility-scorecard";

/**
 * What AI says when people ask for a business like this one.
 *
 * Honesty rails, shared with `src/lib/ai-visibility-scorecard.ts`:
 *  - Only assistants that were actually probed get a column.
 *  - A cell is either "mentioned" or "wrong info, fixed". Anything else
 *    (unprobed, not named) is omitted, never drawn as "not mentioned".
 *  - A query with no positive cell is omitted, not listed as missing.
 */

export type AiMirrorCellState = "mentioned" | "wrong_info_fixed";

export interface AiMirrorAssistant {
  id: string;
  label: string;
}

export interface AiMirrorRow {
  query: string;
  /** Keyed by assistant id. Missing keys are omitted cells. */
  cells: Partial<Record<string, AiMirrorCellState>>;
}

export interface AiMirrorCitation {
  label: string;
  href?: string;
}

export interface AiMirrorAnswer {
  /** What the person asked, verbatim. */
  query: string;
  /** The answer excerpt, verbatim. Contains the business name to highlight. */
  text: string;
  citations: AiMirrorCitation[];
}

export interface AiMirrorData {
  eyebrow: string;
  businessName: string;
  /** Probed answers that name the business. */
  mentionedCount: number;
  /** Answers actually probed (the honest denominator). */
  total: number;
  /** A sentence of real context ("Up from 11 in July."). Optional. */
  summary?: string;
  answer: AiMirrorAnswer | null;
  /** Probed assistants only. */
  assistants: AiMirrorAssistant[];
  rows: AiMirrorRow[];
  /** When the latest probe ran, ISO. */
  checkedAt?: string | null;
}

export interface AiMirrorMatrix {
  assistants: AiMirrorAssistant[];
  rows: AiMirrorRow[];
  /** True when any shown cell is wrong-info-fixed, so the legend needs that key. */
  hasFixed: boolean;
}

const positive = (state: unknown): state is AiMirrorCellState => state === "mentioned" || state === "wrong_info_fixed";

/**
 * The matrix as rendered: assistants with at least one probed result kept in
 * the order given; cells reduced to positive states; rows with no positive
 * cell dropped.
 */
export function aiMirrorMatrix(assistants: readonly AiMirrorAssistant[], rows: readonly AiMirrorRow[]): AiMirrorMatrix {
  const ids = new Set(assistants.map(assistant => assistant.id));
  const cleaned = rows.map(row => ({
    query: row.query,
    cells: Object.fromEntries(Object.entries(row.cells).filter(([id, state]) => ids.has(id) && positive(state))) as Partial<Record<string, AiMirrorCellState>>,
  })).filter(row => Object.keys(row.cells).length > 0);
  return {
    assistants: [...assistants],
    rows: cleaned,
    hasFixed: cleaned.some(row => Object.values(row.cells).includes("wrong_info_fixed")),
  };
}

/** Headline. Only claims a share when answers were actually probed. */
export function aiMirrorHeadline(data: Pick<AiMirrorData, "mentionedCount" | "total">): string {
  if (data.total <= 0) return "AI answers aren't checked yet.";
  if (data.mentionedCount <= 0) return `Strelva checked ${data.total} AI ${data.total === 1 ? "answer" : "answers"} this week.`;
  return `You're in ${data.mentionedCount} of ${data.total} ${data.total === 1 ? "answer" : "answers"}.`;
}

/** Split an answer around the first case-insensitive occurrence of the business name. */
export function splitAnswer(text: string, name: string): { before: string; match: string; after: string } | null {
  if (!name.trim()) return null;
  const at = text.toLowerCase().indexOf(name.toLowerCase());
  if (at < 0) return null;
  return { before: text.slice(0, at), match: text.slice(at, at + name.length), after: text.slice(at + name.length) };
}

/** The assistant the weekly visibility probe asks today. */
export const PROBED_ASSISTANT: AiMirrorAssistant = { id: "gemini", label: "Gemini" };

/**
 * Adapter from the owner scorecard. Today one assistant is probed, so the
 * matrix has one column; listed queries are the ones that named the business.
 * Returns null when tracking hasn't started (the scorecard is null).
 */
export function aiMirrorFromScorecard(scorecard: AiVisibilityScorecard | null, options: { businessName: string; area?: string; assistant?: AiMirrorAssistant }): AiMirrorData | null {
  if (!scorecard) return null;
  const assistant = options.assistant ?? PROBED_ASSISTANT;
  const hasData = scorecard.hasData && scorecard.total > 0;
  const fresh = scorecard.newlyAppeared.length;
  return {
    eyebrow: options.area ? `When ${options.area} asks AI` : "When people ask AI",
    businessName: options.businessName,
    mentionedCount: hasData ? scorecard.mentionedCount : 0,
    total: hasData ? scorecard.total : 0,
    summary: hasData && fresh ? `New this week in ${fresh} ${fresh === 1 ? "answer" : "answers"}.` : undefined,
    answer: null,
    assistants: hasData ? [assistant] : [],
    rows: hasData ? scorecard.mentionedQueries.map(query => ({ query, cells: { [assistant.id]: "mentioned" as const } })) : [],
    checkedAt: scorecard.checkedAt,
  };
}
