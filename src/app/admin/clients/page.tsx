import { redirect } from "next/navigation";
import Link from "next/link";
import { isSuperAdmin } from "@/lib/auth";
import { getAllTenants, isActiveTenant } from "@/lib/tenants";
import { getAllTenantCrm } from "@/lib/tenant-crm";
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

export const dynamic = "force-dynamic";

export default async function AdminClientsPage() {
  // Defense in depth: the admin layout already gates every /admin route on
  // super-admin, but mirror the guard here so this page never renders client
  // data for a non-admin even if the layout chain changes.
  if (!(await isSuperAdmin())) redirect("/");

  const tenants = await getAllTenants();

  // The single client list carries the health signals that used to live in the
  // Overview table (SEO grade, launch %, at-risk) alongside the CRM record.
  const [crm, atRiskSignals, rows] = await Promise.all([
    getAllTenantCrm(tenants.map((t) => t.id)),
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
      siteName: t.siteName,
      ownerEmail: t.ownerEmail ?? null,
      ownerName: t.ownerName ?? null,
      active: isActiveTenant(t),
      lastActivity: row?.lastActivity ?? null,
      atRiskReason: atRiskById.get(t.id)?.reasons[0] ?? null,
      seoGrade: row?.seoGrade ?? null,
      launchScore: row?.launchScore ?? null,
      launchStatus: row?.launchStatus ?? null,
    };
  });

  return (
    <div className="max-w-5xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-[28px] sm:text-[32px] font-medium text-warm-white">
            Clients
          </h1>
          <p className="text-sm text-gray-muted mt-1">
            {clients.length} client{clients.length !== 1 ? "s" : ""}: one list for everyone we manage a site for
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ScanAllButton />
          <Link href="/admin" className="text-sm text-gray-muted hover:text-warm-white transition-colors">
            ← Overview
          </Link>
        </div>
      </div>

      <ClientsCrm clients={clients} initialCrm={crm} />
    </div>
  );
}
