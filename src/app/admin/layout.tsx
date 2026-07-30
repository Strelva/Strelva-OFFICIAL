import { redirect } from "next/navigation";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { getAllTenants } from "@/lib/tenants";
import { AdminRail } from "./AdminRail";
import { AdminMobileNav } from "./AdminMobileNav";
import { CommandPalette } from "./CommandPalette";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAdmin = await isSuperAdmin();
  // Redirect to /sign-in rather than "/" so that a non-super-admin who reaches
  // this layout directly (e.g. via a stale link on the bare admin host) does not
  // trigger an infinite loop. On the bare admin host, "/" is rewritten to /admin
  // by the proxy, which would immediately re-enter this layout. /sign-in is an
  // exempt path that passes through the rewrite, so it terminates the redirect.
  if (!isAdmin) redirect("/sign-in");

  const [allTenants, actor] = await Promise.all([
    getAllTenants().catch(() => []),
    getActorContext().catch(() => ({ name: null } as { name: string | null })),
  ]);
  const tenants = allTenants.map((t) => ({ id: t.id, siteName: t.siteName }));
  const activeClients = allTenants.filter((t) => t.active !== false).length;
  const operatorName = actor.name?.split(" ")[0] || "Operator";

  return (
    <div data-dashboard className="min-h-screen bg-surface-base text-warm-white">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[200] focus:rounded-md focus:bg-warm-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-surface-base"
      >
        Skip to content
      </a>

      <AdminMobileNav operatorName={operatorName} badges={{ clients: activeClients }} />

      <div className="md:grid md:grid-cols-[236px_1fr]">
        <div className="hidden md:block">
          <AdminRail operatorName={operatorName} badges={{ clients: activeClients }} />
        </div>
        <main id="main-content" className="min-h-screen px-5 py-6 md:px-8 md:py-7">
          {children}
        </main>
      </div>

      <CommandPalette tenants={tenants} />
    </div>
  );
}
