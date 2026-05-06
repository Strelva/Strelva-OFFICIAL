import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { DashboardProvider } from "@/components/dashboard/DashboardContext";
import { BillingBanner } from "@/components/dashboard/BillingBanner";
import { CapabilityProvider } from "@/components/dashboard/CapabilityGate";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";
import { getActivity, getClickCounts, getContent } from "@/lib/storage";
import { getEffectiveSubscriptionStatus } from "@/lib/subscription";
import { hasTenantAccess } from "@/lib/auth";
import { getQueueCount } from "@/lib/events";
import { getTenantPublicUrl } from "@/lib/tenant-urls";
import { ConversationLayoutClient } from "./ConversationLayoutClient";

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

  const hasAccess = await hasTenantAccess(tenant);
  if (!hasAccess) {
    redirect("/no-access");
  }
  const tenantConfig = await getTenantConfig(tenant);
  const siteUrl = tenantConfig ? getTenantPublicUrl(tenantConfig) : "";
  let siteName = "Your Business";
  let ownerName = "";
  try {
    const settings = await getContent("settings", tenant);
    siteName = settings.siteName || siteName;
    ownerName = settings.ownerName || ownerName;
  } catch {}

  const subscriptionStatus = await getEffectiveSubscriptionStatus(tenant);

  // Fetch queue count and stats
  const [pendingCount, pageViews, activity] = await Promise.all([
    getQueueCount(tenant),
    getClickCounts("page-view", tenant),
    getActivity(tenant, { actor: "ai" }),
  ]);
  const monthAgo = Date.now() - 30 * 86_400_000;
  const aiUpdatesThisMonth = activity.filter((entry) => new Date(entry.time).getTime() >= monthAgo).length;
  const valueProof = pageViews.thisWeek > 0
    ? `${pageViews.thisWeek} visitors this week`
    : `${aiUpdatesThisMonth} AI updates this month`;

  return (
    <DashboardProvider
      tenantId={tenant}
      siteUrl={siteUrl}
      template={tenantConfig?.template || "wellness"}
      autoPublish={tenantConfig?.autoPublish !== false}
      subscriptionStatus={subscriptionStatus}
      hasStripeCustomer={!!tenantConfig?.stripeCustomerId}
    >
      <CapabilityProvider>
        <BillingBanner subscriptionStatus={subscriptionStatus} />
        <ConversationLayoutClient
          ownerName={ownerName || siteName}
          pendingCount={pendingCount}
          valueProof={valueProof}
        >
          {children}
        </ConversationLayoutClient>
      </CapabilityProvider>
    </DashboardProvider>
  );
}
