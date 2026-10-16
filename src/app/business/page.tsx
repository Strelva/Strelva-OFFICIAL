import { notFound, redirect } from "next/navigation";
import { getAuthUserId, getCurrentUserTenants, requireTenantAccess } from "@/platform/infra/auth";
import { getTenantConfig } from "@/lib/tenants";
import { inquiryReleaseMayBeOn, inquiryReleasedForCurrentUser } from "@/products/inquiries/server";
import { BusinessPicker, type BusinessPickerItem } from "@/experience/inquiries/BusinessPicker";
import { identityColor } from "@/platform/presentation/identity-color";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your businesses · Strelva", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function BusinessesPage() {
  if (!inquiryReleaseMayBeOn()) notFound();
  if (!await getAuthUserId()) redirect("/sign-in?next=%2Fbusiness");
  const ids = await getCurrentUserTenants();
  const results = await Promise.all(ids.map(async (id) => {
    if (await requireTenantAccess(id)) return null;
    if (!(await inquiryReleasedForCurrentUser(id))) return null;
    const config = await getTenantConfig(id);
    if (!config?.active) return null;
    // One fact that tells businesses apart: who runs it and its site.
    const detail = [config.ownerName ? `Run by ${config.ownerName}` : "", config.productionDomain ?? ""].filter(Boolean).join(" · ");
    const item: BusinessPickerItem = { id, name: config.siteName, color: identityColor(id), ...(detail ? { detail } : {}) };
    return item;
  }));
  const businesses = results.filter((item): item is BusinessPickerItem => item !== null);
  if (businesses.length === 1) redirect(`/business/${encodeURIComponent(businesses[0]!.id)}`);
  return <BusinessPicker businesses={businesses} />;
}
