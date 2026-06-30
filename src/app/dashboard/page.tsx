import Link from "next/link";
import type { ComponentType } from "react";
import { ArrowRight, CheckCircle2, Clock3, ExternalLink, FileText, Inbox, Link2, MessageCircle, MousePointerClick, ShieldCheck, TrendingUp, Wand2 } from "lucide-react";
import { requireDashboardView } from "@/lib/dashboard-auth";
import { getClickCounts, getActivity } from "@/lib/storage";
import { getQueueCount } from "@/lib/events";
import { getWeeklyBrief } from "@/lib/weekly-brief";
import { withClientFallbackRoot } from "@/lib/client-fallback";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantPrimaryDomain, getTenantPublicUrl, getTenantPublicUrlFromDomainMap } from "@/lib/tenant-urls";
import { getOwnerRetentionSignals } from "@/lib/retention";
import { getLeadSummary } from "@/lib/leads";
import { generateProactiveSuggestions } from "@/lib/proactive-suggestions";
import { getTemplateForTenant } from "@/components/templates/registry";
import { EngagementTracker } from "@/components/dashboard/EngagementTracker";
import { RetentionPanel } from "@/components/dashboard/RetentionPanel";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";

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

type DashboardSearchParams = Record<string, string | string[] | undefined>;

function searchValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

async function DashboardHome({
  searchParams,
}: {
  searchParams?: Promise<DashboardSearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const { tenant, clientFallbackRoot } = await requireDashboardView();

  const [
    pageViews,
    customerActions,
    pendingCount,
    activity,
    brief,
    tenantConfig,
    template,
    retentionSignals,
    leadSummary,
  ] = await Promise.all([
    getClickCounts("page-view", tenant).catch(() => ({ thisWeek: 0, total: 0 })),
    getClickCounts("booking-click", tenant).catch(() => ({ thisWeek: 0, total: 0 })),
    getQueueCount(tenant).catch(() => 0),
    getActivity(tenant, { actor: "ai" }).catch(() => []),
    getWeeklyBrief(tenant).catch(() => null),
    getTenantConfig(tenant).catch(() => null),
    getTemplateForTenant(tenant).catch(() => null),
    getOwnerRetentionSignals(tenant).catch(() => ({
      aiChangesThisWeek: 0,
      noAiUsageDays: null,
      trafficAfterAiUpdates: 0,
      dashboardOpensThisWeek: 0,
      engagementSignalsThisWeek: 0,
      aiChatOpensThisWeek: 0,
      reportViewsThisWeek: 0,
      referralsThisWeek: 0,
      noDashboardOpenDays: null,
      churnRisk: "healthy" as const,
      riskReason: "Unable to load retention data",
      nextAction: "Check back shortly.",
      ownerNextAction: "Check back shortly.",
    })),
    getLeadSummary(tenant, 30).catch(() => ({ count: 0, recent: [] })),
  ]);
  const siteUrl = tenantConfig
    ? getTenantPublicUrl(tenantConfig, getTenantPrimaryDomain(tenantConfig) ? "production" : process.env.NODE_ENV)
    : getTenantPublicUrlFromDomainMap(tenant);
  const dashboardHref = (path: string) => withClientFallbackRoot(clientFallbackRoot, path);
  const showWelcome =
    searchValue(params.welcome) === "1" || searchValue(params.checkout) === "success";
  const briefHeadline = brief?.highlights?.find((line) => line.trim().length > 0) || brief?.summary?.trim() || null;
  const nextAction = brief?.nextAction?.title || (pendingCount > 0 ? "Review what needs you" : "Make one useful site update");
  const nextActionDetail = brief?.nextAction?.description ||
    (pendingCount > 0
      ? `${pendingCount} item${pendingCount === 1 ? "" : "s"} waiting before anything goes live.`
      : "Start with a small offer, hours, product, or homepage copy change.");

  // Day-one detection: a brand-new client has no traffic, no customer actions,
  // nothing in the review queue, no AI changes yet, and no weekly report. For
  // them we replace the wall of zeros with positive "your site is live" framing.
  const isFresh =
    pageViews.total === 0 &&
    customerActions.total === 0 &&
    pendingCount === 0 &&
    activity.length === 0 &&
    !briefHeadline;

  // Proactive nudges (unreplied reviews, stale site, no posts) make the product
  // feel managed — but NEVER for a brand-new tenant: a phantom "needs you: 1" on
  // the day-one screen reads as broken. Generated after isFresh is computed off a
  // clean queue count, so a fresh tenant stays fresh. Idempotent + must not throw.
  if (!isFresh) {
    await generateProactiveSuggestions(tenant).catch(() => {});
  }

  // What the site already ships, derived from its template (zero extra reads
  // beyond the tenant config we already loaded). These are honest "it's live"
  // counts to anchor the day-one view instead of 0 / 0 / 0.
  const livePageCount = template ? Object.keys(template.defaultPageConfig).length : 0;
  const liveSectionCount = template ? template.contentSections.length : 0;
  const siteName = tenantConfig?.siteName?.trim() || null;
  const siteDomain =
    tenantConfig?.productionDomain?.trim() ||
    (siteUrl ? siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "") : null);

  return (
    <>
      <EngagementTracker event="dashboard-open" />
      <div className="h-full overflow-y-auto px-4 py-5 sm:px-8 sm:py-7 animate-route-enter">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
              Today
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-[28px] font-normal text-warm-black sm:text-[36px]">
              See what is working. Change what is next.
            </h1>
            <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-gray-muted">
              This is the short version: how people found you, what needs your attention, and the fastest path to update the site.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={dashboardHref("/dashboard/chat")}
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-accent px-4 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent/85"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
              Ask AI
            </Link>
            <Link
              href={dashboardHref("/dashboard/site")}
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-glass-border bg-glass px-4 text-[13px] font-medium text-warm-black transition-colors hover:bg-gray-bg"
            >
              <Wand2 className="h-4 w-4" strokeWidth={1.5} />
              Edit site
            </Link>
          </div>
        </header>

          <OnboardingChecklist tenant={tenant} defaultOpen={isFresh} />

          {isFresh ? (
          <section className="rounded-2xl border border-accent/25 bg-accent-dim/30 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">
                  Your site is live
                </p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-[22px] font-normal leading-snug text-warm-black">
                  {siteName ? `${siteName} is up and running.` : "Your site is up and running."}
                </h2>
                {siteDomain ? (
                  <p className="mt-2 text-[14px] leading-relaxed text-gray-muted">
                    Live at{" "}
                    {siteUrl ? (
                      <a
                        href={siteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-accent hover:text-accent/80"
                      >
                        {siteDomain}
                      </a>
                    ) : (
                      <span className="font-medium text-warm-black">{siteDomain}</span>
                    )}
                    {liveSectionCount > 0
                      ? ` — ${livePageCount} page${livePageCount === 1 ? "" : "s"} and ${liveSectionCount} section${liveSectionCount === 1 ? "" : "s"} already built and ready for customers.`
                      : " and ready for customers."}
                  </p>
                ) : (
                  <p className="mt-2 text-[14px] leading-relaxed text-gray-muted">
                    {liveSectionCount > 0
                      ? `${livePageCount} page${livePageCount === 1 ? "" : "s"} and ${liveSectionCount} section${liveSectionCount === 1 ? "" : "s"} are already built and ready for customers.`
                      : "Your site is built and ready for customers."}
                  </p>
                )}
                <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-gray-muted">
                  Visits and customer actions will show up here as people find you. Here is where to start.
                </p>
              </div>
              <CheckCircle2 className="h-5 w-5 shrink-0 text-success" strokeWidth={1.5} />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <QuickWinLink
                href={dashboardHref("/dashboard/chat")}
                icon={MessageCircle}
                title="Ask AI for an update"
                description="Tell it what changed this week and it turns it into fresh site content."
              />
              <QuickWinLink
                href={dashboardHref("/dashboard/google")}
                icon={Link2}
                title="Connect Google Business"
                description="Bring trusted profile and review signals into your dashboard."
              />
              <QuickWinLink
                href={dashboardHref("/dashboard/settings#profile")}
                icon={Clock3}
                title="Confirm your details"
                description="Check phone, booking link, and the hours customers rely on."
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {siteUrl && (
                <a
                  href={siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-warm-white px-4 text-[13px] font-medium text-on-warm-white transition-colors hover:bg-warm-white/90"
                >
                  View live site
                  <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
                </a>
              )}
            </div>
          </section>
          ) : null}

          {briefHeadline ? (
          <Link
            href={dashboardHref("/dashboard/reports")}
            className="group flex items-start justify-between gap-4 rounded-2xl border border-accent/25 bg-accent-dim/30 p-4 transition-colors hover:bg-accent-dim/45"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">
                Latest weekly report
              </p>
              <p className="mt-2 text-[15px] font-medium leading-snug text-warm-black">
                {briefHeadline}
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-accent">
                See your full report
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} />
              </span>
            </div>
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-accent" strokeWidth={1.5} />
          </Link>
          ) : null}

          {!isFresh ? (
          <section className="grid gap-3 md:grid-cols-3">
          {/* Lead with the cumulative number (the reassuring one that matches the
              weekly report + "since launch"), not the just-started week — which
              reads 0 most of the time and made the headline contradict the copy
              right next to it. Recent activity goes in the detail line. */}
          <StatTile
            label="People found you"
            value={pageViews.total}
            detail={`${pageViews.thisWeek} in the last 7 days`}
            icon={TrendingUp}
          />
          <StatTile
            label="Customer actions"
            value={customerActions.total}
            detail={`${customerActions.thisWeek} in the last 7 days`}
            icon={MousePointerClick}
          />
          <StatTile
            label="Needs you"
            value={pendingCount}
            detail={pendingCount > 0 ? "Review before anything goes live" : "Nothing is waiting on approval"}
            icon={ShieldCheck}
          />
          </section>
          ) : null}


          {leadSummary.recent.length > 0 ? (
            <section className="rounded-2xl border border-glass-border bg-glass p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
                    Who reached out
                  </p>
                  <h2 className="mt-2 font-[family-name:var(--font-display)] text-[18px] font-normal text-warm-black">
                    {leadSummary.count} {leadSummary.count === 1 ? "person" : "people"} this month
                  </h2>
                </div>
                <Inbox className="h-5 w-5 shrink-0 text-accent" strokeWidth={1.5} />
              </div>
              <ul className="divide-y divide-gray-border/60">
                {leadSummary.recent.map((lead) => (
                  <li key={lead.id} className="py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13px] font-medium text-warm-black">{lead.name}</span>
                      <span className="shrink-0 text-[11px] text-gray-faint">{new Date(lead.createdAt).toLocaleDateString()}</span>
                    </div>
                    {lead.message ? (
                      <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-gray-muted">{lead.message}</p>
                    ) : lead.email ? (
                      <p className="mt-0.5 text-[12px] text-gray-muted">{lead.email}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <RetentionPanel signals={retentionSignals} />

          {showWelcome && !isFresh ? (
          <section className="rounded-2xl border border-accent/25 bg-accent-dim/30 p-5">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">
                  First run
                </p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-[20px] font-normal text-warm-black">
                  Your starter site is ready. Make the first useful wins.
                </h2>
                <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-gray-muted">
                  Start with the details customers notice first, then let the AI turn one business update into fresh site content.
                </p>
              </div>
              <CheckCircle2 className="h-5 w-5 shrink-0 text-success" strokeWidth={1.5} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <QuickWinLink
                href={dashboardHref("/dashboard/settings#profile")}
                icon={Clock3}
                title="Update hours"
                description="Confirm phone, booking link, and the hours customers rely on."
              />
              <QuickWinLink
                href={dashboardHref("/dashboard/google")}
                icon={Link2}
                title="Connect Google Business"
                description="Bring trusted profile and review signals into the dashboard."
              />
              <QuickWinLink
                href={dashboardHref("/dashboard/chat")}
                icon={FileText}
                title="Draft first blog post"
                description="Tell AI what changed this week and turn it into a first update."
              />
            </div>
          </section>
          ) : null}

          <section>
          <div className="rounded-2xl border border-glass-border bg-glass p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
                  Next useful move
                </p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-[20px] font-normal text-warm-black">{nextAction}</h2>
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
          </section>
        </div>
      </div>
    </>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<DashboardSearchParams>;
}) {
  return <DashboardHome searchParams={searchParams} />;
}

function QuickWinLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-glass-border bg-glass p-4 transition-colors hover:bg-gray-bg"
    >
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-surface-raised text-accent">
        <Icon className="h-4 w-4" strokeWidth={1.5} />
      </div>
      <h3 className="text-[14px] font-medium text-warm-black">{title}</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-gray-muted">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-accent">
        Open
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} />
      </span>
    </Link>
  );
}
