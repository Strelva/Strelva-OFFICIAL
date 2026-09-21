import { notFound, redirect } from "next/navigation";
import { requireTenantAccess } from "@/lib/auth";
import { isTenantId } from "@/lib/scaffold-contracts";
import { getTenantConfig } from "@/lib/tenants";
import { inquiryReleaseEnabled } from "@/products/inquiries/server";
import { InquiryServerExperience } from "@/experience/inquiries/InquiryServerExperience";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Your business · Strelva",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

export default async function BusinessPage({ params }: { params: Promise<{ tenant: string }> }) {
  if (!inquiryReleaseEnabled()) notFound();
  const { tenant } = await params;
  if (!isTenantId(tenant)) notFound();
  const denied = await requireTenantAccess(tenant);
  if (denied?.status === 401) redirect(`/sign-in?next=${encodeURIComponent(`/business/${tenant}`)}`);
  if (denied) notFound();
  const business = await getTenantConfig(tenant);
  if (!business || !business.active) notFound();
  // Private state is loaded by the API, which repeats authorization per read/write.
  return <InquiryServerExperience tenantId={tenant} />;
}
