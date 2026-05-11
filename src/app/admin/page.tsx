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

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-400",
  past_due: "bg-yellow-500/20 text-yellow-400",
  cancelled: "bg-red-500/20 text-red-400",
  none: "bg-zinc-700/40 text-zinc-400",
};

const READINESS_COLORS: Record<string, string> = {
  ok: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  warn: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  fail: "bg-red-500/15 text-red-300 border-red-500/20",
  skip: "bg-zinc-700/40 text-zinc-400 border-zinc-700",
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
      const [activity, drafts] = await Promise.all([
        getActivity(t.id).catch(() => []),
        listDrafts(t.id).catch(() => ({} as Record<string, boolean>)),
      ]);
      return {
        tenant: t,
        lastActivity: activity[0]?.time ?? null,
        draftCount: Object.keys(drafts).length,
        readiness: getTenantLaunchReadinessResults(t),
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white">Client Overview</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {TENANTS.length} active client{TENANTS.length !== 1 ? "s" : ""} across your
          portfolio{archivedTenantCount ? ` · ${archivedTenantCount} archived hidden` : ""}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
          <p className="text-sm text-zinc-500">Active Tenants</p>
          <p className="text-3xl font-semibold text-white mt-1">
            {activeTenants}
          </p>
        </div>
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
          <p className="text-sm text-zinc-500">MRR</p>
          <p className="text-3xl font-semibold text-white mt-1">
            ${mrr.toLocaleString()}
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            {activeSubscriptions} active subscription
            {activeSubscriptions !== 1 ? "s" : ""} x ${SCAFFOLD_PLAN_MONTHLY_PRICE_DOLLARS}
          </p>
        </div>
        <Link
          href="/admin/drafts"
          className="rounded-xl bg-zinc-900 border border-zinc-800 p-6 hover:border-zinc-700 transition-colors"
        >
          <p className="text-sm text-zinc-500">Pending Drafts</p>
          <p className="text-3xl font-semibold text-white mt-1">
            {totalDrafts}
          </p>
          {totalDrafts > 0 && (
            <p className="text-xs text-amber-400 mt-1">Review needed</p>
          )}
        </Link>
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
          <p className="text-sm text-zinc-500">Custom Repos</p>
          <p className="text-3xl font-semibold text-white mt-1">
            {customRepoCount}
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            Default paid-client delivery path
          </p>
        </div>
      </div>

      {/* Create tenant form */}
      <CreateTenantForm />

      <div className="lg:hidden rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
        <p className="text-sm font-medium text-amber-200">Admin works best on desktop</p>
        <p className="mt-1 text-xs leading-5 text-amber-100/70">
          Client dashboards stay available from their fallback URLs, but tenant triage, invite handling, and domain checks need the full-width admin table.
        </p>
      </div>

      {/* Tenant table */}
      <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                <th className="px-6 py-3 font-medium">Client</th>
                <th className="px-6 py-3 font-medium">Access</th>
                <th className="px-6 py-3 font-medium">Operations</th>
                <th className="px-6 py-3 font-medium">Activity</th>
                <th className="px-6 py-3 font-medium sr-only">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {tenantData.map(({ tenant: t, lastActivity, draftCount, readiness }) => {
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
                    className="hover:bg-zinc-800/30 transition-colors align-top"
                  >
                    <td className="px-6 py-5">
                      <div>
                        <p className="font-medium text-white">{t.siteName}</p>
                        <p className="mt-1 text-xs text-zinc-500">{t.ownerName}</p>
                        <p className="mt-2 text-xs text-zinc-600">
                          {t.industry} · {t.template}
                        </p>
                        <span
                          className={`mt-3 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            t.active
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-zinc-700/40 text-zinc-500"
                          }`}
                        >
                          {t.active ? "Active tenant" : "Inactive tenant"}
                        </span>
                        <span className={`ml-2 mt-3 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          deliveryModel === "custom_repo"
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-zinc-700/40 text-zinc-400"
                        }`}>
                          {deliveryModel === "custom_repo" ? "Custom repo" : "Platform template"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-medium text-zinc-300">
                            {t.ownerEmail ? t.ownerEmail : "No owner email"}
                          </p>
                          <p className="mt-1 text-xs text-zinc-600">
                            Invite state: {t.ownerEmail ? "ready to invite" : "needs owner email"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">Fallback dashboard</p>
                          <Link href={fallbackUrl} className="mt-1 block max-w-[260px] truncate font-mono text-xs text-amber-300 hover:text-amber-200">
                            {fallbackUrl.replace(/^https?:\/\//, "")}
                          </Link>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">Custom admin</p>
                          <a href={customAdminUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block max-w-[260px] truncate font-mono text-xs text-zinc-400 hover:text-white">
                            {customAdminUrl.replace(/^https?:\/\//, "")}
                          </a>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex max-w-md flex-wrap gap-2">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${READINESS_COLORS[clientReadiness?.status ?? "skip"]}`}>
                          Site DNS: {clientReadiness?.status ?? "skip"}
                        </span>
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${READINESS_COLORS[adminReadiness?.status ?? "skip"]}`}>
                          Admin DNS: {adminReadiness?.status ?? "skip"}
                        </span>
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${READINESS_COLORS[revalidationReadiness?.status ?? "skip"]}`}>
                          Revalidation: {revalidationReadiness?.status ?? "skip"}
                        </span>
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${STATUS_COLORS[t.subscriptionStatus ?? "none"]}`}>
                          Subscription: {t.subscriptionStatus ?? "none"}
                        </span>
                        {deliveryModel === "custom_repo" && (
                          <span className="inline-flex rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-300">
                            Repo: {customRepo.revalidationHealth ?? "unknown"}
                          </span>
                        )}
                        {draftCount > 0 ? (
                          <span className="inline-flex rounded-full bg-amber-500/20 px-2 py-1 text-xs font-medium text-amber-400">
                            {draftCount} pending draft{draftCount === 1 ? "" : "s"}
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-zinc-700/40 px-2 py-1 text-xs font-medium text-zinc-500">
                            No drafts
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-zinc-500">
                      <p>{lastActivity ? formatTime(lastActivity) : "No activity"}</p>
                      <p className="mt-2 max-w-[220px] truncate text-xs text-zinc-600">
                        Public: {publicUrl.replace(/^https?:\/\//, "")}
                      </p>
                      {deliveryModel === "custom_repo" && (
                        <p className="mt-2 max-w-[220px] truncate text-xs text-amber-200/70">
                          {summarizeCustomRepo(customRepo)}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex min-w-[280px] flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-2">
                        <InviteButton
                          tenantId={t.id}
                          siteName={t.siteName}
                          ownerEmail={t.ownerEmail}
                        />
                        <Link
                          href={fallbackUrl}
                          className="rounded-md px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
                        >
                          Dashboard
                        </Link>
                        <a
                          href={customAdminUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                        >
                          Custom admin
                        </a>
                        <a
                          href={publicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
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
