import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";

// Site health folded into the merged Analytics surface (collapsible section under
// the weekly report). Kept as an alias so old deep links still land.
export default async function HealthRedirect() {
  const clientFallbackRoot = getClientFallbackRoot(await headers());
  // Land on the health section (expanded, #site-health) so a client who clicks
  // "Health" sees their score, not the Analytics headline over a collapsed row.
  redirect(withClientFallbackRoot(clientFallbackRoot, "/dashboard/analytics#site-health"));
}
