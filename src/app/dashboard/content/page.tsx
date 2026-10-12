import { getTenantFromHeaders } from "@/lib/tenant";
import { redirectIfDashboardPageMoved } from "@/platform/owner-entry/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";

export default async function DashboardContentRedirect() {
  await redirectIfDashboardPageMoved(await getTenantFromHeaders(), "/content");

  const clientFallbackRoot = getClientFallbackRoot(await headers());
  redirect(withClientFallbackRoot(clientFallbackRoot, "/dashboard/site"));
}
