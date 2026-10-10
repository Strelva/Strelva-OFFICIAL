import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { redirect } from "next/navigation";
import { isSuperAdmin, getActorContext } from "@/platform/infra/auth";
import { getAllTenants } from "@/lib/tenants";
import { OperatorFrame } from "@/experience/operations/OperatorFrame";
import { CommandPalette } from "./CommandPalette";

// Operator identity and durable read admission are evaluated for each request.
export const dynamic = "force-dynamic";

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
  const moneyEnabled = workspaceReleaseEnabled() && process.env.STRELVA_REVENUE_SPLITS === "1";
  const operatorName = actor.name?.split(" ")[0] || "Operator";

  return <OperatorFrame operatorName={operatorName} moneyEnabled={moneyEnabled} clients={tenants}>
    {children}
    <CommandPalette tenants={tenants} />
  </OperatorFrame>;
}
