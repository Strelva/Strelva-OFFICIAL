import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { DashboardProvider } from "@/components/dashboard/DashboardContext";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ChatDrawer } from "@/components/dashboard/ChatDrawer";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getContent } from "@/lib/storage";

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
  try {
    const settings = await getContent("settings", tenant);
    siteName = settings.siteName || siteName;
    ownerName = settings.ownerName || ownerName;
  } catch {}

  return (
    <DashboardProvider>
      <DashboardShell siteName={siteName}>
        {children}
      </DashboardShell>
      <ChatDrawer ownerName={ownerName} />
    </DashboardProvider>
  );
}
