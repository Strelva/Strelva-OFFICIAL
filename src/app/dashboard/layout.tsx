import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { DashboardProvider } from "@/components/dashboard/DashboardContext";
import { BillingBanner } from "@/components/dashboard/BillingBanner";
import { CapabilityProvider } from "@/components/dashboard/CapabilityGate";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";
import { getContent } from "@/lib/storage";
import { getEffectiveSubscriptionStatus } from "@/lib/subscription";
import { hasTenantAccess } from "@/lib/auth";
import { listThreads } from "@/lib/threads";
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
  const siteUrl = tenantConfig?.siteUrl
    || (tenantConfig?.customDomains?.[0] ? `https://${tenantConfig.customDomains[0]}` : "");
  let siteName = "Your Business";
  let ownerName = "";
  try {
    const settings = await getContent("settings", tenant);
    siteName = settings.siteName || siteName;
    ownerName = settings.ownerName || ownerName;
  } catch {}

  const subscriptionStatus = await getEffectiveSubscriptionStatus(tenant);

  // Fetch threads for the history sidebar
  const threads = await listThreads(tenant);
  const threadSummaries = threads.map((t) => ({
    id: t.id,
    title: t.title,
    preview: t.messages[t.messages.length - 1]?.content.slice(0, 60) || "",
    updatedAt: new Date(t.updatedAt).getTime(),
  }));

  return (
    <DashboardProvider siteUrl={siteUrl} template={tenantConfig?.template || "wellness"} autoPublish={tenantConfig?.autoPublish !== false}>
      <CapabilityProvider>
        <BillingBanner subscriptionStatus={subscriptionStatus} />
        <ConversationLayoutClient
          threads={threadSummaries}
          ownerName={ownerName || siteName}
        >
          {children}
        </ConversationLayoutClient>
      </CapabilityProvider>
    </DashboardProvider>
  );
}
