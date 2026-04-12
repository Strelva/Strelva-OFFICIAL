import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { DashboardProvider } from "@/components/dashboard/DashboardContext";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ChatDrawer } from "@/components/dashboard/ChatDrawer";
import { BillingBanner } from "@/components/dashboard/BillingBanner";
import { CapabilityProvider } from "@/components/dashboard/CapabilityGate";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";
import { getContent } from "@/lib/storage";
import { getEffectiveSubscriptionStatus } from "@/lib/subscription";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const tenant = await getTenantFromHeaders();
  const tenantConfig = await getTenantConfig(tenant);
  const siteUrl = tenantConfig?.siteUrl
    || (tenantConfig?.customDomains?.[0] ? `https://${tenantConfig.customDomains[0]}` : "");
  let siteName = "Your Business";
  let ownerName = "there";
  let bookingUrl = "";
  try {
    const settings = await getContent("settings", tenant);
    siteName = settings.siteName || siteName;
    ownerName = settings.ownerName || ownerName;
    bookingUrl = settings.bookingUrl || "";
  } catch {}

  const subscriptionStatus = await getEffectiveSubscriptionStatus(tenant);

  return (
    <DashboardProvider siteUrl={siteUrl} template={tenantConfig?.template || "wellness"} autoPublish={tenantConfig?.autoPublish !== false}>
      <CapabilityProvider>
        <BillingBanner subscriptionStatus={subscriptionStatus} />
        <DashboardShell siteName={siteName} bookingUrl={bookingUrl} siteUrl={siteUrl}>
          {children}
        </DashboardShell>
        <ChatDrawer ownerName={ownerName} />
      </CapabilityProvider>
    </DashboardProvider>
  );
}
