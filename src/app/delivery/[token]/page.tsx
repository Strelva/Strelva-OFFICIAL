import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteDeliveryStatus } from "@/experience/operations/SiteDeliveryStatus";
import { getDeliveryLeadByToken, maskEmail } from "@/lib/access-request-delivery";
import { resolveOwnerBrand } from "@/platform/agency-brand/server";
import { resolveStrelvaAgencyWorkspaceId } from "@/platform/system-versions/supabase-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Website request",
  description: "Where a website request is. Runs on Strelva.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The agency's name as it is now: the lead's own agency by a live brand read,
 * then the name the intake recorded, then (for historical leads taken before
 * leads named an agency, which were all Strelva Agency's own intake) Strelva
 * Agency's workspace, read like any other agency. Unknown stays null: the page
 * shows a neutral frame rather than guessing.
 */
async function agencyFor(lead: { agencyWorkspaceId?: string | null; agencyName?: string | null }): Promise<{ name: string | null; email: string | null }> {
  const read = async (id: string) => { const brand = await resolveOwnerBrand(id); return brand.agencyId === id ? { name: brand.name, email: brand.replyTo } : null; };
  const recorded = { name: lead.agencyName ?? null, email: null };
  try {
    if (lead.agencyWorkspaceId && UUID.test(lead.agencyWorkspaceId)) return await read(lead.agencyWorkspaceId) ?? recorded;
    if (lead.agencyName) return recorded;
    const strelvaAgency = await resolveStrelvaAgencyWorkspaceId();
    return (strelvaAgency ? await read(strelvaAgency) : null) ?? { name: null, email: null };
  } catch { return recorded; }
}

/** No-login status for a website request. The unguessable token is the only authority. */
export default async function DeliveryStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lead = await getDeliveryLeadByToken(token);
  if (!lead) notFound();
  const agency = await agencyFor(lead);
  return <SiteDeliveryStatus businessName={lead.businessName} agencyName={agency.name} agencyEmail={agency.email} draftUrl={lead.draftUrl} status={lead.deliveryStatus} submittedAt={lead.submittedAt} updatedAt={lead.statusUpdatedAt} maskedEmail={maskEmail(lead.email)} />;
}
