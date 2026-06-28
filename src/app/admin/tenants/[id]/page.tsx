import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantConfig } from "@/lib/tenants";
import { getClickCounts, getActivity, listDrafts } from "@/lib/storage";
import { getScanSummary, getScanHistory } from "@/lib/scan-store";
import { listTenantDomainClaims, serializeDomainClaim } from "@/lib/domains";
import { getLatestSnapshots, diffSnapshots } from "@/lib/visibility/snapshots";
import { diagnoseVisibility, summarizeVisibility } from "@/lib/visibility/diagnose";
import { TenantEditor } from "./TenantEditor";
import { SiteScan } from "./SiteScan";
import { DomainManager } from "./DomainManager";
import { VisibilityPanel } from "./VisibilityPanel";

export const dynamic = "force-dynamic";

function Pulse({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl bg-glass border border-glass-border p-4">
      <p className="text-xs text-gray-muted">{label}</p>
      <p className="font-[family-name:var(--font-display)] text-2xl font-normal text-warm-white mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-faint mt-0.5">{sub}</p>}
    </div>
  );
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await getTenantConfig(id);
  if (!tenant) notFound();

  const [pageViews, bookingClicks, drafts, activity, lastScan, domainClaims, scanHistory, visSnapshots] = await Promise.all([
    getClickCounts("page-view", id).catch(() => ({ thisWeek: 0, total: 0 })),
    getClickCounts("booking-click", id).catch(() => ({ thisWeek: 0, total: 0 })),
    listDrafts(id).catch(() => ({} as Record<string, boolean>)),
    getActivity(id).catch(() => []),
    getScanSummary(id).catch(() => null),
    listTenantDomainClaims(id).catch(() => []),
    getScanHistory(id).catch(() => []),
    getLatestSnapshots(id, 2).catch(() => []),
  ]);

  const latestVis = visSnapshots[0] ?? null;
  const visSummary = latestVis ? summarizeVisibility(latestVis) : null;
  const visFindings = latestVis ? diagnoseVisibility(latestVis) : [];
  const visDiff = latestVis ? diffSnapshots(visSnapshots[1] ?? null, latestVis) : null;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm text-gray-muted hover:text-warm-white">
          ← Overview
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-normal text-warm-white mt-2">{tenant.siteName}</h1>
        <p className="text-sm text-gray-muted mt-1">
          {tenant.id} · {tenant.deliveryModel ?? "custom_repo"} ·{" "}
          {tenant.active ? "active" : "archived"}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Pulse label="Visits / wk" value={pageViews.thisWeek} sub={`${pageViews.total} total`} />
        <Pulse label="Booking clicks / wk" value={bookingClicks.thisWeek} sub={`${bookingClicks.total} total`} />
        <Pulse label="Drafts waiting" value={Object.keys(drafts).length} />
        <Pulse label="Last activity" value={ago(activity[0]?.time ?? null)} />
      </div>

      <SiteScan tenantId={tenant.id} initialScan={lastScan} history={scanHistory.map((p) => p.overallScore)} />

      <VisibilityPanel tenantId={tenant.id} summary={visSummary} findings={visFindings} diff={visDiff} />

      <DomainManager
        tenantId={tenant.id}
        initialDomains={domainClaims.map(serializeDomainClaim)}
      />

      <TenantEditor
        tenant={{
          id: tenant.id,
          ownerName: tenant.ownerName ?? "",
          ownerEmail: tenant.ownerEmail ?? "",
          productionDomain: tenant.productionDomain ?? "",
          adminDomain: tenant.adminDomain ?? "",
          subscriptionStatus: tenant.subscriptionStatus ?? "none",
          planOverride: tenant.planOverride ?? "",
          active: tenant.active,
          revalidateUrl: tenant.revalidateUrl ?? "",
          hasRevalidationSecret: Boolean(tenant.revalidationSecret),
        }}
      />

      {activity.length > 0 && (
        <div className="rounded-xl bg-glass border border-glass-border p-5">
          <h2 className="text-sm font-semibold text-warm-white mb-3">Recent activity</h2>
          <ul className="space-y-2">
            {activity.slice(0, 8).map((a, i) => (
              <li key={i} className="flex items-start justify-between gap-4 text-sm">
                <span className="text-gray-muted">
                  <span className="mr-2 text-xs uppercase tracking-wide text-gray-faint">
                    {a.actor ?? a.type}
                  </span>
                  {a.text}
                </span>
                <span className="shrink-0 text-xs text-gray-faint">{ago(a.time)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
