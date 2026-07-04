import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/auth";
import { getAllTenants, isActiveTenant } from "@/lib/tenants";
import { getAllTenantCrm } from "@/lib/tenant-crm";
import { getActivity } from "@/lib/storage";
import { getAtRiskTenants, type AtRiskSignal } from "@/lib/churn";
import { getEffectiveSubscriptionStatus } from "@/lib/subscription";
import { ClientsCrm } from "./ClientsCrm";

export const dynamic = "force-dynamic";

export default async function AdminClientsPage() {
  // Defense in depth: the admin layout already gates every /admin route on
  // super-admin, but mirror the guard here so this page never renders client
  // data for a non-admin even if the layout chain changes.
  if (!(await isSuperAdmin())) redirect("/");

  const tenants = await getAllTenants();

  // Enrichment signals fetched once, server-side, alongside the CRM records.
  // atRisk is the same verdict the "Needs you" overview reads (getAtRiskTenants);
  // last activity + subscription reuse the exact signals src/app/admin/page.tsx
  // uses per tenant (activity[0]?.time, getEffectiveSubscriptionStatus).
  const [crm, atRiskSignals, signals] = await Promise.all([
    getAllTenantCrm(tenants.map((t) => t.id)),
    getAtRiskTenants().catch((): AtRiskSignal[] => []),
    Promise.all(
      tenants.map(async (t) => ({
        id: t.id,
        lastActivity: (await getActivity(t.id).catch(() => []))[0]?.time ?? null,
        subscriptionStatus: await getEffectiveSubscriptionStatus(t.id).catch(
          () => t.subscriptionStatus ?? "none"
        ),
      }))
    ),
  ]);

  const atRiskById = new Map(atRiskSignals.map((s) => [s.tenantId, s]));
  const signalById = new Map(signals.map((s) => [s.id, s]));

  const clients = tenants.map((t) => {
    const signal = signalById.get(t.id);
    const atRisk = atRiskById.get(t.id);
    return {
      id: t.id,
      siteName: t.siteName,
      ownerEmail: t.ownerEmail ?? null,
      ownerName: t.ownerName ?? null,
      active: isActiveTenant(t),
      lastActivity: signal?.lastActivity ?? null,
      subscriptionStatus: signal?.subscriptionStatus ?? null,
      atRiskReason: atRisk?.reasons[0] ?? null,
    };
  });

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
