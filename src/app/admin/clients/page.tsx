import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/auth";
import { getAllTenants, isActiveTenant } from "@/lib/tenants";
import { getAllTenantCrm } from "@/lib/tenant-crm";
import { ClientsCrm } from "./ClientsCrm";

export const dynamic = "force-dynamic";

export default async function AdminClientsPage() {
  // Defense in depth: the admin layout already gates every /admin route on
  // super-admin, but mirror the guard here so this page never renders client
  // data for a non-admin even if the layout chain changes.
  if (!(await isSuperAdmin())) redirect("/");

  const tenants = await getAllTenants();
  const crm = await getAllTenantCrm(tenants.map((t) => t.id));

  const clients = tenants.map((t) => ({
    id: t.id,
    siteName: t.siteName,
    ownerEmail: t.ownerEmail ?? null,
    ownerName: t.ownerName ?? null,
    active: isActiveTenant(t),
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-normal text-warm-white">
          Clients
        </h1>
        <p className="text-sm text-gray-muted mt-1">
          {clients.length} client{clients.length !== 1 ? "s" : ""} — stage, tags,
          and notes for the people we manage sites for
        </p>
      </div>

      <ClientsCrm clients={clients} initialCrm={crm} />
    </div>
  );
}
