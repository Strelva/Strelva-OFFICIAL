import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StEntry, StHead, StNotice } from "@/components/ui/strelva/Kit";
import { resolveOwnerBrand } from "@/platform/agency-brand/server";
import { issueAgencyPayLinkReceipt } from "@/platform/agency-pay-links";
import { resolvePublicPayLink } from "@/platform/agency-pay-links/public";
import { MoneyDocument } from "@/experience/workspace/billing/MoneyDocument";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** The payer's Payment receipt. Numbered once the payment is confirmed, never emailed. */
export default async function PayLinkReceiptPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const resolved = await resolvePublicPayLink(slug);
  if (resolved?.kind !== "connected") notFound();
  const { link } = resolved;
  const brand = await resolveOwnerBrand(link.agencyWorkspaceId ?? "");
  if (link.status !== "paid") return <StEntry brand={brand}><StHead title="Payment receipt" /><StNotice>No payment is recorded for this link yet.</StNotice></StEntry>;
  const doc = await issueAgencyPayLinkReceipt(link.id);
  return <StEntry brand={brand}><MoneyDocument doc={doc} back={{ label: "Back to the payment link", href: `/pay/${link.slug}` }} /></StEntry>;
}
