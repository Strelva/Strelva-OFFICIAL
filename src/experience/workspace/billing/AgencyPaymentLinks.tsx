"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StCopy, StEmpty, StMono, StNotice, StRow, StRows, StSection, StSkeleton, StState, StTextButton } from "@/components/ui/strelva/Kit";
import type { PayLinkConfig } from "@/platform/infra/pay-links";
import type { readAgencyPaymentLinks } from "./payment-links-server";

type Snapshot = Awaited<ReturnType<typeof readAgencyPaymentLinks>>;
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
const price = (link: PayLinkConfig) => link.amountCents !== undefined ? money(link.amountCents) : `${money(link.minCents ?? 0)}–${money(link.maxCents ?? 0)}`;

function confirmedLink(value: unknown, body: Record<string, unknown>, agencyId: string): value is PayLinkConfig {
  if (!value || typeof value !== "object") return false;
  const link = value as PayLinkConfig;
  if (typeof link.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(link.slug)
    || typeof link.createdAt !== "string" || !Number.isFinite(Date.parse(link.createdAt))) return false;
  if (body.action === "revoke") return link.slug === body.slug && (!link.agencyWorkspaceId || link.agencyWorkspaceId === agencyId)
    && typeof link.revokedAt === "string" && Number.isFinite(Date.parse(link.revokedAt)) && typeof link.revokedBy === "string";
  return false;
}

type ProspectPrefill = { token?: string; name: string; description: string };

export function AgencyPaymentLinks({ agencyWorkspaceId, initialProspect, request = fetch }: { agencyWorkspaceId: string; initialProspect?: ProspectPrefill; request?: typeof fetch }) {
  return <ScopedPaymentLinks key={agencyWorkspaceId} agencyWorkspaceId={agencyWorkspaceId} request={request} initialProspect={initialProspect} />;
}

function ScopedPaymentLinks({ agencyWorkspaceId, request }: { agencyWorkspaceId: string; request: typeof fetch; initialProspect?: ProspectPrefill }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const flight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const response = await request(`/api/agency/payment-links?agencyWorkspaceId=${encodeURIComponent(agencyWorkspaceId)}`, { cache: "no-store", signal });
      const value = await response.json();
      if (!response.ok || value.agency?.id !== agencyWorkspaceId || typeof value.currentActorId !== "string" || !Array.isArray(value.payLinks) || !Array.isArray(value.clients)
        || typeof value.legacyMerchant !== "boolean" || !value.checkoutAvailability || !value.paidPayments) throw new Error(value.error || "Payment links could not be read.");
      if (!signal?.aborted && mounted.current) { setSnapshot(value); setStale(false); }
    } catch (cause) {
      if (!signal?.aborted && mounted.current) { setStale(true); setError(cause instanceof Error ? cause.message : "Payment links could not be read."); }
    } finally { if (!signal?.aborted && mounted.current) setLoading(false); }
  }, [agencyWorkspaceId, request]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  async function command(body: Record<string, unknown>) {
    if (flight.current || !snapshot?.legacyMerchant || stale) return;
    const replaying = pending !== null;
    flight.current = true; setBusy(true); setError(""); setMessage(""); setPending(body);
    try {
      const response = await request("/api/agency/payment-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const value = await response.json();
      if (!mounted.current) return;
      if (!response.ok || !confirmedLink(value.payLink, body, agencyWorkspaceId)) {
        if (!replaying && [400, 409, 403, 401].includes(response.status)) setPending(null);
        throw new Error(value.error || "This request could not be confirmed. Retry the same request to check its receipt.");
      }
      setPending(null); setRevoking(null);
      setMessage("Payment link expired. New checkouts are refused; payments already started in Stripe may still complete.");
      await load();
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Request unconfirmed. Retry the same request to check its receipt."); }
    finally { flight.current = false; if (mounted.current) setBusy(false); }
  }
  async function copy(slug: string) {
    try { await navigator.clipboard.writeText(new URL(`/pay/${slug}`, window.location.origin).toString()); setMessage("Payment link copied."); }
    catch { setError("The link could not be copied. Open the payment link and copy its address."); }
  }
  const disabled = busy || loading || stale || !!pending;
  return <>
    <StTextButton onClick={() => void load()} disabled={busy || loading}>Refresh payment links</StTextButton>
    {error ? <StNotice tone="critical">{error}{stale && snapshot ? " Retained links may be out of date. Refresh before changing anything." : ""}</StNotice> : null}
    {message ? <StNotice>{message}</StNotice> : null}
    {pending ? <StNotice>This exact request is awaiting confirmation. Its terms are held.<StTextButton disabled={busy || loading || stale} onClick={() => void command(pending)}>Retry the same request</StTextButton></StNotice> : null}
    {loading && !snapshot ? <StSkeleton label="Reading payment links" /> : !snapshot ? <StEmpty>Payment links are unavailable. Confirm your agency owner or admin access, then refresh.</StEmpty> : <>
      <StNotice>Payment links · Coming soon. New payment links need your agency&apos;s Stripe Connect account. Checkout for new links is not available yet.</StNotice>
      <StTextButton href={`/workspace?workspaceId=${encodeURIComponent(agencyWorkspaceId)}&agencyView=clients`}>Open agency clients</StTextButton>
      {snapshot.legacyMerchant ? <>
      <StCopy>Existing one-time payment links remain available below. A payment link does not start a subscription.</StCopy>
      <StSection title="Payment links">
        {!snapshot.paymentStatusAvailable ? <StNotice>Payment status could not be read. Refresh to check the payment trail.</StNotice> : null}
        {!snapshot.payLinks.length ? <StEmpty>No payment links recorded yet.</StEmpty> : <StRows label="Agency payment links">{snapshot.payLinks.map(link => {
          const paid = snapshot.paidPayments[link.slug];
          return <StRow key={link.slug} title={link.clientName} detail={<>
            <StMono>{price(link)} · /pay/{link.slug}</StMono>
            <StCopy>{link.customCopy}</StCopy>
            <StCopy muted>{link.agencyWorkspaceId ? `${link.agencyDisplayName || "Agency identity not recorded"} · Runs on Strelva` : "Created before agency ownership was recorded · Actor not recorded"} · {new Date(link.createdAt).toLocaleDateString()}</StCopy>
            {link.revokedAt ? <StCopy>Expired {new Date(link.revokedAt).toLocaleString()}</StCopy> : null}
            {paid ? <StState kind="live">Paid {money(paid.amountCents)} · {new Date(paid.paidAt).toLocaleDateString()}</StState> : <StCopy>{snapshot.paymentStatusAvailable ? "No payment found in the available trail" : "Payment status unavailable"}</StCopy>}
            {!link.revokedAt ? <><StTextButton disabled={disabled} onClick={() => void copy(link.slug)}>Copy link</StTextButton><StTextButton href={`/pay/${link.slug}`}>Open payment link</StTextButton>
              {revoking === link.slug ? <StNotice>Expire this link? New checkouts will stop. Payments already started in Stripe may still complete.<StTextButton disabled={disabled} onClick={() => void command({ action: "revoke", agencyWorkspaceId, expectedActorId: snapshot.currentActorId, slug: link.slug, idempotencyKey: crypto.randomUUID() })}>Confirm expire</StTextButton><StTextButton disabled={disabled} onClick={() => setRevoking(null)}>Keep link</StTextButton></StNotice> : <StTextButton disabled={disabled} onClick={() => setRevoking(link.slug)}>Expire link</StTextButton>}
            </> : null}
          </>} />;
        })}</StRows>}
      </StSection>
      </> : null}
    </>}
  </>;
}
