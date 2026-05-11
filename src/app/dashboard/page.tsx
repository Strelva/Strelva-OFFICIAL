import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTenantFromHeaders } from "@/lib/tenant";
import { hasTenantAccess } from "@/lib/auth";
import { getClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";

export default async function DashboardPage() {
  const requestHeaders = await headers();
  const clientFallbackRoot = getClientFallbackRoot(requestHeaders);
  const tenant = await getTenantFromHeaders();
  const hasAccess = await hasTenantAccess(tenant);

  if (!hasAccess) {
    redirect(withClientFallbackRoot(clientFallbackRoot, "/no-access"));
  }

  redirect(withClientFallbackRoot(clientFallbackRoot, "/dashboard/chat"));
}
