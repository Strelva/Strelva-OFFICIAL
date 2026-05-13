import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ComponentType } from "react";
import { ArrowRight, CheckCircle2, ExternalLink, MessageCircle, MousePointerClick, ShieldCheck, TrendingUp, Wand2 } from "lucide-react";
import { getTenantFromHeaders } from "@/lib/tenant";
import { hasTenantAccess } from "@/lib/auth";
import { getClickCounts, getActivity } from "@/lib/storage";
import { getQueueCount } from "@/lib/events";
import { getWeeklyBrief } from "@/lib/weekly-brief";
import { getClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantPrimaryDomain, getTenantPublicUrl, getTenantPublicUrlFromDomainMap } from "@/lib/tenant-urls";

function StatTile({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <div className="rounded-xl border border-glass-border bg-glass p-4">
      <div className="mb-3 flex items-center gap-2 text-gray-muted">
        <Icon className="h-4 w-4" strokeWidth={1.5} />
        <span className="text-[11px] font-medium uppercase tracking-[0.12em]">{label}</span>
      </div>
      <p className="text-[26px] font-semibold leading-none text-warm-black">{value}</p>
      <p className="mt-2 text-[12px] leading-relaxed text-gray-muted">{detail}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const requestHeaders = await headers();
  const clientFallbackRoot = getClientFallbackRoot(requestHeaders);
  const tenant = await getTenantFromHeaders();
  const hasAccess = await hasTenantAccess(tenant);

  if (!hasAccess) {
    redirect(withClientFallbackRoot(clientFallbackRoot, "/no-access"));
  }

  const [pageViews, customerActions, pendingCount, activity, brief, tenantConfig] = await Promise.all([
    getClickCounts("page-view", tenant),
    getClickCounts("booking-click", tenant),
    getQueueCount(tenant),
    getActivity(tenant, { actor: "ai" }),
    getWeeklyBrief(tenant),
    getTenantConfig(tenant),
  ]);
  const recentAiChanges = activity.slice(0, 3);
  const siteUrl = tenantConfig
    ? getTenantPublicUrl(tenantConfig, getTenantPrimaryDomain(tenantConfig) ? "production" : process.env.NODE_ENV)
    : getTenantPublicUrlFromDomainMap(tenant);
  const dashboardHref = (path: string) => withClientFallbackRoot(clientFallbackRoot, path);
  const nextAction = brief?.nextAction?.title || (pendingCount > 0 ? "Review what needs you" : "Make one useful site update");
  const nextActionDetail = brief?.nextAction?.description ||
    (pendingCount > 0
      ? `${pendingCount} item${pendingCount === 1 ? "" : "s"} waiting before anything goes live.`
      : "Start with a small offer, hours, product, or homepage copy change.");

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-8 sm:py-7 animate-route-enter">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
              Today
            </p>
            <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-warm-black sm:text-[36px]">
              See what is working. Change what is next.
            </h1>
            <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-gray-muted">
              This is the short version: how people found you, what needs your attention, and the fastest path to update the site.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={dashboardHref("/dashboard/site")}
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-accent px-4 text-[13px] font-medium text-white transition-colors hover:bg-accent/85"
            >
              <Wand2 className="h-4 w-4" strokeWidth={1.5} />
              Edit site
            </Link>
            <Link
              href={dashboardHref("/dashboard/chat")}
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-glass-border bg-glass px-4 text-[13px] font-medium text-warm-black transition-colors hover:bg-gray-bg"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
              Ask AI
            </Link>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          <StatTile
            label="People found you"
            value={pageViews.thisWeek}
            detail={`${pageViews.total} total visits tracked`}
            icon={TrendingUp}
          />
          <StatTile
            label="Customer actions"
            value={customerActions.thisWeek}
            detail={`${customerActions.total} product/contact clicks tracked`}
            icon={MousePointerClick}
          />
          <StatTile
            label="Needs you"
            value={pendingCount}
            detail={pendingCount > 0 ? "Review before anything goes live" : "Nothing is waiting on approval"}
            icon={ShieldCheck}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-glass-border bg-glass p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
                  Next useful move
                </p>
                <h2 className="mt-2 text-[20px] font-semibold text-warm-black">{nextAction}</h2>
                <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-gray-muted">{nextActionDetail}</p>
              </div>
              <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-success" strokeWidth={1.5} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={dashboardHref(pendingCount > 0 ? "/dashboard/review" : "/dashboard/site")}
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-warm-white px-4 text-[13px] font-medium text-on-warm-white transition-colors hover:bg-warm-white/90"
              >
                {pendingCount > 0 ? "Open Needs You" : "Open site editor"}
                <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
              </Link>
              {siteUrl && (
                <a
                  href={siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-glass-border px-4 text-[13px] font-medium text-gray-muted transition-colors hover:bg-gray-bg hover:text-warm-black"
                >
                  View live site
                  <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
                </a>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-glass-border bg-glass p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
                  What changed
                </p>
                <h2 className="mt-2 text-[18px] font-semibold text-warm-black">Recent AI/site activity</h2>
              </div>
              <Link href={dashboardHref("/dashboard/reports")} className="text-[12px] font-medium text-accent hover:text-accent/80">
                Reports
              </Link>
            </div>
            {recentAiChanges.length > 0 ? (
              <div className="space-y-2">
                {recentAiChanges.map((entry) => (
                  <div key={`${entry.time}-${entry.text}`} className="rounded-lg border border-gray-border/70 bg-surface-raised px-3 py-2">
                    <p className="line-clamp-2 text-[13px] text-warm-black">{entry.text}</p>
                    <p className="mt-1 text-[10px] text-gray-faint">{new Date(entry.time).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-gray-border/70 bg-surface-raised px-3 py-3 text-[13px] leading-relaxed text-gray-muted">
                No AI changes yet. Ask for one small update or edit the site directly, then this becomes your proof trail.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
