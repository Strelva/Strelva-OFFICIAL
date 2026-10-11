import { notFound, redirect } from "next/navigation";
import { requireTenantAccess } from "@/platform/infra/auth";
import { isTenantId } from "@/lib/scaffold-contracts";
import { getTenantConfig } from "@/lib/tenants";
import { inquiryReleaseMayBeOn, inquiryReleasedForCurrentUser } from "@/products/inquiries/server";
import { InquiryServerExperience } from "@/experience/inquiries/InquiryServerExperience";
import { inquiryRecordsEnabled } from "@/platform/infra/inquiry-records";
import { ownerEntryPossible } from "@/platform/owner-entry/env";
import { ownerEntryForTenant } from "@/platform/owner-entry/server";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { createSupabaseSystemStore, listBusinessSystems } from "@/platform/systems";
import { systemsReleasedFor } from "@/platform/systems-release";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Your business · Strelva",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

export default async function BusinessPage({ params }: { params: Promise<{ tenant: string }> }) {
  if (!inquiryReleaseMayBeOn()) notFound();
  const { tenant } = await params;
  if (!isTenantId(tenant)) notFound();
  const denied = await requireTenantAccess(tenant);
  if (denied?.status === 401) redirect(`/sign-in?next=${encodeURIComponent(`/business/${tenant}`)}`);
  if (denied) notFound();
  if (!(await inquiryReleasedForCurrentUser(tenant))) notFound();
  const business = await getTenantConfig(tenant);
  if (!business || !business.active) notFound();
  if (inquiryRecordsEnabled() && ownerEntryPossible()) {
    const entry = await ownerEntryForTenant(tenant);
    if (entry.kind === "workspace" && !entry.operator) {
      const home = `/workspace?workspaceId=${encodeURIComponent(entry.workspaceId)}`;
      const actor = await workspaceHttpActor();
      if (actor && await systemsReleasedFor(actor, entry.workspaceId)) {
        const systems = await listBusinessSystems(actor, entry.workspaceId, { store: createSupabaseSystemStore() }).catch(() => null);
        const system = systems?.systems.find(item => item.system.kind === "inquiry" && item.references.tenantStableId === entry.tenantStableId);
        if (system) redirect(`${home}&view=system&system=${encodeURIComponent(system.system.id)}`);
      }
      redirect(home);
    }
  }
  // Private state is loaded by the API, which repeats authorization per read/write.
  return <InquiryServerExperience tenantId={tenant} />;
}
