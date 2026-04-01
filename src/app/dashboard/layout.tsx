import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { DashboardProvider } from "@/components/dashboard/DashboardContext";
import { ChatDrawer } from "@/components/dashboard/ChatDrawer";
import { getContent } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";

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
  let ownerName = "there";
  try {
    const settings = await getContent("settings", tenant);
    ownerName = settings.ownerName || ownerName;
  } catch {}

  return (
    <DashboardProvider>
      {children}
      <ChatDrawer ownerName={ownerName} />
    </DashboardProvider>
  );
}
