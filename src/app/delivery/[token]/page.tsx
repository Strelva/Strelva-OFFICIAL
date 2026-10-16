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
async function agencyNameFor(lead: { agencyWorkspaceId?: string | null; agencyName?: string | null }): Promise<string | null> {
  const read = async (id: string) => { const brand = await resolveOwnerBrand(id); return brand.agencyId === id ? brand.name : null; };
  try {
    if (lead.agencyWorkspaceId && UUID.test(lead.agencyWorkspaceId)) return await read(lead.agencyWorkspaceId) ?? lead.agencyName ?? null;
    if (lead.agencyName) return lead.agencyName;
    const strelvaAgency = await resolveStrelvaAgencyWorkspaceId();
    return strelvaAgency ? await read(strelvaAgency) : null;
  } catch { return lead.agencyName ?? null; }
}

/** No-login status for a website request. The unguessable token is the only authority. */
export default async function DeliveryStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lead = await getDeliveryLeadByToken(token);
  if (!lead) notFound();
  return <SiteDeliveryStatus businessName={lead.businessName} agencyName={await agencyNameFor(lead)} status={lead.deliveryStatus} submittedAt={lead.submittedAt} maskedEmail={maskEmail(lead.email)} />;
}
