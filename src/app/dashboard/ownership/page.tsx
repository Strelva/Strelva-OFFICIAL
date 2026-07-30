import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";

export default async function OwnershipPage() {
  const clientFallbackRoot = getClientFallbackRoot(await headers());
  redirect(withClientFallbackRoot(clientFallbackRoot, "/dashboard/settings#ownership"));
}
