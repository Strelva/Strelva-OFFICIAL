/**
 * Phase-2 dual-write helpers — the Postgres shadow-write of operational data.
 *
 * During the migration, Redis stays the source of truth and reads still come
 * from it; these helpers additionally write each record to Postgres so we can
 * validate parity before cutting reads over. Every repo call is null-safe (a
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
