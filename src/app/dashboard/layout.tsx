import { redirect } from "next/navigation";
import { getAuthToken, verifyToken } from "@/lib/auth";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = await getAuthToken();
  if (!token || !(await verifyToken(token))) {
    redirect("/admin/login");
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0a0a]">
      <div className="reb-accent-line w-full shrink-0" />
      <div className="flex flex-1">
        <DashboardSidebar />
        <main className="flex-1 md:ml-0 mt-14 md:mt-0 relative">
          <div className="reb-grid-bg absolute inset-0 opacity-30 pointer-events-none" />
          <div className="relative">{children}</div>
        </main>
      </div>
    </div>
  );
}
