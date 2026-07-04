import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";

// Reports folded into the merged Analytics surface (verdict → full weekly report →
// site health, one scroll). Kept as an alias so old deep links + weekly-report
// emails that point at /dashboard/reports still land.
export default async function ReportsRedirect() {
  const clientFallbackRoot = getClientFallbackRoot(await headers());
  redirect(withClientFallbackRoot(clientFallbackRoot, "/dashboard/analytics"));
}
