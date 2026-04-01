import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { DashboardProvider } from "@/components/dashboard/DashboardContext";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
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
  try {
    const settings = await getContent("settings", tenant);
    siteName = settings.siteName || siteName;
  } catch {}

  return (
    <DashboardProvider>
      <DashboardShell siteName={siteName}>
        {children}
      </DashboardShell>
    </DashboardProvider>
  );
}
