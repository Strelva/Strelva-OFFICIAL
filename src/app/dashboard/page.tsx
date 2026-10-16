import { buildVerdict } from "@/lib/weekly-verdict";
import { requireDashboardView } from "@/lib/dashboard-auth";
import { getActorContext, isSuperAdmin } from "@/platform/infra/auth";
import { getTenantSiteName } from "@/lib/tenant-display";
import { DashboardToday } from "@/components/dashboard/DashboardToday";
import { getClickCounts, getActivity } from "@/lib/storage";
import { getNeedsYouData } from "@/lib/needs-you";
import { getWeeklyBrief } from "@/lib/weekly-brief";
import { withClientFallbackRoot } from "@/lib/client-fallback";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantPrimaryDomain, getTenantPublicUrl, getTenantPublicUrlFromDomainMap } from "@/lib/tenant-urls";
import { getOwnerRetentionSignals } from "@/lib/retention";
import { getLeadSummary } from "@/lib/leads";
import { generateProactiveSuggestions } from "@/lib/proactive-suggestions";
import { getSuggestions, ownerSuggestions } from "@/lib/suggestions";
import { EngagementTracker } from "@/components/dashboard/EngagementTracker";
import { selectStrelvaWork } from "@/lib/activity-feed";
import { getTenantFromHeaders } from "@/lib/tenant";
import { redirectIfDashboardPageMoved } from "@/platform/owner-entry/server";

async function DashboardHome() {
  // Moved to workspace Home where owner entry and Needs you are on; covers a soft navigation.
  await redirectIfDashboardPageMoved(await getTenantFromHeaders(), "/");
  const { tenant, clientFallbackRoot } = await requireDashboardView();
  const isOperator = await isSuperAdmin();

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
  ]);
  const pendingCount = needsYou.pendingCount;
  // Customer actions = booking clicks + phone taps (booking's per-service
  // breakdown stays booking-only elsewhere; this is just the top-line total).
  const customerActionsTotal = customerActions.total + phoneActions.total;
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

  // The signed-in person, the same login identity the sidebar greets.
  const actor = await getActorContext(tenant).catch(() => null);
  const accountEmail = actor?.email && actor.email.includes("@") ? actor.email : null;
  const ownerName = actor?.name?.trim() || (accountEmail ? accountEmail.split("@")[0]! : "") || tenantConfig?.ownerName || "there";
  const businessName = tenantConfig ? getTenantSiteName(tenant, tenantConfig) : tenant;

  return (
    <>
      <EngagementTracker event="dashboard-open" />
      <DashboardToday
        tenant={tenant}
        ownerName={ownerName}
        businessName={businessName}
        verdict={verdict}
        isFresh={isFresh}
        isOperator={isOperator}
        numbers={{
          foundTotal: pageViews.total,
          foundWeek: pageViews.thisWeek,
          actionsTotal: customerActionsTotal,
          bookedWeek: customerActions.thisWeek,
          calledWeek: phoneActions.thisWeek,
        }}
        needsYou={needsYou}
        strelvaWork={strelvaWork}
        suggestion={topSuggestion ? { title: topSuggestion.title, prompt: doNextPrompt } : null}
        leads={leadSummary}
        retentionSignals={retentionSignals}
        hrefs={{
          reports: brief ? dashboardHref("/dashboard/reports") : undefined,
          history: dashboardHref("/dashboard/history"),
          leads: dashboardHref("/dashboard/leads"),
          site: dashboardHref("/dashboard/site"),
          live: siteUrl,
        }}
      />
    </>
  );
}

export default async function DashboardPage() {
  return <DashboardHome />;
}
