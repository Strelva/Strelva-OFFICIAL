"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StCopy, StEmpty, StField, StMono, StNotice, StPill, StRow, StRows, StSection, StSkeleton, StState, StTextButton, StTextField } from "@/components/ui/strelva/Kit";
import type { PayLinkConfig } from "@/platform/infra/pay-links";
import type { readAgencyPaymentLinks } from "./payment-links-server";
import { AgencyCheckoutStatus } from "./AgencyCheckoutStatus";

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
  return link.agencyWorkspaceId === agencyId && typeof link.agencyDisplayName === "string" && !!link.agencyDisplayName.trim()
    && link.createdBy === body.expectedActorId && typeof link.clientName === "string" && !!link.clientName.trim()
    && link.door === "build" && link.customCopy === String(body.description).trim() && link.businessWorkspaceId === body.businessWorkspaceId
    && (body.slug === undefined || link.slug === body.slug)
    && link.amountCents === body.amountCents && link.minCents === body.minCents && link.maxCents === body.maxCents;
}

export function AgencyPaymentLinks({ agencyWorkspaceId, request = fetch }: { agencyWorkspaceId: string; request?: typeof fetch }) {
  return <ScopedPaymentLinks key={agencyWorkspaceId} agencyWorkspaceId={agencyWorkspaceId} request={request} />;
}

function ScopedPaymentLinks({ agencyWorkspaceId, request }: { agencyWorkspaceId: string; request: typeof fetch }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [client, setClient] = useState("");
  const [range, setRange] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const flight = useRef(false);
  const form = useRef<HTMLFormElement>(null);
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
      if (body.action === "create") form.current?.reset();
      setMessage(body.action === "create" ? value.payLink.revokedAt ? "This payment link is already expired." : "Payment link saved." : "Payment link expired. New checkouts are refused; payments already started in Stripe may still complete.");
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
    {loading && !snapshot ? <StSkeleton label="Reading payment links" /> : !snapshot ? <StEmpty>Payment links are unavailable. Confirm your agency owner or admin access, then refresh.</StEmpty> : !snapshot.legacyMerchant ? <>
      <AgencyCheckoutStatus availability={snapshot.checkoutAvailability} paymentsHref={`/workspace/payments?workspaceId=${encodeURIComponent(agencyWorkspaceId)}`} />
      <StCopy>Client payment agreements use your agency&apos;s Stripe merchant account. Prepare a one-off agreement from the client&apos;s billing controls.</StCopy>
      <StTextButton href={`/workspace?workspaceId=${encodeURIComponent(agencyWorkspaceId)}&agencyView=clients`}>Open agency clients</StTextButton>
    </> : <>
      <StNotice>{snapshot.agency.name} is the merchant for these one-time payments. A payment link does not start a subscription.</StNotice>
      <StSection title="Create a payment link">
        <form className="grid gap-4" ref={form} onSubmit={event => {
          event.preventDefault(); if (disabled) return;
          const values = new FormData(event.currentTarget);
          const clientName = snapshot.clients.find(item => item.customerWorkspaceId === client)?.name || String(values.get("clientName") || "");
          void command({ action: "create", agencyWorkspaceId, expectedActorId: snapshot.currentActorId, idempotencyKey: crypto.randomUUID(), clientName,
            ...(client ? { businessWorkspaceId: client } : {}), ...(values.get("slug") ? { slug: values.get("slug") } : {}),
            description: values.get("description"), ...(range ? { minCents: Number(values.get("min")) * 100, maxCents: Number(values.get("max")) * 100 } : { amountCents: Number(values.get("amount")) * 100 }),
          });
        }}>
          <StField label="Client"><select name="client" value={client} disabled={disabled} onChange={event => setClient(event.target.value)}><option value="">Named prospect</option>{snapshot.clients.map(item => <option key={item.customerWorkspaceId} value={item.customerWorkspaceId}>{item.name}</option>)}</select></StField>
          {!client ? <StTextField label="Prospect name" name="clientName" required maxLength={160} disabled={disabled} /> : null}
          <StTextField label="What this payment covers" name="description" required maxLength={1000} disabled={disabled} />
          <StField label="Amount choice" hint="USD · $50 to $10,000 · $50 steps"><select value={range ? "range" : "fixed"} disabled={disabled} onChange={event => setRange(event.target.value === "range")}><option value="fixed">Fixed amount</option><option value="range">Client chooses within a range</option></select></StField>
          {range ? <><StTextField label="Minimum (USD)" name="min" type="number" min={50} max={10000} step={50} required disabled={disabled} /><StTextField label="Maximum (USD)" name="max" type="number" min={50} max={10000} step={50} required disabled={disabled} /></> : <StTextField label="Amount (USD)" name="amount" type="number" min={50} max={10000} step={50} required disabled={disabled} />}
          <StTextField label="Payment address (optional)" name="slug" maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*" description="Generated if left empty. Use lowercase letters, numbers and hyphens." disabled={disabled} />
          <StPill type="submit" disabled={disabled}>Create payment link</StPill>
        </form>
      </StSection>
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
    </>}
  </>;
}
