"use client";

import { useCallback, useEffect, useState } from "react";
import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { StEmpty, StHead, StMono, StNotice, StPage, StRow, StRows, StSection, StSkeleton, StState, StTextButton } from "@/components/ui/strelva/Kit";

export interface PaidPayment { amountCents: number; customerEmail?: string; paidAt: string }
export interface PayLink {
  slug: string; clientName: string; door?: string; tenantId?: string; leadSlug?: string;
  amountCents?: number; minCents?: number; maxCents?: number; customCopy?: string; returnUrl?: string;
  createdAt?: string; createdBy?: string; revokedAt?: string; agencyDisplayName?: string; agencyWorkspaceId?: string;
}
const dollars = (cents: number) => "$" + Math.round(cents / 100).toLocaleString();

/** Support inspects existing links. Agency sales require ordinary agency access. */
export function PayLinksView({ request = fetch, initialLinks, initialPayments = {}, preview = false }: {
  request?: typeof fetch; initialLinks?: PayLink[]; initialPayments?: Record<string, PaidPayment>; preview?: boolean;
}) {
  const [links, setLinks] = useState<PayLink[]>(initialLinks ?? []);
  const [payments, setPayments] = useState(initialPayments);
  const [paymentStatusAvailable, setPaymentStatusAvailable] = useState(true);
  const [loading, setLoading] = useState(initialLinks === undefined);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await request("/api/admin/pay-links", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.payLinks)) throw new Error(body.error || "Payment links could not be read.");
      setLinks(body.payLinks); setPayments(body.paidPayments ?? {}); setPaymentStatusAvailable(body.paymentStatusAvailable !== false);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Payment links could not be read."); }
    finally { setLoading(false); }
  }, [request]);
  useEffect(() => { if (!preview && initialLinks === undefined) void load(); }, [initialLinks, load, preview]);
  return <StPage>
    <StHead title={OPERATOR_DESTINATIONS.payLinks.label} meta="Read-only support records for existing service payment links." />
    <StNotice>Payment links are created and revoked by the agency in its workspace. Platform support reads existing records here.</StNotice>
    <StTextButton href="/admin/actions">Open ordinary agency access</StTextButton>
    {!preview && <StTextButton onClick={() => void load()} disabled={loading}>Refresh payment links</StTextButton>}
    {error && <StNotice tone="critical">{error} Retained rows may be out of date.</StNotice>}
    {!paymentStatusAvailable && <StNotice>Payment status could not be read. Refresh to check the payment trail.</StNotice>}
    <StSection title="Existing payment links" meta={loading ? undefined : <StMono>{links.length}</StMono>}>
      {loading ? <StSkeleton label="Reading payment links" /> : !links.length ? <StEmpty>{error ? "Payment link availability is unknown." : "No payment links recorded."}</StEmpty> : <StRows label="Existing payment links">{links.map(link => {
        const paid = payments[link.slug];
        return <StRow key={link.slug} title={link.clientName} detail={<>
          <StMono>/pay/{link.slug}{typeof link.amountCents === "number" ? " · " + dollars(link.amountCents) : typeof link.minCents === "number" && typeof link.maxCents === "number" ? " · " + dollars(link.minCents) + "–" + dollars(link.maxCents) : ""}</StMono>
          <br />Recorded creator: {link.agencyWorkspaceId ? link.agencyDisplayName || "Actor not recorded" : "Actor not recorded"}
          {link.revokedAt && <><br />Expired {new Date(link.revokedAt).toLocaleDateString()}</>}
          {link.tenantId && <><br /><StTextButton href={"/admin/clients/" + link.tenantId}>Open site support record</StTextButton></>}
          {paid && <><br /><StState kind="live">Paid {dollars(paid.amountCents)}</StState>{paid.customerEmail && " · " + paid.customerEmail}</>}
        </>} />;
      })}</StRows>}
    </StSection>
  </StPage>;
}
