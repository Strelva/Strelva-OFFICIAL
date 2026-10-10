import { notFound } from "next/navigation";
import { getTenantFromHeaders } from "@/lib/tenant";
import { redirectIfDashboardPageMoved } from "@/platform/owner-entry/server";

/** Catch-all for unmatched /dashboard/* URLs. Next routes unmatched paths to the
 *  ROOT not-found by default; this funnels them to the dashboard's own not-found
 *  (rendered inside the dashboard shell, with "Back to dashboard") instead.
 *  For a moved workspace (owner entry on), an unknown path goes to Home. */
export default async function DashboardCatchAll() {
  await redirectIfDashboardPageMoved(await getTenantFromHeaders(), "/[...notFound]");
  notFound();
}
