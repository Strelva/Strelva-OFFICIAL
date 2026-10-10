import { requireDashboardView } from "@/lib/dashboard-auth";
import { leadReadMode } from "@/lib/lead-reads";
import { z } from "zod";
import { getLeads } from "@/lib/leads";
import { LeadsPanel } from "@/components/dashboard/LeadsPanel";
import { getTenantFromHeaders } from "@/lib/tenant";
import { redirectIfDashboardPageMoved } from "@/platform/owner-entry/server";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Moved to /workspace/inquiries where owner entry is on; covers a soft navigation.
  await redirectIfDashboardPageMoved(await getTenantFromHeaders(), "/leads");
  const { tenant } = await requireDashboardView();

  // Degrade to the empty state on a transient backend error rather than
  // escalating a recoverable failure into the full error boundary. 500 is the
  // store's retention cap, so this is the full captured window, newest first.
  if (leadReadMode() !== "postgres") {
    const leads = await getLeads(tenant, 500).catch(() => []);
    return <LeadsPanel leads={leads} />;
  }
  const cursor = z.object({ before: z.iso.datetime({ offset: true }), beforeId: z.string().min(1).max(200) }).safeParse(await searchParams);
  const leads = await getLeads(tenant, 500, cursor.success ? cursor.data.before : null, cursor.success ? cursor.data.beforeId : null).catch(() => []);
  const last = leads.at(-1);
  return <><LeadsPanel leads={leads} />{leads.length === 500 && last ? <a className="m-6 inline-flex min-h-12 items-center text-sm underline" href={`/dashboard/leads?before=${encodeURIComponent(last.createdAt)}&beforeId=${encodeURIComponent(last.id)}`}>Earlier inquiries</a> : null}</>;
}
