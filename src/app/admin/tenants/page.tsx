import Link from "next/link";
import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/auth";
import { getAllTenants, isActiveTenant } from "@/lib/tenants";
import { getTenantDeliveryModel } from "@/lib/custom-repos";

export const dynamic = "force-dynamic";

export default async function AdminTenantsPage() {
  // Defense in depth: the admin layout already gates every /admin route on
  // super-admin, but mirror the guard here so this page never renders tenant
  // data for a non-admin even if the layout chain changes.
  if (!(await isSuperAdmin())) redirect("/");

  const tenants = await getAllTenants();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-normal text-warm-white">Tenants</h1>
        <p className="text-sm text-gray-muted mt-1">
          {tenants.length} tenant{tenants.length !== 1 ? "s" : ""} across the
          platform
        </p>
      </div>

      {tenants.length === 0 ? (
        <div className="rounded-xl bg-glass border border-glass-border p-10 text-center">
          <p className="text-sm font-medium text-warm-white">No tenants yet</p>
          <p className="mt-1 text-xs text-gray-muted">
            Add your first client from the{" "}
            <Link href="/admin" className="text-accent hover:underline">
              Overview
            </Link>{" "}
            or the{" "}
            <Link href="/admin/onboard" className="text-accent hover:underline">
              guided onboarding
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-glass border border-glass-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-glass-border text-gray-muted text-left">
                  <th className="px-6 py-3 font-medium">Tenant</th>
                  <th className="px-6 py-3 font-medium">ID</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Delivery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-glass-border/50">
                {tenants.map((t) => {
                  const active = isActiveTenant(t);
                  const deliveryModel = getTenantDeliveryModel(t);
                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-gray-bg transition-colors"
                    >
                      <td className="px-6 py-4">
                        <Link
                          href={`/admin/tenants/${t.id}`}
                          className="font-medium text-warm-white hover:text-accent transition-colors"
                        >
                          {t.siteName}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs text-gray-muted">
                          {t.id}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-2 text-xs text-gray-muted">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              active ? "bg-emerald-400" : "bg-gray-faint"
                            }`}
                          />
                          {active ? "Active" : "Archived"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-muted">
                        {deliveryModel === "custom_repo"
                          ? "Custom repo"
                          : "Template"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
