import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { DashboardProvider } from "@/components/dashboard/DashboardContext";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ChatDrawer } from "@/components/dashboard/ChatDrawer";
import { BillingBanner } from "@/components/dashboard/BillingBanner";
import { CapabilityProvider } from "@/components/dashboard/CapabilityGate";
import { getTenantFromHeaders } from "@/lib/tenant";
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
    <DashboardProvider>
      <CapabilityProvider>
        <BillingBanner subscriptionStatus={subscriptionStatus} />
        <DashboardShell siteName={siteName} bookingUrl={bookingUrl}>
          {children}
        </DashboardShell>
        <ChatDrawer ownerName={ownerName} />
      </CapabilityProvider>
    </DashboardProvider>
  );
}
