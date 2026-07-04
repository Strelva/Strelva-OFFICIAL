import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";

// Site health folded into the merged Analytics surface (collapsible section under
// the weekly report). Kept as an alias so old deep links still land.
export default async function HealthRedirect() {
  const clientFallbackRoot = getClientFallbackRoot(await headers());
  redirect(withClientFallbackRoot(clientFallbackRoot, "/dashboard/analytics"));
}
