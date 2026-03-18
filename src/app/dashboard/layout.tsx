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
    <div className="flex min-h-screen bg-zinc-950">
      <DashboardSidebar />
      <main className="flex-1 md:ml-0 mt-14 md:mt-0">{children}</main>
    </div>
  );
}
