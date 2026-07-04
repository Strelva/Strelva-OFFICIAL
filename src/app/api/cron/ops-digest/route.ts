/**
 * Operator ops-digest cron.
 *
 * Once a day, emails the operators (Noah + Jacob) ONE digest summarizing the
 * whole portfolio: unworked leads, at-risk clients (name + top reason), and
 * recent signups. This is the "what's happening across everything" glance so no
 * operator has to open the admin console to know where the day stands.
 *
 * OPERATOR notification: gated on operatorEmailsEnabled() (ON by default) inside
 * the sender, independent of the client email pause. Best-effort and fail-soft —
 * a failed digest never fails the cron's 200.
 *
 * Auth: handled by proxy (CRON_SECRET check).
 * Schedule: see vercel.json.
 */

import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { getDeliveryLeads } from "@/lib/access-request-delivery";
import { getAtRiskTenants } from "@/lib/churn";
import { getAllTenants } from "@/lib/tenants";
import { sendOpsDigestEmail } from "@/lib/delivery-email";

export const maxDuration = 300;

const SIGNUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Where the "Open the ops board" button points. */
function opsBoardUrl(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://app.strelva.com";
  return new URL("/admin", base).toString();
}

export async function GET() {
  try {
    const [leads, tenants, atRiskSignals] = await Promise.all([
      getDeliveryLeads().catch(() => []),
      getAllTenants().catch(() => []),
      getAtRiskTenants().catch(() => []),
    ]);

    // "Unworked" = still at the first pipeline step (nobody has moved it yet).
    const unworkedLeads = leads.filter((lead) => lead.deliveryStatus === "received").length;

    // Resolve at-risk tenant ids to their business names for a readable digest.
    const nameById = new Map(tenants.map((tenant) => [tenant.id, tenant.siteName]));
    const atRisk = atRiskSignals.map((signal) => ({
      name: nameById.get(signal.tenantId) ?? signal.tenantId,
      reason: signal.reasons[0] ?? "At risk",
    }));

    // Recent signups: tenants whose subscription started within the last week.
    const since = Date.now() - SIGNUP_WINDOW_MS;
    const recentSignups = tenants
      .filter((tenant) => {
        const started = tenant.subscriptionStartedAt
          ? new Date(tenant.subscriptionStartedAt).getTime()
          : NaN;
        return Number.isFinite(started) && started >= since;
      })
      .map((tenant) => tenant.siteName);

    const sent = await sendOpsDigestEmail({
      totalLeads: leads.length,
      unworkedLeads,
      atRisk,
      recentSignups,
      opsUrl: opsBoardUrl(),
      logPrefix: "[cron ops-digest]",
    });

    await recordHeartbeat("ops-digest", { ok: true });

    return NextResponse.json({
      ok: true,
      totalLeads: leads.length,
      unworkedLeads,
      atRisk: atRisk.length,
      recentSignups: recentSignups.length,
      sent,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron ops-digest] failed:", err);
    await recordHeartbeat("ops-digest", { ok: false });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
