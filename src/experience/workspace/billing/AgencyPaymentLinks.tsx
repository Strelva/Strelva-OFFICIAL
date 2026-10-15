"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SelectInput, TextArea, TextInput } from "@/components/ui/TextInput";
import { StCopy, StEmpty, StMono, StNotice, StPill, StRow, StRows, StSection, StSkeleton, StState, StTextButton } from "@/components/ui/strelva/Kit";
import { formatDocumentNumber, type AgencyPayLink } from "@/platform/agency-pay-links/types";
import { AgencyMerchantSetup } from "./AgencyMerchantSetup";
import type { PayLinkConfig } from "@/platform/infra/pay-links";
import type { readAgencyPaymentLinks } from "./payment-links-server";

type Snapshot = Awaited<ReturnType<typeof readAgencyPaymentLinks>>;
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
const exact = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100);
const connectedPrice = (link: AgencyPayLink) => link.amountCents !== null ? exact(link.amountCents) : `${exact(link.minCents ?? 0)}–${exact(link.maxCents ?? 0)}`;
const price = (link: PayLinkConfig) => link.amountCents !== undefined ? money(link.amountCents) : `${money(link.minCents ?? 0)}–${money(link.maxCents ?? 0)}`;

function confirmedLink(value: unknown, body: Record<string, unknown>, agencyId: string): value is PayLinkConfig {
  if (!value || typeof value !== "object") return false;
  const link = value as PayLinkConfig;
  if (typeof link.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(link.slug)
    || typeof link.createdAt !== "string" || !Number.isFinite(Date.parse(link.createdAt))) return false;
  if (body.action === "create") return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(link.slug) && (link as { clientName?: string }).clientName === body.clientName;
  if (body.action === "revoke") return link.slug === body.slug && (!link.agencyWorkspaceId || link.agencyWorkspaceId === agencyId)
    && typeof link.revokedAt === "string" && Number.isFinite(Date.parse(link.revokedAt)) && typeof link.revokedBy === "string";
  return false;
}

type LinkForm = { clientName: string; description: string; kind: "fixed" | "range"; dollars: string; minDollars: string; maxDollars: string };
const blankForm: LinkForm = { clientName: "", description: "", kind: "fixed", dollars: "", minDollars: "", maxDollars: "" };
type ProspectPrefill = { token?: string; name: string; description: string };

export function AgencyPaymentLinks({ agencyWorkspaceId, initialProspect, request = fetch }: { agencyWorkspaceId: string; initialProspect?: ProspectPrefill; request?: typeof fetch }) {
  return <ScopedPaymentLinks key={agencyWorkspaceId} agencyWorkspaceId={agencyWorkspaceId} request={request} initialProspect={initialProspect} />;
}

function ScopedPaymentLinks({ agencyWorkspaceId, request, initialProspect }: { agencyWorkspaceId: string; request: typeof fetch; initialProspect?: ProspectPrefill }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [form, setForm] = useState<LinkForm>(() => ({ ...blankForm, clientName: initialProspect?.name ?? "", description: initialProspect?.description ?? "" }));
  const flight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const response = await request(`/api/agency/payment-links?agencyWorkspaceId=${encodeURIComponent(agencyWorkspaceId)}`, { cache: "no-store", signal });
      const value = await response.json();
      if (!response.ok || value.agency?.id !== agencyWorkspaceId || typeof value.currentActorId !== "string" || !Array.isArray(value.payLinks) || !Array.isArray(value.clients)
        || typeof value.legacyMerchant !== "boolean" || !value.checkoutAvailability || !value.paidPayments || !Array.isArray(value.connectedLinks) || !value.creation) throw new Error(value.error || "Payment links could not be read.");
      if (!signal?.aborted && mounted.current) { setSnapshot(value); setStale(false); }
    } catch (cause) {
      if (!signal?.aborted && mounted.current) { setStale(true); setError(cause instanceof Error ? cause.message : "Payment links could not be read."); }
    } finally { if (!signal?.aborted && mounted.current) setLoading(false); }
  }, [agencyWorkspaceId, request]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  async function command(body: Record<string, unknown>) {
    if (flight.current || !snapshot || stale) return;
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
      if (body.action === "create") { setForm(blankForm); setMessage("Payment link created. Copy it and send it yourself. Strelva does not email payment links."); }
      else setMessage("Payment link expired. New checkouts are refused; payments already started in Stripe may still complete.");
      await load();
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Request unconfirmed. Retry the same request to check its receipt."); }
    finally { flight.current = false; if (mounted.current) setBusy(false); }
  }
  async function copy(slug: string) {
    try { await navigator.clipboard.writeText(new URL(`/pay/${slug}`, window.location.origin).toString()); setMessage("Payment link copied."); }
    catch { setError("The link could not be copied. Open the payment link and copy its address."); }
  }
  const disabled = busy || loading || stale || !!pending;
  function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    if (disabled || !snapshot) return;
    const body: Record<string, unknown> = { action: "create", agencyWorkspaceId, expectedActorId: snapshot.currentActorId, idempotencyKey: crypto.randomUUID(), clientName: form.clientName.trim(), description: form.description.trim() };
    if (!body.clientName || !body.description) { setError("Add the client and what the link is for."); return; }
    if (form.kind === "fixed") {
      if (!/^\d+(\.\d{1,2})?$/.test(form.dollars.trim()) || Number(form.dollars) < 1 || Number(form.dollars) > 1000000) { setError("Enter an amount of $1 or more, with at most two decimals."); return; }
      body.amountCents = Math.round(Number(form.dollars) * 100);
    } else {
      const low = Number(form.minDollars), high = Number(form.maxDollars);
      if (!Number.isInteger(low) || !Number.isInteger(high) || low < 50 || high > 10000 || low > high || (high - low) % 50 !== 0) { setError("A range needs whole-dollar minimum and maximum amounts, at least $50 and at most $10,000, with $50 steps between them."); return; }
      body.minCents = low * 100; body.maxCents = high * 100;
    }
    void command(body);
  }
  return <>
    <StTextButton onClick={() => void load()} disabled={busy || loading}>Refresh payment links</StTextButton>
    {error ? <StNotice tone="critical">{error}{stale && snapshot ? " Retained links may be out of date. Refresh before changing anything." : ""}</StNotice> : null}
    {message ? <StNotice>{message}</StNotice> : null}
    {pending ? <StNotice>This exact request is awaiting confirmation. Its terms are held.<StTextButton disabled={busy || loading || stale} onClick={() => void command(pending)}>Retry the same request</StTextButton></StNotice> : null}
    {loading && !snapshot ? <StSkeleton label="Reading payment links" /> : !snapshot ? <StEmpty>Payment links are unavailable. Confirm your agency owner or admin access, then refresh.</StEmpty> : <>
      {snapshot.creation.reason === "off" ? <StNotice>Payment links · Coming soon. New payment links need your agency&apos;s Stripe Connect account. Checkout for new links is not available yet.</StNotice> : null}
      {snapshot.creation.reason === "setup_required" ? <AgencyMerchantSetup agencyWorkspaceId={agencyWorkspaceId} onChange={() => void load()} /> : null}
      {snapshot.creation.reason === "unavailable" ? <StNotice>Payment readiness could not be confirmed. Refresh to check again. No payment link can be created right now.</StNotice> : null}
      {snapshot.creation.reason === "ready" ? <StSection title="New payment link">
        <form onSubmit={submitCreate} className="flex flex-col gap-4">
          <TextInput label="Client name" value={form.clientName} maxLength={160} required disabled={disabled} onChange={event => setForm({ ...form, clientName: event.target.value })} />
          <TextArea label="What it is for" value={form.description} maxLength={1000} required disabled={disabled} onChange={event => setForm({ ...form, description: event.target.value })} />
          <SelectInput label="Amount" value={form.kind} disabled={disabled} onChange={event => setForm({ ...form, kind: event.target.value === "range" ? "range" : "fixed" })} options={[{ value: "fixed", label: "Fixed amount" }, { value: "range", label: "Client chooses within a range" }]} />
          {form.kind === "fixed" ? <TextInput label="Amount in dollars" inputMode="decimal" value={form.dollars} disabled={disabled} onChange={event => setForm({ ...form, dollars: event.target.value })} />
            : <><TextInput label="Minimum in whole dollars" inputMode="numeric" value={form.minDollars} disabled={disabled} onChange={event => setForm({ ...form, minDollars: event.target.value })} /><TextInput label="Maximum in whole dollars" inputMode="numeric" helperText="The client picks in $50 steps." value={form.maxDollars} disabled={disabled} onChange={event => setForm({ ...form, maxDollars: event.target.value })} /></>}
          <StPill type="submit" variant="primary" disabled={disabled}>Create payment link</StPill>
        </form>
      </StSection> : null}
      <StTextButton href={`/workspace?workspaceId=${encodeURIComponent(agencyWorkspaceId)}&agencyView=clients`}>Open agency clients</StTextButton>
      {snapshot.connectedLinks.length ? <StSection title="Payment links">
        <StRows label="Agency payment links">{snapshot.connectedLinks.map(link => {
          const when = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : "";
          return <StRow key={link.id} title={link.clientName} detail={<>
            <StMono>{connectedPrice(link)} · /pay/{link.slug}{link.invoiceNumber !== null ? ` · ${formatDocumentNumber("invoice", link.invoiceNumber)}` : ""}</StMono>
            <StCopy>{link.description}</StCopy>
            {link.status === "paid" ? <StState kind="live">Paid {exact(link.paidAmountCents ?? 0)} · {when(link.paidAt)}</StState> : link.status === "expired" ? <StState kind="down">Expired {when(link.revokedAt)}</StState> : <StState kind="need">Open</StState>}
            {link.status === "open" ? <><StTextButton disabled={disabled} onClick={() => void copy(link.slug)}>Copy link</StTextButton><StTextButton href={`/pay/${link.slug}`}>Open payment link</StTextButton></> : null}
            <StTextButton href={`/workspace/payment-links/${link.id}/invoice?workspaceId=${encodeURIComponent(agencyWorkspaceId)}`}>View invoice</StTextButton>
            {link.status === "paid" ? <StTextButton href={`/workspace/payment-links/${link.id}/receipt?workspaceId=${encodeURIComponent(agencyWorkspaceId)}`}>View payment receipt</StTextButton> : null}
            {link.status === "open" ? (revoking === link.slug ? <StNotice>Expire this link? New checkouts will stop. Payments already started in Stripe may still complete.<StTextButton disabled={disabled} onClick={() => void command({ action: "revoke", agencyWorkspaceId, expectedActorId: snapshot.currentActorId, slug: link.slug, idempotencyKey: crypto.randomUUID() })}>Confirm expire</StTextButton><StTextButton disabled={disabled} onClick={() => setRevoking(null)}>Keep link</StTextButton></StNotice> : <StTextButton disabled={disabled} onClick={() => setRevoking(link.slug)}>Expire link</StTextButton>) : null}
          </>} />;
        })}</StRows>
      </StSection> : null}
      {snapshot.legacyMerchant ? <>
      <StCopy>Existing one-time payment links remain available below. A payment link does not start a subscription.</StCopy>
      <StSection title={snapshot.connectedLinks.length ? "Earlier payment links" : "Payment links"}>
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
