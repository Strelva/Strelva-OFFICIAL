import { requireDashboardView } from "@/lib/dashboard-auth";
import { getLeads } from "@/lib/leads";
import { LeadsPanel } from "@/components/dashboard/LeadsPanel";

export default async function LeadsPage() {
  const { tenant } = await requireDashboardView();

  // Degrade to the empty state on a transient backend error rather than
  // escalating a recoverable failure into the full error boundary. 500 is the
  // store's retention cap, so this is the full captured window, newest first.
  const leads = await getLeads(tenant, 500).catch(() => []);

  return <LeadsPanel leads={leads} />;
}
