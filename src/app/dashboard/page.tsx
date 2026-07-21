import Link from "next/link";
import { ArrowRight, ExternalLink, FileText, Inbox, Mail, MessageCircle, MousePointerClick, Sparkles, TrendingUp, Wand2 } from "lucide-react";
import { StatTile } from "@/components/dashboard/StatTile";
import { buildVerdict } from "@/lib/weekly-verdict";
import { requireDashboardView } from "@/lib/dashboard-auth";
import { getClickCounts, getActivity, getDailyMetrics } from "@/lib/storage";
import { getNeedsYouData } from "@/lib/needs-you";
import { QueuePage } from "@/components/dashboard/QueuePage";
import { getWeeklyBrief } from "@/lib/weekly-brief";
import { withClientFallbackRoot } from "@/lib/client-fallback";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantPrimaryDomain, getTenantPublicUrl, getTenantPublicUrlFromDomainMap } from "@/lib/tenant-urls";
import { getOwnerRetentionSignals } from "@/lib/retention";
import { getLeadSummary } from "@/lib/leads";
import { generateProactiveSuggestions } from "@/lib/proactive-suggestions";
import { getSuggestions, ownerSuggestions } from "@/lib/suggestions";
import { DoThisNextCard } from "@/components/dashboard/DoThisNextCard";
import { EngagementTracker } from "@/components/dashboard/EngagementTracker";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { selectStrelvaWork } from "@/lib/activity-feed";
import { RetentionPanel } from "@/components/dashboard/RetentionPanel";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";
import { OnboardingWizard } from "@/components/dashboard/OnboardingWizard";

async function DashboardHome() {
  const { tenant, clientFallbackRoot } = await requireDashboardView();

  const [
    pageViews,
    customerActions,
    needsYou,
    activity,
    brief,
    tenantConfig,
    retentionSignals,
    leadSummary,
    phoneActions,
    dailyMetrics,
  ] = await Promise.all([
    getClickCounts("page-view", tenant).catch(() => ({ thisWeek: 0, total: 0, lastWeek: 0 })),
    getClickCounts("booking-click", tenant).catch(() => ({ thisWeek: 0, total: 0, lastWeek: 0 })),
    // The approval queue, surfaced inline on Today (folds the separate "Needs
    // you" route into the home). Degrades to an empty queue on a backend blip.
    getNeedsYouData(tenant).catch(() => ({ pending: [], resolved: [], pendingCount: 0, staleSectionCount: 0 })),
    // The full log — split below into Strelva's own work (for the feed, which
    // then includes posted review replies logged actor:"user") and the AI-only
    // slice (for day-one detection).
    getActivity(tenant).catch(() => []),
    getWeeklyBrief(tenant).catch(() => null),
    getTenantConfig(tenant).catch(() => null),
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
    // A tel: tap is a customer action too — often the #1 local conversion — so it
    // folds into the top-line "Customer actions" total alongside booking clicks.
    getClickCounts("phone-click", tenant).catch(() => ({ thisWeek: 0, total: 0 })),
    // 14-day daily series for the KPI-tile sparklines. Fail-soft to empty — the
    // Sparkline self-suppresses on a flat/short series, so the tiles stay plain.
    getDailyMetrics(tenant, 14).catch(() => []),
  ]);
  const pendingCount = needsYou.pendingCount;
  // Customer actions = booking clicks + phone taps (booking's per-service
  // breakdown stays booking-only elsewhere; this is just the top-line total).
  const customerActionsTotal = customerActions.total + phoneActions.total;
  const customerActionsThisWeek = customerActions.thisWeek + phoneActions.thisWeek;
  const siteUrl = tenantConfig
    ? getTenantPublicUrl(tenantConfig, getTenantPrimaryDomain(tenantConfig) ? "production" : process.env.NODE_ENV)
    : getTenantPublicUrlFromDomainMap(tenant);
  const dashboardHref = (path: string) => withClientFallbackRoot(clientFallbackRoot, path);

  // Strelva's own work (AI updates + posted review replies) feeds the "what we
  // did for you" timeline; the owner's own manual edits are excluded so we never
  // claim their work as ours. The AI-only slice still drives day-one detection.
  const strelvaWork = selectStrelvaWork(activity);
  const aiActivity = activity.filter((a) => a.actor === "ai");

  // Day-one detection: a brand-new client has no traffic, no customer actions,
  // nothing in the review queue, no AI changes yet, and no weekly report.
  const isFresh =
    pageViews.total === 0 &&
    customerActionsTotal === 0 &&
    pendingCount === 0 &&
    aiActivity.length === 0 &&
    !brief;

  // Lead with the verdict — the weekly-report headline via the same buildVerdict
  // pattern Analytics uses, not a static slogan. Falls back to the primary metric
  // (or a plain "you're live" line) before the first report exists.
  // Compute the verdict from LIVE page-view counts (not the frozen brief) so the
  // Today headline reflects current reality and agrees with the live anomaly on
  // Analytics — a stale brief could say "up from last week" while traffic is
  // actually down right now. Falls back to plain lines before any traffic.
  const liveDelta = pageViews.thisWeek - (pageViews.lastWeek ?? 0);
  const verdict =
    brief || pageViews.thisWeek > 0
      ? buildVerdict({ pageViews: pageViews.thisWeek, pageViewsDelta: liveDelta })
      : isFresh
        ? "Your site is live and ready for customers."
        : pageViews.total > 0
          ? `${pageViews.total.toLocaleString()} ${pageViews.total === 1 ? "person has" : "people have"} found you so far.`
          : "Your site is live. Visits show up here as people find you.";

  // Proactive nudges (unreplied reviews, stale site, no posts) make the product
  // feel managed — but NEVER for a brand-new tenant: a phantom "needs you: 1" on
  // the day-one screen reads as broken. Idempotent + must not throw.
  if (!isFresh) {
    await generateProactiveSuggestions(tenant).catch(() => {});
  }

  // "Do this next" — the single top OWNER-facing pending suggestion (getSuggestions
  // returns pending, newest-first) surfaced as a one-tap hand-off into chat.
  // Operator craft is filtered out; the client is never handed our work. Never on
  // day one; fail-soft to no card.
  const topSuggestion = isFresh ? null : ownerSuggestions(await getSuggestions(tenant).catch(() => []))[0] ?? null;
  const doNextPrompt = topSuggestion
    ? topSuggestion.action.startsWith("prompt:")
      ? topSuggestion.action.slice("prompt:".length)
      : topSuggestion.action.startsWith("update_section:")
        ? `Help me update my ${topSuggestion.action.slice("update_section:".length)} section`
        : topSuggestion.title
    : "";

  return (
    <>
      <EngagementTracker event="dashboard-open" />
      <div className="h-full overflow-y-auto px-4 py-5 sm:px-8 sm:py-7 animate-route-enter">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
              Today
            </p>
            <h1 className="max-w-2xl font-display text-[28px] font-medium leading-snug text-warm-black sm:text-[32px]">
              {verdict}
            </h1>
            <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-gray-muted">
              Strelva keeps your site working behind the scenes. Here&apos;s what&apos;s happening — and the fastest way to change anything is just to ask.
            </p>
            {brief ? (
              <Link
                href={dashboardHref("/dashboard/reports")}
                className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent transition-colors hover:text-warm-black"
              >
                <FileText className="h-3.5 w-3.5" strokeWidth={1.5} />
                See your full weekly report
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
              </Link>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={dashboardHref("/dashboard/chat")}
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-accent px-4 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent/85"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
              Ask Strelva
            </Link>
            <Link
              href={dashboardHref("/dashboard/site")}
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-glass-border bg-glass px-4 text-[13px] font-medium text-warm-black transition-colors hover:bg-gray-bg"
            >
              <Wand2 className="h-4 w-4" strokeWidth={1.5} />
              Edit site
            </Link>
            {siteUrl && (
              <a
                href={siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-glass-border px-4 text-[13px] font-medium text-gray-muted transition-colors hover:bg-gray-bg hover:text-warm-black"
              >
                View live site
                <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
              </a>
            )}
          </div>
        </header>

          {/* Onboarding: on day one the inline checklist is the primary guide —
              suppress the wizard modal so a brand-new client isn't hit by both.
              Once the checklist is dismissed/complete the wizard may appear on a
              return visit if businessModel is still unset. */}
          {!isFresh && <OnboardingWizard />}
          {/* One contextual card, mutually exclusive: fresh owners get the setup
              checklist (self-hides once done/dismissed); everyone else gets the
              weekly-proof / retention panel. */}
          <OnboardingChecklist tenant={tenant} defaultOpen={isFresh} />

          {/* Proof first. A returning owner should feel "look what's working /
              what got handled for me" before being asked to do anything, so the
              reassuring numbers and the managed-service receipt lead; the approval
              queue follows below. */}
          {!isFresh ? (
          <section className="grid gap-3 md:grid-cols-3">
          {/* Lead with the cumulative number (the reassuring one that matches the
              weekly report + "since launch"), not the just-started week. Recent
              activity goes in the detail line. */}
          <StatTile
            label="People found you"
            value={pageViews.total}
            detail={`${pageViews.thisWeek} in the last 7 days`}
            icon={<TrendingUp className="h-4 w-4" strokeWidth={1.5} />}
            series={dailyMetrics.map((m) => m.pageViews)}
          />
          <StatTile
            label="Customer actions"
            value={customerActionsTotal}
            detail={
              phoneActions.total > 0
                ? `${customerActions.thisWeek} clicked to book · ${phoneActions.thisWeek} called in the last 7 days`
                : `${customerActionsThisWeek} in the last 7 days`
            }
            icon={<MousePointerClick className="h-4 w-4" strokeWidth={1.5} />}
            series={dailyMetrics.map((m) => m.bookingClicks + (m.phoneClicks ?? 0))}
          />
          <StatTile
            label="Site updates"
            value={retentionSignals.aiChangesThisWeek}
            detail={
              retentionSignals.aiChangesThisWeek > 0
                ? "Strelva handled these for you this week"
                : "No updates needed this week"
            }
            icon={<Sparkles className="h-4 w-4" strokeWidth={1.5} />}
          />
          </section>
          ) : null}

          {/* "What Strelva did for you" — the anti-churn proof timeline. The
              managed service made visible. Only past day-one (its own honest
              empty state covers a new-but-not-day-one client). */}
          {!isFresh ? (
            <ActivityFeed activity={strelvaWork} historyHref={dashboardHref("/dashboard/history")} />
          ) : null}

          {/* Then — only after the proof — the few things that actually need the
              owner: a rare owner-facing "do this next", then the "Needs you"
              approval queue. */}
          {topSuggestion ? (
            <DoThisNextCard title={topSuggestion.title} prompt={doNextPrompt} />
          ) : null}

          {pendingCount > 0 ? (
            <section className="rounded-2xl border border-accent/25 bg-glass">
              <div className="max-h-[520px] overflow-y-auto">
                <QueuePage
                  initialPending={needsYou.pending}
                  initialResolved={needsYou.resolved}
                  pendingCount={needsYou.pendingCount}
                  staleSectionCount={needsYou.staleSectionCount}
                  compact
                />
              </div>
            </section>
          ) : null}

          {leadSummary.recent.length > 0 ? (
            <section className="rounded-2xl border border-glass-border bg-glass p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
                    Who reached out
                  </p>
                  <h2 className="mt-2 font-display text-[18px] font-normal text-warm-black">
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
                    ) : null}
                    {lead.email ? (
                      <a
                        href={`mailto:${lead.email}`}
                        className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-medium text-accent hover:text-accent/80"
                      >
                        <Mail className="h-3.5 w-3.5" strokeWidth={1.5} />
                        Reply to {lead.email}
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
              <Link
                href={dashboardHref("/dashboard/leads")}
                className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:text-accent/80"
              >
                See everyone who reached out
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
              </Link>
            </section>
          ) : null}

          {!isFresh ? <RetentionPanel signals={retentionSignals} /> : null}
        </div>
      </div>
    </>
  );
}

export default async function DashboardPage() {
  return <DashboardHome />;
}
