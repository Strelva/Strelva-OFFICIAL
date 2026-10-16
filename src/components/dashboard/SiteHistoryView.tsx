import type { SiteSnapshotSummary } from "@/lib/storage";
import type { ScanHistoryPoint, ScanSummary } from "@/lib/scan-store";
import type { ActivityEntry } from "@/lib/storage/activity-store";
import type { UnifiedEvent } from "@/lib/types";
import { buildActivityFeed } from "@/lib/activity-feed";
import { XaHeadline, XaLines } from "@/components/ui/strelva/Xa";
import { SiteSafetyPanel } from "./SiteSafetyPanel";
import { WebsiteRequestHistory } from "./WebsiteRequestHistory";
import { DatedSiteCheckHistory } from "./DatedSiteCheckHistory";
import { DashNote, DashSection } from "./xa/DashboardXa";
import styles from "./xa/dashboard-xa.module.css";

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * History (XA, S6 analog): what changed and the saved versions to go back to.
 * `null` for a read means it failed; the page says so in a sentence beside
 * that part and keeps the rest.
 */
export function SiteHistoryView({ heading, dashboardHref, historyHref, selectedRequestId, activity, snapshots, events, scanHistory, latestScan, scanFailed }: {
  heading: boolean;
  dashboardHref: (path: string) => string;
  historyHref: string;
  selectedRequestId?: string;
  activity: ActivityEntry[] | null;
  snapshots: SiteSnapshotSummary[] | null;
  events: UnifiedEvent[] | null;
  scanHistory: ScanHistoryPoint[] | null;
  latestScan: ScanSummary | null;
  scanFailed: boolean;
}) {
  // Owner words for each change ("Refreshed your homepage"), never a section id.
  const recentChanges = activity ? buildActivityFeed(activity, { maxItems: 12 }).flatMap((group) => group.items) : [];
  const unavailable = (message: string) => (
    <DashNote tone="down" role="alert" links={[<a key="reload" href={historyHref} className="font-medium text-[var(--st-accent)] hover:underline">Reload history</a>]}>{message}</DashNote>
  );

  return (
    <div className="flex w-full max-w-[880px] flex-col gap-9">
      {heading ? <XaHeadline size="sm" quiet="Every saved version of your site is here to go back to.">What changed.</XaHeadline> : null}

      <DashSection label="Recent changes" aside={<a href={dashboardHref("/dashboard/reports")} className="font-medium text-[var(--st-accent)] hover:underline">Recaps</a>}>
        {activity === null ? unavailable("Recent changes are temporarily unavailable.") : recentChanges.length > 0 ? (
          <XaLines label="Recent changes" lines={recentChanges.map((entry) => ({ time: when(entry.time), dateTime: entry.time, text: <>{entry.label}{entry.detail ? <span className="text-[var(--st-text-2)]">. {entry.detail}</span> : null}</> }))} />
        ) : (
          <p className={styles.prose}>No updates yet. Ask Strelva for one small change and it shows up here with its date.</p>
        )}
      </DashSection>

      {snapshots ? <SiteSafetyPanel snapshots={snapshots} /> : unavailable("History is temporarily unavailable.")}

      {events ? <WebsiteRequestHistory events={events} dashboardHref={dashboardHref} selectedRequestId={selectedRequestId} /> : unavailable("Website request history is temporarily unavailable.")}

      {scanFailed ? unavailable("Site check history is temporarily unavailable.") : null}
      {scanHistory && latestScan ? (
        <DatedSiteCheckHistory latest={latestScan} history={scanHistory} dashboardHref={dashboardHref} />
      ) : scanHistory && scanHistory.length > 0 ? (
        <DatedSiteCheckHistory latest={null} history={scanHistory} dashboardHref={dashboardHref} />
      ) : latestScan ? (
        <DatedSiteCheckHistory latest={latestScan} history={[]} dashboardHref={dashboardHref} />
      ) : null}
    </div>
  );
}
