import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { ToastProvider } from "@/components/admin/Toast";

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex min-h-screen" style={{ background: "var(--cream)", fontFamily: "var(--font-body), system-ui, sans-serif" }}>
        <AdminSidebar />
        <main className="flex-1 p-4 pt-18 md:p-8 max-w-4xl">{children}</main>
      </div>
    </ToastProvider>
  );
}
