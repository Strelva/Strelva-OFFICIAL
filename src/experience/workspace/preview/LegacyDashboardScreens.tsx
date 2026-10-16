/**
 * Screen switch for the legacy website dashboard preview. Each screen renders
 * the REAL dashboard component with fixture props inside the real shell.
 */
import type { ReactNode } from "react";
import { DashboardToday } from "@/components/dashboard/DashboardToday";
import { QueuePage } from "@/components/dashboard/QueuePage";
import { QueueSkeleton } from "@/components/dashboard/QueueSkeleton";
import { DashLoading } from "@/components/dashboard/xa/DashboardXa";
import DashboardNotFound from "@/app/dashboard/not-found";
import { AnalyticsLiveView } from "@/components/dashboard/AnalyticsLiveView";
import { WeeklyBriefClient } from "@/components/dashboard/WeeklyBriefClient";
import { ReportsViewToggle } from "@/components/dashboard/ReportsViewToggle";
import { LeadsPanel } from "@/components/dashboard/LeadsPanel";
import { MembersPanel } from "@/components/dashboard/MembersPanel";
import { RosterPanel } from "@/components/dashboard/RosterPanel";
import { SchedulePanel } from "@/components/dashboard/SchedulePanel";
import { StorePanel } from "@/components/dashboard/StorePanel";
import { ReviewsPanel } from "@/components/dashboard/ReviewsPanel";
import { GoogleBusinessPanel } from "@/components/dashboard/GoogleBusinessPanel";
import { SiteHistoryView } from "@/components/dashboard/SiteHistoryView";
import { buildProofCards } from "@/lib/proof";
import { buildVerdict } from "@/lib/weekly-verdict";
import {
  AI_VISIBILITY, ANOMALY, WEEK, BENCHMARK, BOOKING_CONFIG, GA_PERF, GOAL, LEGACY_TODAY, MILESTONE, OVERRIDES, PRE_DRAFTS, PROOF_CARDS, REPLY_VOICE, SCAN_HISTORY, SCAN_LATEST, SEARCH_PERF, UNCONNECTED_GA, UNCONNECTED_SEARCH,
  bookings, briefHistory, gbp, historyEvents, leads, members, periodStats, reviews, series, snapshots, store, weeklyBrief,
} from "./legacy-dashboard-screen-data";
import { LegacyBrandKit, LegacyChat, LegacyCollections, LegacyConnectionDetail, LegacyConnections, LegacyHistoryFrame, LegacyPhotos, LegacySettings, LegacySite } from "./LegacyDashboardClientBits";
import { LegacyDashboardShell } from "./LegacyDashboardShell";
import { XA_DAY } from "./xa-day";
import { LegacyConfirmPreview, LegacyErrorPreview } from "./LegacyDashboardClientBits";
import {
  LEGACY_BASE, LEGACY_BUSINESS, LEGACY_OWNER, LEGACY_TENANT, legacyActivity, legacyLeads, legacyPending, legacyResolved, legacyRetention, type LegacyState,
} from "./legacy-dashboard-fixtures";

type Props = { screen: string; state: LegacyState; mode: "light" | "dark"; query: Record<string, string | undefined> };

const href = (path: string) => `${LEGACY_BASE}${path}`;
/** Screens whose real component says its own error in place (the fixture API refuses), instead of the route boundary. */
const SELF_REPORTING = new Set(["review", "assets", "integrations", "collections", "google", "chat"]);

function today(state: LegacyState) {
  const pending = state === "waiting" || state === "ready" ? legacyPending(state) : [];
  const fresh = state === "empty";
  return <DashboardToday
    tenant={LEGACY_TENANT}
    ownerName={LEGACY_OWNER}
    businessName={LEGACY_BUSINESS}
    verdict={fresh ? "Your site is live and ready for patients." : buildVerdict({ pageViews: WEEK.people, pageViewsDelta: WEEK.people - WEEK.peoplePrior })}
    isFresh={fresh}
    isOperator={false}
    numbers={{ foundTotal: fresh ? 0 : WEEK.sinceLaunch, foundWeek: fresh ? 0 : WEEK.people, actionsTotal: fresh ? 0 : 610, bookedWeek: WEEK.booked, calledWeek: WEEK.called }}
    needsYou={{ pending, resolved: legacyResolved(), pendingCount: pending.length, staleSectionCount: 0 }}
    strelvaWork={fresh ? [] : legacyActivity()}
    suggestion={state === "ready" ? { title: "Add a page for same-week emergency visits", prompt: "Add a page for same-week emergency visits" } : null}
    leads={legacyLeads(state)}
    retentionSignals={legacyRetention()}
    now={XA_DAY.now}
    hrefs={{ reports: href("/dashboard/reports"), analytics: href("/dashboard/analytics"), history: href("/dashboard/history"), leads: href("/dashboard/leads"), site: href("/dashboard/site"), live: null }}
  />;
}

function review(state: LegacyState) {
  if (state === "loading") return <QueueSkeleton />;
  const pending = state === "empty" || state === "done" ? [] : legacyPending(state);
  return <QueuePage initialPending={pending} initialResolved={legacyResolved()} pendingCount={pending.length} staleSectionCount={state === "empty" ? 2 : 0} />;
}

export function LegacyDashboardScreen({ screen, state, mode, query }: Props) {
  const pendingCount = state === "empty" || state === "done" ? 0 : 3;
  let body: ReactNode = null;
  if (screen.startsWith("sources/")) body = <LegacyConnectionDetail id={screen.slice("sources/".length)} />;
  else if (state === "loading" && screen !== "review") body = <DashLoading label="Loading this page" />;
  else if (state === "error" && !SELF_REPORTING.has(screen)) body = <LegacyErrorPreview />;
  if (!body) switch (screen) {
    case "today": body = today(state); break;
    case "review": body = review(state); break;
    case "chat": body = <LegacyChat state={state} />; break;
    case "analytics": body = <AnalyticsLiveView stats={periodStats(state)} anomaly={state === "ready" ? ANOMALY : null} connectHref={href("/dashboard/integrations")} chatHref={href("/dashboard/chat")}
      searchPerf={state === "empty" ? UNCONNECTED_SEARCH : SEARCH_PERF} gaPerf={state === "empty" ? UNCONNECTED_GA : GA_PERF} milestone={state === "empty" ? null : MILESTONE} visitorSeries={series(30).map((m) => m.pageViews)} aiVisibility={state === "empty" ? null : AI_VISIBILITY} />; break;
    case "reports": body = state === "empty"
      ? <WeeklyBriefClient brief={null} searchPerf={UNCONNECTED_SEARCH} gaPerf={UNCONNECTED_GA} analyticsConnectHref={href("/dashboard/integrations")} />
      : <WeeklyBriefClient brief={weeklyBrief()} history={briefHistory()} dailyMetrics={series(30)} proofCards={PROOF_CARDS.length ? PROOF_CARDS : buildProofCards([], series(30))} goal={GOAL} benchmark={BENCHMARK} aiVisibility={AI_VISIBILITY}
          searchPerf={SEARCH_PERF} gaPerf={GA_PERF} analyticsConnectHref={href("/dashboard/integrations")} viewToggle={<ReportsViewToggle current="weekly" />} />; break;
    case "leads": body = <LeadsPanel leads={leads(state)} />; break;
    case "members": body = state === "waiting" ? <MembersPanel configured={false} /> : <MembersPanel configured members={members(state)} />; break;
    case "roster": body = <RosterPanel bookings={bookings(state).filter((b) => b.date === LEGACY_TODAY)} today={LEGACY_TODAY} />; break;
    case "schedule": body = <SchedulePanel bookings={bookings(state)} config={BOOKING_CONFIG} overrides={OVERRIDES} today={LEGACY_TODAY} />; break;
    case "store": { const data = store(state); body = <StorePanel summary={data.summary} orders={data.orders} products={data.products} productsHref={href("/dashboard/collections")} />; break; }
    case "reviews": body = <ReviewsPanel reviews={reviews(state)} googlePlaceId="ChIJ-harbor" gbpConnected={state !== "waiting"} voice={REPLY_VOICE} preDrafts={PRE_DRAFTS} />; break;
    case "google": body = <GoogleBusinessPanel connected={state !== "empty"} state={gbp(state)} />; break;
    case "history": body = <LegacyHistoryFrame><SiteHistoryView heading dashboardHref={href} historyHref={href("/dashboard/history")} activity={state === "empty" ? [] : legacyActivity()} snapshots={snapshots(state)} events={historyEvents(state)}
      scanHistory={state === "empty" ? [] : SCAN_HISTORY} latestScan={state === "empty" ? null : SCAN_LATEST} scanFailed={false} /></LegacyHistoryFrame>; break;
    case "assets": body = <LegacyPhotos />; break;
    case "brand-kit": body = <LegacyBrandKit />; break;
    case "collections": body = <LegacyCollections state={state} />; break;
    case "integrations": body = <LegacyConnections />; break;
    case "settings": body = <LegacySettings />; break;
    case "site": body = <LegacySite />; break;
    case "not-found": body = <DashboardNotFound />; break;
    case "confirm": body = <LegacyConfirmPreview />; break;
    default: body = <DashboardNotFound />;
  }
  return <LegacyDashboardShell mode={mode} pendingCount={pendingCount} billing={query.billing === "past_due" ? "past_due" : undefined}>{body}</LegacyDashboardShell>;
}
