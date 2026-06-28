import { requireDashboardView } from "@/lib/dashboard-auth";
import { getConnection } from "@/lib/connections";
import { getGbpState } from "@/lib/gbp-management";
import { EngagementTracker } from "@/components/dashboard/EngagementTracker";
import { GoogleBusinessPanel } from "@/components/dashboard/GoogleBusinessPanel";

export default async function GoogleBusinessPage() {
  const { tenant } = await requireDashboardView();

  const connection = await getConnection(tenant, "google").catch(() => null);
  const connected = connection?.status === "connected";
  // Live listing state only when connected; the read itself degrades to null on
  // a transient API error (or before Google grants Business Profile API access).
  const state = connected ? await getGbpState(tenant).catch(() => null) : null;

  return (
    <>
      <EngagementTracker event="gbp-view" />
      <GoogleBusinessPanel connected={connected} state={state} />
    </>
  );
}
