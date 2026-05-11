import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";

export default async function DashboardContentRedirect() {
  const clientFallbackRoot = getClientFallbackRoot(await headers());
  redirect(withClientFallbackRoot(clientFallbackRoot, "/dashboard/site"));
}
