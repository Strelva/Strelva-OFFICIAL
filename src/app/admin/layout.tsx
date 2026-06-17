import { redirect } from "next/navigation";
import Link from "next/link";
import { isSuperAdmin } from "@/lib/auth";
import { getAllTenants } from "@/lib/tenants";
import { NavLinks } from "./NavLinks";
import { CommandPalette } from "./CommandPalette";
import { CommandTrigger } from "./CommandTrigger";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAdmin = await isSuperAdmin();
  if (!isAdmin) redirect("/");

  const tenants = (await getAllTenants().catch(() => [])).map((t) => ({
    id: t.id,
    siteName: t.siteName,
  }));

  return (
    <div data-dashboard className="min-h-screen bg-surface-base text-warm-white">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[200] focus:rounded-md focus:bg-warm-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-surface-base"
      >
        Skip to content
      </a>
      {/* Top nav */}
      <nav className="border-b border-glass-border bg-surface-base/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <Link href="/admin" className="flex items-center gap-2.5 group">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ background: "oklch(73% 0.105 178)" }}
                aria-hidden
              />
              <span className="font-display text-xl tracking-tight text-warm-white leading-none">
                Strelva
              </span>
              <span className="hidden sm:inline text-[10px] font-medium uppercase tracking-[0.14em] text-gray-faint border-l border-glass-border pl-2.5">
                Mission Control
              </span>
            </Link>
            <div className="hidden md:block h-5 w-px bg-glass-border" />
            <div className="hidden md:block">
              <NavLinks />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <CommandTrigger />
            <Link
              href="/account"
              className="text-sm text-gray-faint hover:text-warm-white transition-colors"
            >
              Client dashboards →
            </Link>
          </div>
        </div>
        <div className="md:hidden border-t border-glass-border px-4 py-2 overflow-x-auto">
          <NavLinks />
        </div>
      </nav>

      {/* Content */}
      <main id="main-content" className="max-w-7xl mx-auto px-6 py-8">{children}</main>

      <CommandPalette tenants={tenants} />
    </div>
  );
}
