import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/auth";
import { getAllTenants, isActiveTenant } from "@/lib/tenants";
import {
  getAnalyticsConfig,
  getSearchConsolePerf,
  getGa4Perf,
} from "@/lib/analytics";
import { AnalyticsView } from "./AnalyticsView";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  // Defense in depth: the admin layout already gates on super-admin, but mirror
  // the guard so this page never renders client data if the layout chain changes.
  if (!(await isSuperAdmin())) redirect("/");

  const allTenants = await getAllTenants();
  const active = allTenants.filter(isActiveTenant);

  const tenants = active.map((t) => ({
    id: t.id,
    siteName: t.siteName || t.id,
  }));

  // No active clients — nothing to select, render the empty shell.
  if (tenants.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-[28px] sm:text-[32px] font-medium text-warm-white">
            Search + Analytics
          </h1>
          <p className="text-sm text-gray-muted mt-1">
            Search Console + GA4 performance, per client.
          </p>
        </div>
        <div className="rounded-2xl border border-glass-border bg-glass p-10 text-center">
          <p className="text-sm font-medium text-warm-white">No active clients yet</p>
          <p className="mt-1 text-xs text-gray-muted">
            Clients appear here once tenants exist.
          </p>
        </div>
      </div>
    );
  }

  const { tenant: requested } = await searchParams;
  const selected =
    (requested && tenants.find((t) => t.id === requested)?.id) ?? tenants[0].id;

  const [config, search, ga] = await Promise.all([
    getAnalyticsConfig(selected),
    getSearchConsolePerf(selected),
    getGa4Perf(selected),
  ]);

  const selectedName =
    tenants.find((t) => t.id === selected)?.siteName || selected;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-[28px] sm:text-[32px] font-medium text-warm-white">
          Search + Analytics
        </h1>
        <p className="text-sm text-gray-muted mt-1">
          Search Console + GA4 performance for{" "}
          <span className="text-warm-white">{selectedName}</span>.
        </p>
      </div>

      <AnalyticsView
        tenants={tenants}
        selected={selected}
        config={config}
        search={search}
        ga={ga}
      />
    </div>
  );
}
