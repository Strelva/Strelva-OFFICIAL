import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OwnerClaimAcceptance } from "@/experience/workspace/agency/OwnerClaimAcceptance";
import { agencyAddClientReleaseEnabled } from "@/products/agency-clients";

export const metadata: Metadata = { title: "Your business on Strelva", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** The owner claim link an agency delivers (#259). Public shell; the link alone grants nothing. */
export default async function OwnerClaimPage({ params }: { params: Promise<{ token: string }> }) {
  if (!agencyAddClientReleaseEnabled()) notFound();
  return <OwnerClaimAcceptance token={(await params).token} />;
}
