import Link from "next/link";
import { getAllTenants } from "@/lib/tenants";
import { getTenantDashboardUrl, getTenantPublicUrl } from "@/lib/tenant-urls";
import { getActivity, listDrafts } from "@/lib/storage";
import { CreateTenantForm } from "./CreateTenantForm";
import { InviteButton } from "./InviteButton";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-400",
  past_due: "bg-yellow-500/20 text-yellow-400",
  cancelled: "bg-red-500/20 text-red-400",
  none: "bg-zinc-700/40 text-zinc-400",
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
  const TENANTS = await getAllTenants();

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
      };
    })
  );

  const activeTenants = TENANTS.filter((t) => t.active).length;
  const activeSubscriptions = TENANTS.filter(
    (t) => t.subscriptionStatus === "active"
  ).length;
  const mrr = activeSubscriptions * 20;
  const totalDrafts = tenantData.reduce((sum, d) => sum + d.draftCount, 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white">Client Overview</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {TENANTS.length} client{TENANTS.length !== 1 ? "s" : ""} across your
          portfolio
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            {activeSubscriptions !== 1 ? "s" : ""} x $20
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
      </div>

      {/* Create tenant form */}
      <CreateTenantForm />

      {/* Tenant table */}
      <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                <th className="px-6 py-3 font-medium">Client</th>
                <th className="px-6 py-3 font-medium">Industry</th>
                <th className="px-6 py-3 font-medium">Template</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Subscription</th>
                <th className="px-6 py-3 font-medium">Last Activity</th>
                <th className="px-6 py-3 font-medium">Drafts</th>
                <th className="px-6 py-3 font-medium sr-only">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {tenantData.map(({ tenant: t, lastActivity, draftCount }) => (
                <tr
                  key={t.id}
                  className="hover:bg-zinc-800/30 transition-colors"
                >
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-white">{t.siteName}</p>
                      <p className="text-xs text-zinc-500">{t.ownerName}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-zinc-400">{t.industry}</td>
                  <td className="px-6 py-4 text-zinc-400">{t.template}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        t.active
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-zinc-700/40 text-zinc-500"
                      }`}
                    >
                      {t.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_COLORS[t.subscriptionStatus ?? "none"]
                      }`}
                    >
                      {t.subscriptionStatus ?? "none"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-500">
                    {lastActivity ? formatTime(lastActivity) : "No activity"}
                  </td>
                  <td className="px-6 py-4">
                    {draftCount > 0 ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400">
                        {draftCount}
                      </span>
                    ) : (
                      <span className="text-zinc-600">0</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <InviteButton
                        tenantId={t.id}
                        siteName={t.siteName}
                        ownerEmail={t.ownerEmail}
                      />
                      <Link
                        href={getTenantDashboardUrl(t)}
                        className="text-xs text-zinc-400 hover:text-white transition-colors"
                      >
                        Dashboard
                      </Link>
                      <a
                        href={getTenantPublicUrl(t)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-zinc-400 hover:text-white transition-colors"
                      >
                        Site
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
