import { getTenantFromHeaders } from "@/lib/tenant";
import { redirectIfDashboardPageMoved } from "@/platform/owner-entry/server";
import { requireDashboardView } from "@/lib/dashboard-auth";
import { loadGoogleBusinessData } from "@/lib/website-page-data";
import { EngagementTracker } from "@/components/dashboard/EngagementTracker";
import { GoogleBusinessPanel } from "@/components/dashboard/GoogleBusinessPanel";

export default async function GoogleBusinessPage() {
  // Moved to the workspace website when owner entry is on: the layout redirects a full load; this covers a soft navigation.
  await redirectIfDashboardPageMoved(await getTenantFromHeaders(), "/google");

  const { tenant } = await requireDashboardView();
  const { connected, state } = await loadGoogleBusinessData(tenant);

  return (
    <>
      <EngagementTracker event="gbp-view" />
      <GoogleBusinessPanel connected={connected} state={state} />
    </>
  );
}
