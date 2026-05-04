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
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top nav */}
      <nav className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold tracking-wide text-white">
              Scaffold Web Admin
            </span>
            <div className="flex items-center gap-4 text-sm text-zinc-400">
              <Link href="/admin" className="hover:text-white transition-colors">
                Overview
              </Link>
              <Link href="/admin/drafts" className="hover:text-white transition-colors">
                Drafts
              </Link>
            </div>
          </div>
          <Link
            href="/account"
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
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
