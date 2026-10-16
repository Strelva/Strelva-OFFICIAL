import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteDeliveryStatus } from "@/experience/operations/SiteDeliveryStatus";
import { getDeliveryLeadByToken, maskEmail } from "@/lib/access-request-delivery";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Website request | Strelva Agency",
  description: "Where a Strelva Agency website request is. Runs on Strelva.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** No-login status for a website request. The unguessable token is the only authority. */
export default async function DeliveryStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lead = await getDeliveryLeadByToken(token);
  if (!lead) notFound();
  return <SiteDeliveryStatus businessName={lead.businessName} status={lead.deliveryStatus} submittedAt={lead.submittedAt} maskedEmail={maskEmail(lead.email)} />;
}
