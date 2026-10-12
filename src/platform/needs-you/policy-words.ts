/**
 * Plain words for routes and change kinds, shared by the owner and operator
 * settings screens. Pure; safe to import in client components.
 */
import type { ConfigurableKind, LadderRoute } from "./contracts";

export const ROUTE_WORDS: Record<LadderRoute, { label: string; detail: string }> = {
  handle: { label: "Strelva handles it", detail: "Strelva does it and tells you after." },
  handle_after_notice: { label: "Strelva handles it after notice", detail: "Strelva waits a while so you can stop it, then does it." },
  strelva_reviews: { label: "Strelva reviews it", detail: "A Strelva person checks it before it happens." },
  owner_decides: { label: "You decide", detail: "Nothing happens until you say yes." },
};

/** The kinds the settings screens list, in the order an owner thinks about them. */
export const POLICY_KIND_ORDER: readonly ConfigurableKind[] = [
  "review.reply", "review.reply_critical", "google.post", "google.photo",
  "copy.routine", "copy.marketing", "structure", "fact.owner_stated", "fact.inferred",
  "customer.message", "customer.commitment", "customer.broadcast",
  "system.go_live", "system.change_live", "system.pause",
  "running.approve", "request.scope", "access.grant", "money", "exit",
  "health.fix", "verify.failed",
];

export const KIND_WORDS: Record<ConfigurableKind, { label: string; example: string }> = {
  "review.reply": { label: "Replies to good reviews", example: "Answering a 4 or 5 star Google review" },
  "review.reply_critical": { label: "Replies to bad reviews", example: "Answering a 1 or 2 star Google review" },
  "google.post": { label: "Google posts", example: "A post on your Google listing" },
  "google.photo": { label: "Google photos", example: "A photo on your Google listing" },
  "copy.routine": { label: "Routine website edits", example: "Fixing a typo or refreshing event text" },
  "copy.marketing": { label: "New website copy", example: "A new headline or services description" },
  structure: { label: "Website structure", example: "A new page, navigation or theme" },
  "fact.owner_stated": { label: "Details you gave us", example: "New hours you emailed, pushed to your site and Google" },
  "fact.inferred": { label: "Details Strelva found", example: "A price read off an old page" },
  "customer.message": { label: "Replies to customers", example: "Answering a new inquiry" },
  "customer.commitment": { label: "Promises to customers", example: "Quoting a price or promising a date" },
  "customer.broadcast": { label: "Newsletters", example: "An email to your whole list" },
  "system.go_live": { label: "Putting something live", example: "Launching a new page or booking flow" },
  "system.change_live": { label: "Changing something live", example: "Releasing an update to a live booking page" },
  "system.pause": { label: "Pausing something", example: "Taking a booking page offline" },
  "running.approve": { label: "Ongoing work", example: "Strelva keeping your Google hours in sync" },
  "request.scope": { label: "Agreeing work", example: "Scope and deadline for a request" },
  "access.grant": { label: "Access", example: "Letting an agency or person in" },
  money: { label: "Money", example: "Accepting a job or changing who pays" },
  exit: { label: "Leaving or exporting", example: "Taking your business out of Strelva" },
  "health.fix": { label: "Fixes", example: "Retrying a failed check" },
  "verify.failed": { label: "Unconfirmed changes", example: "Google accepted a change Strelva couldn't read back" },
};

/**
 * Kinds that are Strelva's own housekeeping, not the owner's to set:
 * `verify.failed` never reaches the owner as a decision (spec section 4).
 */
export const OPERATOR_ONLY_KIND_LIST: readonly ConfigurableKind[] = ["verify.failed", "health.fix"];
