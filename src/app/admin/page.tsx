import Link from "next/link";
import { getAllTenants, isActiveTenant } from "@/lib/tenants";
import {
  getTenantDashboardFallbackUrl,
  getTenantDashboardUrl,
  getTenantPublicUrl,
} from "@/lib/tenant-urls";
import { getActivity, listDrafts } from "@/lib/storage";
import { CreateTenantForm } from "./CreateTenantForm";
import { InviteButton } from "./InviteButton";
import { SCAFFOLD_PLAN_MONTHLY_PRICE_DOLLARS } from "@/lib/pricing";
import { getTenantLaunchReadinessResults } from "@/lib/production-readiness-rules";
import { getCustomRepoMetadata, getTenantDeliveryModel, summarizeCustomRepo } from "@/lib/custom-repos";
import { getWeeklyBrief } from "@/lib/weekly-brief";
import { getEffectiveSubscriptionStatus } from "@/lib/subscription";
import {
  buildTenantLaunchReadiness,
  tenantHasOwnerMessage,
  type LaunchReadinessStatus,
} from "@/lib/launch-readiness";
import { listThreads } from "@/lib/threads";
import { getPortfolioSummary } from "@/lib/portfolio";
import { getScanSummary, type ScanSummary } from "@/lib/scan-store";
import { buildAttentionFromSnapshot, buildAttentionBriefing } from "@/lib/attention";
import { buildRevenueSummary } from "@/lib/revenue";
import { OperatorConsole } from "./OperatorConsole";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-400",
  trialing: "bg-emerald-500/20 text-emerald-400",
  past_due: "bg-yellow-500/20 text-yellow-400",
  cancelled: "bg-red-500/20 text-red-400",
  none: "bg-gray-bg text-gray-muted",
};

const READINESS_COLORS: Record<string, string> = {
  ok: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  warn: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  fail: "bg-red-500/15 text-red-300 border-red-500/20",
  skip: "bg-gray-bg text-gray-muted border-glass-border",
};

const LAUNCH_STATUS_COLORS: Record<LaunchReadinessStatus, string> = {
  ready: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
  watch: "border-amber-500/25 bg-amber-500/10 text-amber-200",
  blocked: "border-red-500/25 bg-red-500/10 text-red-200",
};

const SCAN_GRADE_COLORS: Record<ScanSummary["grade"], string> = {
  A: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
  B: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
  C: "border-amber-500/25 bg-amber-500/10 text-amber-200",
  D: "border-red-500/25 bg-red-500/10 text-red-200",
  F: "border-red-500/25 bg-red-500/10 text-red-200",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export default async function AdminPage() {
  const ALL_TENANTS = await getAllTenants();
  const TENANTS = ALL_TENANTS.filter(isActiveTenant);
  const archivedTenantCount = ALL_TENANTS.length - TENANTS.length;

  const tenantData = await Promise.all(
    TENANTS.map(async (t) => {
      const [activity, drafts, threads, weeklyBrief, effectiveSubscriptionStatus, scan] = await Promise.all([
        getActivity(t.id).catch(() => []),
        listDrafts(t.id).catch(() => ({} as Record<string, boolean>)),
        listThreads(t.id).catch(() => []),
        getWeeklyBrief(t.id).catch(() => null),
        getEffectiveSubscriptionStatus(t.id).catch(() => t.subscriptionStatus ?? "none"),
        getScanSummary(t.id).catch(() => null),
      ]);
      const readiness = getTenantLaunchReadinessResults(t);
      const launchReadiness = buildTenantLaunchReadiness({
        tenant: {
          ...t,
          subscriptionStatus: effectiveSubscriptionStatus,
        },
        infrastructure: readiness,
        activity,
        threadCount: threads.length,
        hasOwnerMessage: tenantHasOwnerMessage(threads),
        draftCount: Object.keys(drafts).length,
        hasWeeklyBrief: Boolean(weeklyBrief),
      });
      return {
        tenant: t,
        lastActivity: activity[0]?.time ?? null,
        draftCount: Object.keys(drafts).length,
        threadCount: threads.length,
        hasOwnerMessage: tenantHasOwnerMessage(threads),
        hasWeeklyBrief: Boolean(weeklyBrief),
        effectiveSubscriptionStatus,
        readiness,
        launchReadiness,
        scan,
      };
    })
  );

  const activeTenants = TENANTS.filter((t) => t.active).length;
  const activeSubscriptions = TENANTS.filter(
    (t) => t.subscriptionStatus === "active"
  ).length;
  const mrr = activeSubscriptions * SCAFFOLD_PLAN_MONTHLY_PRICE_DOLLARS;
  const totalDrafts = tenantData.reduce((sum, d) => sum + d.draftCount, 0);
  const customRepoCount = TENANTS.filter((t) => getTenantDeliveryModel(t) === "custom_repo").length;
  const launchReadyCount = tenantData.filter((d) => d.launchReadiness.status === "ready").length;
  const launchBlockedCount = tenantData.filter((d) => d.launchReadiness.status === "blocked").length;

  // Prioritized "needs attention" briefing from the cached portfolio brain
  // (reuse the already-fetched snapshot to avoid a second aggregation).
  const portfolio = await getPortfolioSummary();
  const attention = portfolio
    ? buildAttentionFromSnapshot(portfolio)
    : await buildAttentionBriefing();
  const topAttention = attention.items
    .filter((i) => i.severity !== "low")
    .slice(0, 6);

  const revenue = await buildRevenueSummary();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-warm-white">Client Overview</h1>
        <p className="text-sm text-gray-muted mt-1">
          {TENANTS.length} active client{TENANTS.length !== 1 ? "s" : ""} across your
          portfolio{archivedTenantCount ? ` · ${archivedTenantCount} archived hidden` : ""}
        </p>
      </div>

      <OperatorConsole />

      {topAttention.length > 0 && (
        <div className="rounded-xl border border-glass-border bg-glass overflow-hidden">
          <div className="px-5 py-3 border-b border-glass-border flex items-center gap-2">
            <span className="text-sm font-semibold text-warm-white">Needs attention</span>
            <span className="text-xs text-gray-muted">
              {attention.counts.high} high · {attention.counts.medium} medium
            </span>
          </div>
          <ul className="divide-y divide-glass-border">
            {topAttention.map((item, i) => (
              <li key={i}>
                <Link
                  href={item.href ?? "/admin"}
                  className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-gray-bg transition-colors"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      item.severity === "high" ? "bg-red-400" : "bg-amber-400"
                    }`}
                  />
                  <span className="text-warm-white">{item.message}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="rounded-xl bg-glass border border-glass-border p-6">
          <p className="text-sm text-gray-muted">Active Tenants</p>
          <p className="text-3xl font-semibold text-warm-white mt-1">
            {activeTenants}
          </p>
        </div>
        <div className="rounded-xl bg-glass border border-glass-border p-6">
          <p className="text-sm text-gray-muted">Collected</p>
          <p className="text-3xl font-semibold text-warm-white mt-1">
            ${Math.round(revenue.totalCents / 100).toLocaleString()}
          </p>
          <p className="text-xs text-gray-faint mt-1">
            {revenue.count} build payment{revenue.count !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="rounded-xl bg-glass border border-glass-border p-6">
          <p className="text-sm text-gray-muted">MRR</p>
          <p className="text-3xl font-semibold text-warm-white mt-1">
            ${mrr.toLocaleString()}
          </p>
          <p className="text-xs text-gray-faint mt-1">
            {activeSubscriptions} active subscription
            {activeSubscriptions !== 1 ? "s" : ""} x ${SCAFFOLD_PLAN_MONTHLY_PRICE_DOLLARS}
          </p>
        </div>
        <Link
          href="/admin/drafts"
          className="rounded-xl bg-glass border border-glass-border p-6 hover:border-gray-border transition-colors"
        >
          <p className="text-sm text-gray-muted">Pending Drafts</p>
          <p className="text-3xl font-semibold text-warm-white mt-1">
            {totalDrafts}
          </p>
          {totalDrafts > 0 && (
            <p className="text-xs text-amber-400 mt-1">Review needed</p>
          )}
        </Link>
        <div className="rounded-xl bg-glass border border-glass-border p-6">
          <p className="text-sm text-gray-muted">Custom Repos</p>
          <p className="text-3xl font-semibold text-warm-white mt-1">
            {customRepoCount}
          </p>
          <p className="text-xs text-gray-faint mt-1">
            Default paid-client delivery path
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-glass-border bg-glass p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-amber-300">
              Launch command center
            </p>
            <h2 className="mt-2 text-lg font-semibold text-warm-white">
              Controlled platform launch proof loop
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-muted">
              Launch readiness now tracks the three things that matter before a wider push:
              custom-repo delivery, trustworthy AI action receipts, and first-week owner activation.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
              <p className="text-lg font-semibold text-emerald-200">{launchReadyCount}</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-300/70">Ready</p>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2">
              <p className="text-lg font-semibold text-amber-200">
                {tenantData.length - launchReadyCount - launchBlockedCount}
              </p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-amber-300/70">Watch</p>
            </div>
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
              <p className="text-lg font-semibold text-red-200">{launchBlockedCount}</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-red-300/70">Blocked</p>
            </div>
          </div>
        </div>
      </section>

      {/* Create tenant form */}
      <CreateTenantForm />

      <div className="lg:hidden rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
        <p className="text-sm font-medium text-amber-200">Admin works best on desktop</p>
        <p className="mt-1 text-xs leading-5 text-amber-100/70">
          Client dashboards stay available from their fallback URLs, but tenant triage, invite handling, and domain checks need the full-width admin table.
        </p>
      </div>

      {/* Tenant table */}
      <div className="rounded-xl bg-glass border border-glass-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-glass-border text-gray-muted text-left">
                <th className="px-6 py-3 font-medium">Client</th>
                <th className="px-6 py-3 font-medium">Access</th>
                <th className="px-6 py-3 font-medium">Operations</th>
                <th className="px-6 py-3 font-medium">Activity</th>
                <th className="px-6 py-3 font-medium sr-only">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-glass-border/50">
              {tenantData.map(({ tenant: t, lastActivity, draftCount, readiness, threadCount, hasOwnerMessage, hasWeeklyBrief, effectiveSubscriptionStatus, launchReadiness, scan }) => {
                const fallbackUrl = getTenantDashboardFallbackUrl(t);
                const customAdminUrl = getTenantDashboardUrl(t);
                const publicUrl = getTenantPublicUrl(t);
                const adminReadiness = readiness.find((r) => r.name.endsWith("admin domain"));
                const clientReadiness = readiness.find((r) => r.name.endsWith("client domain"));
                const revalidationReadiness = readiness.find((r) => r.name.endsWith("revalidation"));
                const deliveryModel = getTenantDeliveryModel(t);
                const customRepo = getCustomRepoMetadata(t);

                return (
                  <tr
                    key={t.id}
                    className="hover:bg-gray-bg transition-colors align-top"
                  >
                    <td className="px-6 py-5">
                      <div>
                        <Link
                          href={`/admin/tenants/${t.id}`}
                          className="font-medium text-warm-white hover:text-accent transition-colors"
                        >
                          {t.siteName}
                        </Link>
                        <p className="mt-1 text-xs text-gray-muted">{t.ownerName}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${LAUNCH_STATUS_COLORS[launchReadiness.status]}`}>
                            <span className="capitalize">{launchReadiness.status}</span> · {launchReadiness.score}%
                          </span>
                          {scan && (
                            <span
                              title={`SEO + site health ${scan.overallScore}/100 · scanned ${formatTime(scan.scannedAt)}`}
                              className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${SCAN_GRADE_COLORS[scan.grade]}`}
                            >
                              SEO {scan.grade}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-[11px] text-gray-faint">
                          {t.industry} · {deliveryModel === "custom_repo" ? "custom repo" : "template"}
                          {!t.active && " · archived"}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-medium text-warm-white">
                            {t.ownerEmail ? t.ownerEmail : "No owner email"}
                          </p>
                          <p className="mt-1 text-xs text-gray-faint">
                            Invite state: {t.ownerEmail ? "ready to invite" : "needs owner email"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.14em] text-gray-faint">Fallback dashboard</p>
                          <Link href={fallbackUrl} className="mt-1 block max-w-[260px] truncate font-mono text-xs text-amber-300 hover:text-amber-200">
                            {fallbackUrl.replace(/^https?:\/\//, "")}
                          </Link>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.14em] text-gray-faint">Custom admin</p>
                          <a href={customAdminUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block max-w-[260px] truncate font-mono text-xs text-gray-muted hover:text-warm-white">
                            {customAdminUrl.replace(/^https?:\/\//, "")}
                          </a>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      {(() => {
                        const dnsBad =
                          clientReadiness?.status === "fail" || revalidationReadiness?.status === "fail";
                        const dnsWatch =
                          clientReadiness?.status === "warn" || revalidationReadiness?.status === "warn";
                        return (
                          <div className="space-y-2 text-xs">
                            <div className="flex items-center gap-2">
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                  dnsBad ? "bg-red-400" : dnsWatch ? "bg-amber-400" : "bg-emerald-400"
                                }`}
                              />
                              <span className="text-gray-muted">
                                {dnsBad
                                  ? "DNS / revalidation issue"
                                  : dnsWatch
                                    ? "Watch DNS / revalidation"
                                    : "DNS + revalidation OK"}
                              </span>
                            </div>
                            <p className="text-gray-muted">
                              Subscription{" "}
                              <span className="text-warm-white">{effectiveSubscriptionStatus ?? "none"}</span>
                            </p>
                            {draftCount > 0 && (
                              <p className="text-amber-300">
                                {draftCount} draft{draftCount === 1 ? "" : "s"} waiting
                              </p>
                            )}
                            <Link
                              href={`/admin/tenants/${t.id}`}
                              className="inline-block text-gray-faint hover:text-warm-white"
                            >
                              Full detail →
                            </Link>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-5 text-gray-muted">
                      <p>{lastActivity ? formatTime(lastActivity) : "No activity"}</p>
                      <p className="mt-2 text-xs text-gray-faint">
                        {threadCount} chat thread{threadCount === 1 ? "" : "s"} · {launchReadiness.completed}/{launchReadiness.total} launch checks
                      </p>
                      <p className="mt-2 max-w-[220px] truncate text-xs text-gray-faint">
                        Public: {publicUrl.replace(/^https?:\/\//, "")}
                      </p>
                      {deliveryModel === "custom_repo" && (
                        <p className="mt-2 max-w-[220px] truncate text-xs text-amber-200/70">
                          {summarizeCustomRepo(customRepo)}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex min-w-[280px] flex-wrap items-center gap-2 rounded-lg border border-glass-border bg-surface-base/40 p-2">
                        <InviteButton
                          tenantId={t.id}
                          siteName={t.siteName}
                          ownerEmail={t.ownerEmail}
                        />
                        <Link
                          href={fallbackUrl}
                          className="rounded-md px-2 py-1 text-xs text-warm-white transition-colors hover:bg-gray-bg hover:text-warm-white"
                        >
                          Dashboard
                        </Link>
                        <a
                          href={customAdminUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md px-2 py-1 text-xs text-gray-muted transition-colors hover:bg-gray-bg hover:text-warm-white"
                        >
                          Custom admin
                        </a>
                        <a
                          href={publicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md px-2 py-1 text-xs text-warm-white transition-colors hover:bg-gray-bg hover:text-warm-white"
                        >
                          Site
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
