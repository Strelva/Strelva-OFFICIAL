import Link from "next/link";
import { Boxes, Banknote, FileText, TrendingUp, Users } from "lucide-react";
import { getAllTenants, isActiveTenant } from "@/lib/tenants";
import type { TenantConfig } from "@/lib/types";
import { getActivity, listDrafts } from "@/lib/storage";
import { CreateTenantForm } from "./CreateTenantForm";
import { SCAFFOLD_PLAN_MONTHLY_PRICE_DOLLARS } from "@/lib/pricing";
import { getTenantLaunchReadinessResults } from "@/lib/production-readiness-rules";
import { getTenantDeliveryModel } from "@/lib/custom-repos";
import { getWeeklyBrief } from "@/lib/weekly-brief";
import { getEffectiveSubscriptionStatus, isGrandfathered } from "@/lib/subscription";
import { buildTenantLaunchReadiness, tenantHasOwnerMessage } from "@/lib/launch-readiness";
import { listThreads } from "@/lib/threads";
import { getPortfolioSummary, computeMrrDollars } from "@/lib/portfolio";
import { buildAttentionFromSnapshot, buildAttentionBriefing } from "@/lib/attention";
import { buildRevenueSummary } from "@/lib/revenue";
import { getDeliveryLeads } from "@/lib/access-request-delivery";
import { getAllLeadWorkflow } from "@/lib/lead-workflow";
import { listPendingDigests } from "@/lib/maintenance-digest";
import { getAtRiskTenants, type AtRiskSignal } from "@/lib/churn";
import type { DeliveryLead } from "@/lib/access-request-delivery";
import type { MaintenanceDigest } from "@/lib/maintenance-digest";
import { StatTile } from "@/components/dashboard/StatTile";
import { OperatorConsole } from "./OperatorConsole";
import { TodayFeed, type TodayFlag } from "./TodayFeed";
import { getPortfolioActions } from "./actions/portfolio-actions";

export const dynamic = "force-dynamic";

/** Tenants that signed up in the last 7 days, newest first. Kept at module
 *  scope so the `Date.now()` read stays out of the component render. */
function recentSignups(tenants: TenantConfig[]) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return tenants
    .filter((t) => {
      const created = new Date(t.createdAt).getTime();
      return !Number.isNaN(created) && created >= cutoff;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)
    .map((t) => ({
      tenantId: t.id,
      siteName: t.siteName || t.id,
      ownerName: t.ownerName,
      createdAt: t.createdAt,
    }));
}

export default async function AdminPage() {
  const ALL_TENANTS = await getAllTenants();
  const TENANTS = ALL_TENANTS.filter(isActiveTenant);
  const archivedTenantCount = ALL_TENANTS.length - TENANTS.length;

  // Per-tenant work counts + launch verdict. The Overview no longer lists
  // clients (that's /admin/clients) — it only needs the portfolio roll-ups.
  const tenantData = await Promise.all(
    TENANTS.map(async (t) => {
      const [activity, drafts, threads, weeklyBrief, effectiveSubscriptionStatus] = await Promise.all([
        getActivity(t.id).catch(() => []),
        listDrafts(t.id).catch(() => ({} as Record<string, boolean>)),
        listThreads(t.id).catch(() => []),
        getWeeklyBrief(t.id).catch(() => null),
        getEffectiveSubscriptionStatus(t.id).catch(() => t.subscriptionStatus ?? "none"),
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
      return { draftCount: Object.keys(drafts).length, launchReadiness };
    })
  );

  const activeTenants = TENANTS.filter((t) => t.active).length;
  // MRR counted in ONE place (computeMrrDollars) so this card and Mission
  // Control never disagree; grandfathered/founder-comp ($0) excluded.
  const mrr = computeMrrDollars(TENANTS);
  const activeSubscriptions = SCAFFOLD_PLAN_MONTHLY_PRICE_DOLLARS
    ? Math.round(mrr / SCAFFOLD_PLAN_MONTHLY_PRICE_DOLLARS)
    : 0;
  const grandfatheredCount = TENANTS.filter(
    (t) => isGrandfathered(t.id) || t.planOverride === "founder_comp",
  ).length;
  const totalDrafts = tenantData.reduce((sum, d) => sum + d.draftCount, 0);
  const customRepoCount = TENANTS.filter((t) => getTenantDeliveryModel(t) === "custom_repo").length;
  const launchReadyCount = tenantData.filter((d) => d.launchReadiness.status === "ready").length;
  const launchBlockedCount = tenantData.filter((d) => d.launchReadiness.status === "blocked").length;
  const launchWatchCount = tenantData.length - launchReadyCount - launchBlockedCount;

  // Portfolio attention flags — folded into the single "Needs you" feed rather
  // than a second adjacent list. Deep-link to the merged client detail URL.
  const portfolio = await getPortfolioSummary();
  const attention = portfolio ? buildAttentionFromSnapshot(portfolio) : await buildAttentionBriefing();
  const flags: TodayFlag[] = attention.items
    .filter((i) => i.severity !== "low")
    .slice(0, 6)
    .map((i) => ({
      message: i.message,
      href: (i.href ?? "/admin/clients").replace("/admin/tenants/", "/admin/clients/"),
      severity: i.severity,
    }));

  const revenue = await buildRevenueSummary();

  // Operator "needs you" aggregation. Each source degrades to empty.
  const [deliveryLeads, pendingDigests, atRiskSignals] = await Promise.all([
    getDeliveryLeads().catch((): DeliveryLead[] => []),
    listPendingDigests().catch((): MaintenanceDigest[] => []),
    getAtRiskTenants().catch((): AtRiskSignal[] => []),
  ]);

  const leadWorkflow = await getAllLeadWorkflow(deliveryLeads.map((l) => l.statusToken)).catch(
    () => ({} as Record<string, { status: string }>),
  );
  const unworkedLeads = deliveryLeads.filter(
    (l) =>
      l.deliveryStatus === "received" &&
      (leadWorkflow[l.statusToken]?.status ?? "new") === "new",
  );
  const todayLeads = {
    total: deliveryLeads.length,
    unworked: unworkedLeads.length,
    recent: deliveryLeads.slice(0, 4).map((l) => ({
      businessName: l.businessName,
      location: l.location,
      submittedAt: l.submittedAt,
      isNew: l.deliveryStatus === "received",
    })),
  };

  const todayApprovals = {
    drafts: totalDrafts,
    digests: pendingDigests.length,
    total: totalDrafts + pendingDigests.length,
  };

  const tenantById = new Map(ALL_TENANTS.map((t) => [t.id, t]));
  const todayAtRisk = atRiskSignals.map((s) => ({
    tenantId: s.tenantId,
    siteName: tenantById.get(s.tenantId)?.siteName || s.tenantId,
    reasons: s.reasons,
    daysSinceActivity: s.daysSinceActivity,
    subscriptionStatus: s.subscriptionStatus,
  }));

  const todaySignups = recentSignups(TENANTS);

  // Aggregated pending approvals across every client — the count links into the
  // portfolio "clear everything" screen. Degrades to zero on any read failure.
  const portfolioActions = await getPortfolioActions().catch(() => ({
    groups: [],
    totalItems: 0,
    totalClients: 0,
  }));

  return (
    <div className="max-w-5xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-[28px] sm:text-[32px] font-medium text-warm-white">
          Overview
        </h1>
        <p className="text-sm text-gray-muted mt-1">
          What needs you today across {TENANTS.length} active client{TENANTS.length !== 1 ? "s" : ""}
          {archivedTenantCount ? ` · ${archivedTenantCount} archived` : ""}
        </p>
      </div>

      {/* The single triage surface */}
      <TodayFeed
        leads={todayLeads}
        approvals={todayApprovals}
        atRisk={todayAtRisk}
        signups={todaySignups}
        flags={flags}
        portfolioActions={{
          items: portfolioActions.totalItems,
          clients: portfolioActions.totalClients,
        }}
      />

      {/* One link into the single client list */}
      <Link
        href="/admin/clients"
        className="flex items-center justify-between rounded-xl border border-glass-border bg-glass px-5 py-3 text-sm transition-colors hover:border-gray-border"
      >
        <span className="text-warm-white">
          View all {TENANTS.length} client{TENANTS.length !== 1 ? "s" : ""}
        </span>
        <span className="text-accent">Open list →</span>
      </Link>

      {/* Portfolio roll-ups */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatTile icon={<Users className="h-4 w-4" strokeWidth={1.5} />} label="Active" value={activeTenants} detail="clients live" />
        <StatTile
          icon={<Banknote className="h-4 w-4" strokeWidth={1.5} />}
          label="Collected"
          value={`$${Math.round(revenue.totalCents / 100).toLocaleString()}`}
          detail={`${revenue.count} build payment${revenue.count !== 1 ? "s" : ""}`}
        />
        <StatTile
          icon={<TrendingUp className="h-4 w-4" strokeWidth={1.5} />}
          label="MRR"
          value={`$${mrr.toLocaleString()}`}
          detail={`${activeSubscriptions} paid${grandfatheredCount > 0 ? ` · ${grandfatheredCount} grandfathered` : ""}`}
        />
        <Link href="/admin/drafts">
          <StatTile
            icon={<FileText className="h-4 w-4" strokeWidth={1.5} />}
            label="Drafts"
            value={totalDrafts}
            detail={totalDrafts > 0 ? "review needed" : "all clear"}
          />
        </Link>
        <StatTile icon={<Boxes className="h-4 w-4" strokeWidth={1.5} />} label="Custom repos" value={customRepoCount} detail="delivery path" />
      </div>

      {/* Launch readiness — one line, no internal-doc copy */}
      {tenantData.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-glass-border bg-glass px-5 py-3 text-sm">
          <span className="text-gray-muted">Launch readiness</span>
          <span className="text-emerald-300">{launchReadyCount} ready</span>
          <span className="text-gray-faint">·</span>
          <span className="text-amber-300">{launchWatchCount} watch</span>
          <span className="text-gray-faint">·</span>
          <span className="text-red-300">{launchBlockedCount} blocked</span>
        </div>
      )}

      {/* Mission Control — demoted to a collapsible secondary tool */}
      <details className="group rounded-xl border border-glass-border bg-glass">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm text-warm-white [&::-webkit-details-marker]:hidden">
          <span className="font-medium">Mission Control</span>
          <span className="text-xs text-gray-muted group-open:hidden">Ask about the portfolio →</span>
          <span className="hidden text-xs text-gray-muted group-open:inline">Collapse</span>
        </summary>
        <div className="border-t border-glass-border p-4">
          <OperatorConsole />
        </div>
      </details>

      {/* Add a client */}
      <CreateTenantForm />

      <div className="lg:hidden rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
        <p className="text-sm font-medium text-amber-200">Admin works best on desktop</p>
        <p className="mt-1 text-xs leading-5 text-amber-100/70">
          Client dashboards stay available from their fallback URLs, but tenant triage, invite handling,
          and domain checks need the full-width admin views.
        </p>
      </div>
    </div>
  );
}
