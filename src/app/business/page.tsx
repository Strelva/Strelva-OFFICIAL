import { notFound, redirect } from "next/navigation";
import { getAuthUserId, getCurrentUserTenants, requireTenantAccess } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import { inquiryReleaseEnabled } from "@/products/inquiries/server";
import { BusinessPicker } from "@/experience/inquiries/BusinessPicker";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your businesses · Strelva", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function BusinessesPage() {
  if (!inquiryReleaseEnabled()) notFound();
  if (!await getAuthUserId()) redirect("/sign-in?next=%2Fbusiness");
  const ids = await getCurrentUserTenants();
  const results = await Promise.all(ids.map(async (id) => {
    if (await requireTenantAccess(id)) return null;
    const config = await getTenantConfig(id);
    return config?.active ? { id, name: config.siteName } : null;
  }));
  const businesses = results.filter((item): item is { id: string; name: string } => item !== null);
  if (businesses.length === 1) redirect(`/business/${encodeURIComponent(businesses[0]!.id)}`);
  return <BusinessPicker businesses={businesses} />;
}
