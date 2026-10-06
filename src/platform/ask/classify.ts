import type { AskRefusalCode } from "./contracts";

/**
 * Model-free first pass over the person's latest message. It settles, before
 * any model runs, the cases where the answer must not depend on a model:
 *
 *  - refusals (money, domains, people, exit, approvals in chat, direct sends,
 *    custom code, credentials). A refusal is one sentence and a next step.
 *  - the managed default: in a business Strelva runs for them, "build a new
 *    website", "redo the site" or "add a booking page" become a Request to
 *    Strelva without any special wording (audit P1 #7).
 *
 * Anything else goes to the model with the 18 tools. Matching is on whole
 * phrases, deliberately narrow; a miss falls through to the model, which has
 * no tool that can do any refused thing either.
 */

export type AskPreRoute =
  | { kind: "refusal"; code: AskRefusalCode }
  | { kind: "managed_request"; topic: "new_website" | "redo_website" | "booking_page" }
  | { kind: "offer_making"; topic: "new_website" | "redo_website" | "booking_page" }
  | { kind: "model" };

const CREDENTIALS = /\b(my|the|our)\s+(password|passcode|api[ -]?key|secret key|login details|2fa code)\b|\bpassword\s*(is|:)/i;
const APPROVAL = /^\s*(yes[,!.]?\s*)?(please\s+)?(approve|publish|go ahead and publish|make it live|push it live|ship it|send it|post it)(\s+(it|this|that|them|now|the change|the (hours|services|post|reply|newsletter)( change)?))*\s*(now|please)?[.!]*\s*$/i;
const APPROVE_WORD = /\b(i approve|approved\b|approve (it|this|that|the change)|you have my (yes|approval)|you'?re approved)\b/i;
const MONEY = /\b(billing|invoice|refund|stripe|pay ?link|payment link|my plan|plan price|subscription|cancel (my )?(plan|subscription)|charge (me|my card)|credit card)\b/i;
const DOMAINS = /\b(domain|dns|nameservers?|cname|a record|mx record)\b/i;
const PEOPLE = /\b(invite|add|remove|kick)\s+(\w+\s+){0,3}(as (an? )?(admin|owner|member)|to (the|my|our) (workspace|business|team)|from (the|my|our) (workspace|business|team))|\b(change|give) (\w+'s )?(role|access|permissions?)\b|\bmake \w+ (an? )?(admin|owner)\b/i;
const EXIT = /\b(delete|remove|close|shut down|cancel)\s+(my|the|our)\s+(account|workspace|business|site|website)\b|\b(export|download) (all )?(my|our) data\b|\bpause (my|the|our) (site|website|business)\b|\bleave strelva\b/i;
const DIRECT_SEND = /\b(send|email) (the|this|my|our) (newsletter|email|blast) (now|right now|immediately|without)|\bpost (it|this) (to|on) google (now|right now|directly)\b|\bpublish (it|this) (now|directly|without (approval|asking))\b/i;
const CUSTOM_CODE = /\b(write|build|deploy|ship) (me )?(some |the )?(custom )?code\b|\bcustom code\b|\b(react|next\.?js|docker) (app|build|component)\b/i;

const NEW_WEBSITE = /\b(build|make|create|set up|start)\s+(me\s+|us\s+)?(a\s+)?(brand[- ])?new\s+(web\s?)?site\b|\bnew website\b/i;
const REDO_WEBSITE = /\b(redo|rebuild|redesign|revamp|overhaul)\s+(the|my|our)\s+(whole\s+)?(web\s?)?site\b/i;
const BOOKING_PAGE = /\b(add|build|make|create|set up)\s+(a\s+|an\s+)?(online\s+)?(booking|appointment|scheduling)\s+(page|form|flow|system)\b/i;

export interface AskClassifyContext {
  /** Strelva runs this business's site for them (active link, or managed_client). */
  managed: boolean;
}

export function classifyAsk(text: string, context: AskClassifyContext): AskPreRoute {
  const message = text.trim().slice(0, 4_000);
  if (!message) return { kind: "model" };
  if (CREDENTIALS.test(message)) return { kind: "refusal", code: "credentials" };
  if (APPROVAL.test(message) || APPROVE_WORD.test(message)) return { kind: "refusal", code: "approval_in_chat" };
  if (MONEY.test(message)) return { kind: "refusal", code: "money" };
  if (DOMAINS.test(message)) return { kind: "refusal", code: "domains" };
  if (PEOPLE.test(message)) return { kind: "refusal", code: "people" };
  if (EXIT.test(message)) return { kind: "refusal", code: "exit_or_delete" };
  if (DIRECT_SEND.test(message)) return { kind: "refusal", code: "direct_send" };
  if (CUSTOM_CODE.test(message)) return { kind: "refusal", code: "custom_code" };
  const topic = REDO_WEBSITE.test(message) ? "redo_website" : NEW_WEBSITE.test(message) ? "new_website" : BOOKING_PAGE.test(message) ? "booking_page" : null;
  if (topic) return context.managed ? { kind: "managed_request", topic } : { kind: "offer_making", topic };
  return { kind: "model" };
}

export const MANAGED_REQUEST_SUMMARY: Record<"new_website" | "redo_website" | "booking_page", string> = {
  new_website: "A new website",
  redo_website: "Redo the website",
  booking_page: "A booking page",
};
