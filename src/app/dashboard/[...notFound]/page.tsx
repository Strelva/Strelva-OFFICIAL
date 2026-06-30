import { notFound } from "next/navigation";

/** Catch-all for unmatched /dashboard/* URLs. Next routes unmatched paths to the
 *  ROOT not-found by default; this funnels them to the dashboard's own not-found
 *  (rendered inside the dashboard shell, with "Back to dashboard") instead. */
export default function DashboardCatchAll() {
  notFound();
}
