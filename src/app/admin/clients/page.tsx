import { redirect } from "next/navigation";
import Link from "next/link";
import { isSuperAdmin } from "@/lib/auth";
import { getAllTenants, isActiveTenant } from "@/lib/tenants";

import { getActivity, listDrafts } from "@/lib/storage";
import { listThreads } from "@/lib/threads";
import { getWeeklyBrief } from "@/lib/weekly-brief";
import { getScanSummary } from "@/lib/scan-store";
import { getAtRiskTenants, type AtRiskSignal } from "@/lib/churn";
import { getEffectiveSubscriptionStatus } from "@/lib/subscription";
import { getTenantLaunchReadinessResults } from "@/lib/production-readiness-rules";
import { buildTenantLaunchReadiness, tenantHasOwnerMessage } from "@/lib/launch-readiness";
import { ScanAllButton } from "../ScanAllButton";
import { ClientsCrm, type ClientRow } from "./ClientsCrm";
import { getTenantSiteName } from "@/lib/tenant-display";
import { billingLabel, billingMonthlyCents, isBillingConfigured, resolveBillingType } from "@/lib/billing-type";

/** The client's public domain (bare host), from productionDomain or siteUrl; null for
 *  a tenant not yet on its own domain (a *.strelva.com / *.vercel.app placeholder). */
function clientDomain(t: { productionDomain?: string; siteUrl?: string }): string | null {
  const raw = (t.productionDomain || t.siteUrl || "").trim().toLowerCase();
  if (!raw) return null;
  const host = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!host || host.endsWith(".strelva.com") || host.endsWith(".vercel.app")) return null;
  return host;
}

export const dynamic = "force-dynamic";

export default async function AdminClientsPage() {
  // Defense in depth: the admin layout already gates every /admin route on
  // super-admin, but mirror the guard here so this page never renders client
  // data for a non-admin even if the layout chain changes.
  if (!(await isSuperAdmin())) redirect("/");

  const tenants = await getAllTenants();

  // Per-client signals: health grade, launch status, at-risk.
  const [atRiskSignals, rows] = await Promise.all([
    getAtRiskTenants().catch((): AtRiskSignal[] => []),
    Promise.all(
      tenants.map(async (t) => {
        const [activity, drafts, threads, weeklyBrief, effectiveSubscriptionStatus, scan] = await Promise.all([
          getActivity(t.id).catch(() => []),
          listDrafts(t.id).catch(() => ({} as Record<string, boolean>)),
          listThreads(t.id).catch(() => []),
          getWeeklyBrief(t.id).catch(() => null),
          getEffectiveSubscriptionStatus(t.id).catch(() => t.subscriptionStatus ?? "none"),
          getScanSummary(t.id).catch(() => null),
        ]);
        const launchReadiness = buildTenantLaunchReadiness({
          tenant: { ...t, subscriptionStatus: effectiveSubscriptionStatus },
          infrastructure: getTenantLaunchReadinessResults(t),
          activity,
          threadCount: threads.length,
          hasOwnerMessage: tenantHasOwnerMessage(threads),
          draftCount: Object.keys(drafts).length,
          hasWeeklyBrief: Boolean(weeklyBrief),
        });
        return {
          id: t.id,
          lastActivity: activity[0]?.time ?? null,
          seoGrade: scan?.grade ?? null,
          launchScore: launchReadiness.score,
          launchStatus: launchReadiness.status,
        };
      })
    ),
  ]);

  const atRiskById = new Map(atRiskSignals.map((s) => [s.tenantId, s]));
  const rowById = new Map(rows.map((r) => [r.id, r]));

  const clients: ClientRow[] = tenants.map((t) => {
    const row = rowById.get(t.id);
    return {
      id: t.id,
      // Resolve the display name the SAME way the client dashboard does
      // (config.siteName → known-tenant map → owner name → id) so the operator
      // never sees a bare owner name for a business whose site_name column is blank.
      siteName: getTenantSiteName(t.id, t),
      ownerEmail: t.ownerEmail ?? null,
      ownerName: t.ownerName ?? null,
      domain: clientDomain(t),
      active: isActiveTenant(t),
      atRiskReason: atRiskById.get(t.id)?.reasons[0] ?? null,
      seoGrade: row?.seoGrade ?? null,
      launchStatus: row?.launchStatus ?? null,
      billingLabel: billingLabel(t),
      billingConfigured: isBillingConfigured(t),
    };
  });

  const activeClients = clients.filter((c) => c.active);
  const activeCount = activeClients.length;

  // MRR roll-up across active tenants only
  const activeTenants = tenants.filter((t) => isActiveTenant(t));
  const mrrCents = activeTenants.reduce((sum, t) => sum + billingMonthlyCents(t), 0);
  const mrrDollars = Math.round(mrrCents / 100);
  const mrrFormatted = `$${mrrDollars.toLocaleString("en-US")}/mo`;

  // Billing breakdown counts
  const payingCount = activeTenants.filter((t) => billingMonthlyCents(t) > 0).length;
  const freeCount = activeTenants.filter((t) => resolveBillingType(t) === "case_study").length;
  const noPlanCount = activeTenants.filter((t) => resolveBillingType(t) === "none").length;

  const breakdownParts: string[] = [];
  if (payingCount > 0) breakdownParts.push(`${payingCount} paying`);
  if (freeCount > 0) breakdownParts.push(`${freeCount} free`);
  if (noPlanCount > 0) breakdownParts.push(`${noPlanCount} no plan`);
  const mrrBreakdown = breakdownParts.join(" · ");

  return (
    <div className="max-w-6xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-medium tracking-[-0.02em] text-warm-white sm:text-[30px]">
            Clients
          </h1>
          <p className="mt-1.5 text-[13px] text-gray-muted">
            One list for every business you manage a site for <span className="text-gray-faint">·</span>{" "}
            <b className="font-semibold text-warm-white">{activeCount} active</b>
          </p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-[20px] font-semibold tabular-nums tracking-[-0.02em] text-warm-white">
              {mrrFormatted}
            </span>
            {mrrBreakdown && (
              <span className="text-[12px] text-gray-muted">{mrrBreakdown}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <ScanAllButton />
          <Link
            href="/admin/onboard"
            className="inline-flex items-center gap-1.5 rounded-[9px] bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-on-accent transition hover:brightness-105"
          >
            New client
          </Link>
        </div>
      </div>

      <ClientsCrm clients={clients} />
    </div>
  );
}
