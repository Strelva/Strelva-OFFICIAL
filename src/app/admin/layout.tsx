import { redirect } from "next/navigation";
import Link from "next/link";
import { isSuperAdmin } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAdmin = await isSuperAdmin();
  if (!isAdmin) redirect("/");

  return (
    <div data-dashboard className="min-h-screen bg-surface-base text-warm-white">
      {/* Top nav */}
      <nav className="border-b border-glass-border bg-surface-base/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold tracking-wide text-warm-white">
              Mission Control
            </span>
            <div className="flex items-center gap-4 text-sm text-gray-muted">
              <Link href="/admin" className="hover:text-warm-white transition-colors">
                Overview
              </Link>
              <Link href="/admin/pay-links" className="hover:text-warm-white transition-colors">
                Pay Links
              </Link>
              <Link href="/admin/ops" className="hover:text-warm-white transition-colors">
                Ops
              </Link>
              <Link href="/admin/drafts" className="hover:text-warm-white transition-colors">
                Drafts
              </Link>
            </div>
          </div>
          <Link
            href="/account"
            className="text-sm text-gray-faint hover:text-gray-muted transition-colors"
          >
            Client dashboards
          </Link>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
