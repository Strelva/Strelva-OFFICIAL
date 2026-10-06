/**
 * Tenant events (src/lib/events.ts, Redis-authoritative) mapped onto change
 * kinds, plus what route each one actually took today. Pure: no Redis, no
 * network. Used by the tenant adapter and the parity replay.
 */
import { createHash } from "node:crypto";
import type { UnifiedEvent } from "@/lib/types";
import type { ChangeKind, ChangeOrigin, Route } from "./contracts";
import type { EvaluationInput } from "./evaluator";
import { commitmentSignals } from "./inquiry-policy";

export interface TenantEventClassification {
  kind: ChangeKind;
  origin: ChangeOrigin;
  signals: EvaluationInput["signals"];
}

function meta(event: UnifiedEvent): Record<string, unknown> {
  return (event.metadata ?? {}) as Record<string, unknown>;
}

// Mirrors INQUIRY_MESSAGE_REVIEW_KIND in src/products/inquiries/delivery-approval-primitives.ts.
const INQUIRY_MESSAGE_REVIEW_KIND = "inquiry_delivery_approval";

/** Null when the event is not a proposed change at all (an incoming review, a booking, a read-back). */
export function classifyTenantEvent(event: UnifiedEvent): TenantEventClassification | null {
  const m = meta(event);
  const kind = typeof m.kind === "string" ? m.kind : "";
  const strelvaStarted = m.reviewAudience === "operator" || m.escalatedByOperator === true;
  const origin: ChangeOrigin = strelvaStarted ? "strelva" : "owner_interpreted";

  if (event.type === "suggestion") return { kind: "suggestion", origin: "strelva", signals: {} };
  if (event.type === "change_verify_failed") return { kind: "verify.failed", origin: "strelva", signals: {} };
  if (kind === "review_reply_draft") {
    const rating = typeof m.rating === "number" ? m.rating : undefined;
    return { kind: "review.reply", origin: "strelva", signals: rating === undefined ? {} : { reviewRating: rating } };
  }
  if (event.type === "newsletter_draft" || kind === "newsletter_approval") return { kind: "customer.broadcast", origin, signals: {} };
  if (kind === "manual_structural_change") return { kind: "structure", origin, signals: {} };
  if (kind === "gbp_post_draft") return { kind: "google.post", origin, signals: {} };
  if (kind === "gbp_photo_draft") return { kind: "google.photo", origin, signals: {} };
  // Hours Strelva drafted are inferred until the owner confirms them in the business record.
  if (kind === "gbp_hours_draft") return { kind: "fact.inferred", origin, signals: {} };
  if (kind === "offboarding_handoff_request") return { kind: "exit", origin: "owner_interpreted", signals: {} };
  if (kind === "inquiry_capability_publish") return { kind: "system.go_live", origin, signals: {} };
  if (kind === "inquiry_capability_undo") return { kind: "system.change_live", origin, signals: {} };
  if (kind === INQUIRY_MESSAGE_REVIEW_KIND) {
    // A drafted reply that quotes a price, names a time or makes a promise is
    // a commitment: always the owner's call (inquiry 1.0 delta, C6).
    const draft = [m.subject, m.messageBody].filter((v): v is string => typeof v === "string").join("\n");
    return { kind: commitmentSignals(draft).length ? "customer.commitment" : "customer.message", origin: "strelva", signals: {} };
  }
  if (event.type === "change_request") return { kind: "request.scope", origin: "owner_interpreted", signals: {} };
  if (kind === "agent_preview") {
    const reason = typeof m.governanceReason === "string" ? m.governanceReason : "";
    if (reason === "high_risk_facts") return { kind: "fact.inferred", origin, signals: {} };
    if (reason === "marketing_copy") return { kind: "copy.marketing", origin, signals: {} };
    if (reason === "structural") return { kind: "structure", origin, signals: {} };
    return { kind: "copy.routine", origin, signals: {} };
  }
  if (event.type === "content_update") return { kind: "copy.routine", origin: event.status === "auto_approved" ? "strelva" : origin, signals: {} };
  return null;
}

/**
 * The route the change actually took under today's rules. Reads only what the
 * event records: auto-published, posted after the review-reply window, held
 * for the operator, or shown to the owner.
 *
 * `change_verify_failed` events carried no `reviewAudience` before this
 * build, so the owner queue showed them. Their intended route is
 * strelva_reviews (fixed in src/lib/needs-you.ts); `verifyFailedLeaked`
 * reports which historic events were affected.
 */
export function observedTenantRoute(event: UnifiedEvent): { route: Route; verifyFailedLeaked: boolean } {
  const m = meta(event);
  if (event.type === "suggestion") return { route: "never", verifyFailedLeaked: false };
  if (event.type === "change_verify_failed") {
    return { route: "strelva_reviews", verifyFailedLeaked: event.status === "pending" && m.reviewAudience !== "operator" };
  }
  if (typeof m.autoPostAt === "string") return { route: "handle_after_notice", verifyFailedLeaked: false };
  if (event.status === "auto_approved") return { route: "handle", verifyFailedLeaked: false };
  if (m.reviewAudience === "operator" || m.escalatedByOperator === true) return { route: "strelva_reviews", verifyFailedLeaked: false };
  return { route: "owner_decides", verifyFailedLeaked: false };
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

/**
 * The revision a link binds. It covers what the owner would approve (title,
 * body and the drafted payload) and not execution bookkeeping, so an edited
 * reply makes old links refuse while a lock refresh does not.
 */
export function tenantEventRevision(event: UnifiedEvent): string {
  const m = { ...meta(event) };
  delete m.execution;
  delete m.reviewAudience;
  delete m.escalatedByOperator;
  return createHash("sha256").update(canonical({ id: event.id, tenantId: event.tenantId, type: event.type, title: event.title, body: event.body, metadata: m })).digest("hex");
}
