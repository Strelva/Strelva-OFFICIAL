import { getActivity, getSiteSnapshots, type SiteSnapshotSummary } from "@/lib/storage";
import { getEvents } from "@/lib/events";
import { getScanHistory, getScanSummary, type ScanHistoryPoint, type ScanSummary } from "@/lib/scan-store";
import type { ActivityEntry } from "@/lib/storage/activity-store";
import type { UnifiedEvent } from "@/lib/types";
import { SiteHistoryView } from "./SiteHistoryView";

/**
 * Website > History: the change log and the way back for one tenant.
 * Server component, shared by `/dashboard/history` and the workspace website
 * (`/workspace/site?tab=history`). Each caller passes how its links resolve.
 * The caller has already authorized the tenant. Reads stay here; the page
 * itself is SiteHistoryView so it can be seen with fixtures.
 */
export async function SiteHistoryContent({ tenant, dashboardHref, historyHref, selectedRequestId, heading = true }: {
  tenant: string;
  dashboardHref: (path: string) => string;
  /** This page's own address, for "Reload history". */
  historyHref: string;
  selectedRequestId?: string;
  heading?: boolean;
}) {
  const [activity, snapshots, events, scanHistory, latestScan] = await Promise.allSettled([
    getActivity(tenant, { actor: "ai" }),
    // The full saved-version history (daily + manual backups) so the owner can
    // go back to ANY good version, not just the latest.
    getSiteSnapshots(tenant, 60),
    getEvents(tenant, { limit: 60, requireStore: true }),
    getScanHistory(tenant, { requireStore: true }),
    getScanSummary(tenant, { requireStore: true }),
  ]);
  const value = <T,>(result: PromiseSettledResult<T>): T | null => result.status === "fulfilled" ? result.value : null;
  return <SiteHistoryView
    heading={heading}
    dashboardHref={dashboardHref}
    historyHref={historyHref}
    selectedRequestId={selectedRequestId}
    activity={value<ActivityEntry[]>(activity)}
    snapshots={value<SiteSnapshotSummary[]>(snapshots)}
    events={value<UnifiedEvent[]>(events)}
    scanHistory={value<ScanHistoryPoint[]>(scanHistory)}
    latestScan={value<ScanSummary | null>(latestScan)}
    scanFailed={scanHistory.status === "rejected" || latestScan.status === "rejected"}
  />;
}
