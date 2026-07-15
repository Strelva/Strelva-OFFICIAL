/**
 * Postgres mirror helpers for Redis-authoritative operational data.
 *
 * Redis stays the source of truth for the stores that call these helpers; the
 * mirror supports durability analysis and a future explicit cutover. Every repo call is null-safe (a
 * no-op when Supabase is unconfigured) and never throws, so a dual-write can
 * only ever ADD a row, never break the live Redis path.
 *
 * Kill-switch: set DUAL_WRITE_PG=0 (or "false") to disable the shadow-write
 * without a redeploy (a flag flip in Vercel env). Default is on — but because
 * the repos are null-safe, "on" is still inert until Supabase env is present.
 */

import type { Insert } from "./client";
import type { UnifiedEvent } from "../types";
import type { MailRecord } from "../storage/mail-log";

/** True unless explicitly disabled. Repos remain no-ops when Supabase is unset. */
export function dualWritePgEnabled(): boolean {
  const flag = process.env.DUAL_WRITE_PG;
  return flag !== "0" && flag !== "false";
}

/**
 * SEPARATE kill-switch for the governed-work (proposals/decisions/execution_attempts/
 * outcomes) shadow-write — NOT the same knob as DUAL_WRITE_PG. Defaults OFF and only
 * turns on for an explicit "1"/"true", the inverse of dualWritePgEnabled(): those
 * tables' migration (#7) is intentionally UNAPPLIED, so this must stay off by default
 * until it is applied. See docs/ontology-phase2-governed-work.md.
 */
export function governedWorkDualWriteEnabled(): boolean {
  const flag = process.env.GOVERNED_WORK_DUAL_WRITE;
  return flag === "1" || flag === "true";
}

/** UnifiedEvent (camelCase, Redis) -> unified_events row (snake_case, Postgres). */
export function eventToInsert(e: UnifiedEvent): Insert<"unified_events"> {
  return {
    id: e.id,
    tenant_id: e.tenantId,
    source: e.source,
    type: e.type,
    title: e.title,
    body: e.body,
    status: e.status,
    metadata: (e.metadata ?? null) as Insert<"unified_events">["metadata"],
    created_at: e.createdAt,
    resolved_at: e.resolvedAt ?? null,
  };
}

/** MailRecord (Redis) -> mail_log row (Postgres). ts is epoch ms -> ISO. */
export function mailToInsert(r: MailRecord): Insert<"mail_log"> {
  return {
    tenant_id: r.tenant,
    kind: r.kind,
    ok: r.ok,
    message_id: r.messageId ?? null,
    error: r.error ?? null,
    recipient_email: r.to ?? null,
    ts: new Date(r.ts).toISOString(),
  };
}

/** The Stripe-webhook build-payment record -> build_payments row (Postgres). */
export function buildPaymentToInsert(p: {
  sessionId: string;
  paySlug: string | null;
  leadSlug: string | null;
  tenantId: string | null;
  amountCents: number | null;
  currency: string;
  customerEmail?: string;
  createdAt: string;
}): Insert<"build_payments"> {
  return {
    session_id: p.sessionId,
    amount_cents: p.amountCents ?? 0,
    currency: p.currency,
    customer_email: p.customerEmail ?? null,
    lead_slug: p.leadSlug,
    pay_slug: p.paySlug,
    tenant_id: p.tenantId,
    created_at: p.createdAt,
  };
}
