import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/auth";
import { getAllTenants, isActiveTenant } from "@/lib/tenants";
import { getAllAccounts, accountMrrCents } from "@/lib/accounts";
import { AccountsBoard, type SiteOption } from "./AccountsBoard";

export const dynamic = "force-dynamic";

/**
 * Operator ACCOUNTS surface — the org layer's home in /admin. Groups multiple
 * sites under one customer/payer + bundled subscription (e.g. Andy Anderson:
 * CoCard + Vermont Unlimited = $350/mo). Super-admin only. The Redis account
 * store backs this today (no schema gate); it migrates onto the Postgres org
 * tables when those are applied.
 */
export default async function AdminAccountsPage() {
  // Defense in depth — the /admin layout already gates super-admin, mirror it.
  if (!(await isSuperAdmin())) redirect("/");

  const [accounts, allTenants] = await Promise.all([getAllAccounts(), getAllTenants()]);
  const active = allTenants.filter(isActiveTenant);

  const sites: SiteOption[] = active.map((t) => ({
    id: t.id,
    name: t.siteName || t.id,
    domain: t.productionDomain || t.siteUrl || null,
  }));
  const siteName = new Map(sites.map((s) => [s.id, s.name]));

  const assigned = new Set(accounts.flatMap((a) => a.tenantIds));
  const unassignedSites = sites.filter((s) => !assigned.has(s.id));

  const totalMrrCents = accounts.reduce((sum, a) => sum + accountMrrCents(a), 0);
  const multiSiteCount = accounts.filter((a) => a.tenantIds.length > 1).length;

  const rows = accounts.map((a) => ({
    account: a,
    mrrCents: accountMrrCents(a),
    siteNames: a.tenantIds.map((id) => siteName.get(id) || id),
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[26px] sm:text-[30px] font-medium tracking-[-0.02em] text-warm-white">
          Accounts
        </h1>
        <p className="text-sm text-gray-muted mt-1">
          One customer, many sites. Group a multi-site owner under one account + bundled subscription.
        </p>
      </div>

      <AccountsBoard
        rows={rows}
        sites={sites}
        unassignedSites={unassignedSites}
        totalMrrCents={totalMrrCents}
        multiSiteCount={multiSiteCount}
      />
    </div>
  );
}
