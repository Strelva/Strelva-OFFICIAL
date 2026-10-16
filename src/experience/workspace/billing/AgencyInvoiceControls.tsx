"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { XaAnswers, XaButton, XaDecision, XaField, XaSegmented, XaSelect, XaStatus, XaTextArea, XaTextLink, XaYes, type XaYesState } from "@/components/ui/strelva/Xa";
import type { AgencyInvoice } from "@/platform/agency-billing/types";
import type { CheckoutAvailability } from "@/platform/connect/checkout-availability";
import { AgencyCheckoutStatus, UNRELEASED_CHECKOUT } from "./AgencyCheckoutStatus";
import styles from "@/experience/workspace/money/money.module.css";

const price = (invoice: Pick<AgencyInvoice, "amount_cents" | "currency">) => new Intl.NumberFormat("en-US", { style: "currency", currency: invoice.currency || "usd" }).format(invoice.amount_cents / 100);
const STATUS_WORDS: Record<AgencyInvoice["status"], string> = { proposed: "Waiting for the owner", accepted: "Accepted", declined: "Declined", revoked: "Withdrawn", awaiting_payment: "Waiting for payment", active: "Active", paid: "Paid", cancelled: "Cancelled" };

function ReceiptState({ invoice }: { invoice: AgencyInvoice }) {
  if (invoice.payment_receipt_state === "review") return <p role="alert" className={styles.critical}>Payment needs review. Stripe&apos;s record could not be matched to the accepted agreement. Your agency must reconcile it.</p>;
  if (invoice.payment_receipt_state === "matched") return <p role="status" className={styles.body}>Payment is confirmed for these accepted terms.{invoice.kind === "rebill" && invoice.status === "awaiting_payment" ? " The subscription’s current state still needs reconciliation." : ""}</p>;
  return invoice.kind === "rebill" && invoice.status === "active" ? <p role="status" className={styles.body}>The subscription is active. Payment is not yet confirmed.</p> : null;
}

type ControlsProps = { agencyWorkspaceId: string; businessWorkspaceId: string; initialInvoices?: AgencyInvoice[]; checkoutAvailability?: CheckoutAvailability; request?: typeof fetch };
/** The agency sets a retail price for one client, inline in that client's row. The owner says yes on their own billing page. */
export function AgencyInvoiceControls(props: ControlsProps) {
  return <ScopedAgencyInvoiceControls key={`${props.agencyWorkspaceId}:${props.businessWorkspaceId}`} {...props} />;
}
function ScopedAgencyInvoiceControls({ agencyWorkspaceId, businessWorkspaceId, initialInvoices = [], checkoutAvailability = UNRELEASED_CHECKOUT, request = fetch }: ControlsProps) {
  const [kind, setKind] = useState<"rebill" | "pay_link">("rebill");
  const [invoice, setInvoice] = useState<AgencyInvoice | null>(initialInvoices[0] ?? null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inflight = useRef<AbortController | null>(null);
  useEffect(() => () => inflight.current?.abort(), []);
  async function command(body: Record<string, unknown>) {
    if (inflight.current || (body.action === "fulfill" && checkoutAvailability.status !== "ready")) return;
    const controller = new AbortController(); inflight.current = controller;
    setBusy(true); setError("");
    try {
      const response = await request((body.action === "propose" ? kind : invoice?.kind) === "rebill" ? `/api/agency/clients/${businessWorkspaceId}/rebill` : "/api/agency/pay-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      const value = await response.json(); if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(value.error ?? "The agreement could not be confirmed.");
      setInvoice(value); if (body.action === "propose") setIdempotencyKey("");
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The agreement could not be confirmed."); }
    finally { if (!controller.signal.aborted) { inflight.current = null; setBusy(false); } }
  }
  return <details className={styles.history}>
    <summary className={styles.detailsToggle}>{invoice ? `Retail price · ${price(invoice)}${invoice.kind === "rebill" ? " a month" : " once"} · ${STATUS_WORDS[invoice.status]}` : "Set a retail price for this client"}</summary>
    <div className={styles.inlinePanel}>
      <p className={styles.note}>The business owner sees these exact terms and says yes before any checkout or subscription is made. Your wholesale bill stays separate.</p>
      <AgencyCheckoutStatus availability={checkoutAvailability} paymentsHref={`/workspace/payments?workspaceId=${encodeURIComponent(agencyWorkspaceId)}`} />
      <form className={styles.form} onSubmit={event => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        const dollars = String(form.get("amount") ?? "").trim();
        if (!/^\d+(\.\d{1,2})?$/.test(dollars) || Number(dollars) <= 0) { setError("Enter an amount above $0, with at most two decimals."); return; }
        void command({ action: "propose", agencyWorkspaceId, businessWorkspaceId, kind, amountCents: Math.round(Number(dollars) * 100), currency: "usd", description: form.get("description"), idempotencyKey: idempotencyKey || (() => { const key = crypto.randomUUID(); setIdempotencyKey(key); return key; })() });
      }}>
        <XaSegmented label="How the client pays" value={kind} onChange={value => { if (!busy) setKind(value); }} options={[{ value: "rebill", label: "Every month" }, { value: "pay_link", label: "Once" }]} />
        <XaField label={kind === "rebill" ? "Amount each month, in dollars" : "Amount, in dollars"} name="amount" inputMode="decimal" required disabled={busy} />
        <XaTextArea label="What this covers" name="description" maxLength={300} required disabled={busy} />
        <div className={styles.actions}><XaButton type="submit" disabled={busy}>Send to the owner for a yes</XaButton></div>
      </form>
      {initialInvoices.length > 1 ? <XaSelect label="Earlier agreements with this client" disabled={busy} value={invoice?.id ?? ""} onChange={event => { if (!inflight.current) { setInvoice(initialInvoices.find(item => item.id === event.target.value) ?? null); setError(""); } }} options={initialInvoices.map(item => ({ value: item.id, label: `${item.description} · ${STATUS_WORDS[item.status]}` }))} /> : null}
      {invoice ? <div className={styles.section}>
        <p className={styles.body} role="status">{invoice.description}: {price(invoice)}{invoice.kind === "rebill" ? " a month" : " once"}. {STATUS_WORDS[invoice.status]}.</p>
        <ReceiptState invoice={invoice} />
        <div className={styles.links}><XaTextLink href={`/workspace/billing?workspaceId=${businessWorkspaceId}&invoiceId=${invoice.id}`}>See what the owner sees</XaTextLink>{checkoutAvailability.status === "ready" && invoice.checkout_url && (!invoice.payment_receipt_state || invoice.payment_receipt_state === "unconfirmed") ? <><span aria-hidden="true">·</span><a className={styles.detailsToggle} href={invoice.checkout_url}>Open payment page</a></> : null}</div>
        {invoice.status === "accepted" ? <div className={styles.actions}><XaButton size="sm" disabled={busy || checkoutAvailability.status !== "ready"} onClick={() => void command({ action: "fulfill", intentId: invoice.id })}>Create accepted checkout</XaButton></div> : null}
      </div> : null}
      {error ? <p role="alert" className={styles.critical}>{error}</p> : null}
    </div>
  </details>;
}

type AcceptanceProps = { invoiceId: string; checkoutAvailability?: CheckoutAvailability; request?: typeof fetch };
/** The owner agrees to a price their agency prepared (XA · O3): the terms, then the one yes. */
export function AgencyInvoiceAcceptance(props: AcceptanceProps) { return <ScopedAgencyInvoiceAcceptance key={props.invoiceId} {...props} />; }
function ScopedAgencyInvoiceAcceptance({ invoiceId, checkoutAvailability = UNRELEASED_CHECKOUT, request = fetch }: AcceptanceProps) {
  const [invoice, setInvoice] = useState<AgencyInvoice | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<null | "accept" | "decline" | "fulfill">(null);
  const inflight = useRef<AbortController | null>(null);
  useEffect(() => () => inflight.current?.abort(), []);
  const load = useCallback(async (signal: AbortSignal) => { const response = await request(`/api/agency/pay-links?intentId=${invoiceId}`, { cache: "no-store", signal }); const value = await response.json(); if (signal.aborted) return; if (!response.ok) throw new Error(value.error ?? "The agreement could not be loaded."); setInvoice(value); }, [invoiceId, request]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The agreement could not be loaded."); }); return () => controller.abort(); }, [load]);
  async function respond(action: "accept" | "decline" | "fulfill") {
    if (inflight.current || (action === "fulfill" && checkoutAvailability.status !== "ready")) return;
    const controller = new AbortController(); inflight.current = controller; setBusy(action); setError("");
    try {
      const response = await request("/api/agency/pay-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, intentId: invoiceId }), signal: controller.signal });
      const value = await response.json(); if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(value.error ?? "Your answer could not be confirmed.");
      setInvoice(value);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Your answer could not be confirmed."); }
    finally { if (!controller.signal.aborted) { inflight.current = null; setBusy(null); } }
  }
  if (!invoice) return <section className={styles.section} aria-label="Agency retail agreement">
    {error ? <p role="alert" className={styles.critical}>{error}</p> : <p role="status" className={styles.note}>Loading the agreement…</p>}
  </section>;
  const proposed = invoice.status === "proposed" && invoice.can_accept;
  const yesState: XaYesState = busy === "accept" ? "going" : error && proposed ? "failed" : "waiting";
  const status = invoice.status === "proposed" ? <XaStatus kind="waits">Waits for you</XaStatus>
    : invoice.status === "declined" || invoice.status === "revoked" || invoice.status === "cancelled" ? <XaStatus kind="draft">{STATUS_WORDS[invoice.status]}</XaStatus>
      : <XaStatus kind="live">{STATUS_WORDS[invoice.status]}</XaStatus>;
  return <XaDecision label="Agency retail agreement" status={status} meta="Prepared by your agency"
    yes={proposed ? <XaYes state={yesState} yesLabel="Accept these terms" notYetLabel="Decline" onYes={() => void respond("accept")} onNotYet={busy ? undefined : () => void respond("decline")}
      working={{ title: "Recording your yes", steps: [{ id: "accept", label: "Saving these exact terms with your name", state: "active" }] }} failure={error || undefined} /> : null}>
    <div className={styles.section}>
      <p className={styles.amount}>{price(invoice)}<small>{invoice.kind === "rebill" ? "a month" : "once"}</small></p>
      <p className={styles.body}>{invoice.description}</p>
    </div>
    <XaAnswers labelWidth={120} rows={[
      ["Who charges", "Your agency, on its own Stripe account"],
      ["Separate from", "Its wholesale bill and any job limits you already set"],
      ["Status", STATUS_WORDS[invoice.status]],
    ]} />
    <ReceiptState invoice={invoice} />
    <AgencyCheckoutStatus availability={checkoutAvailability} />
    {invoice.status === "accepted" && invoice.can_manage ? <div className={styles.actions}><XaButton disabled={Boolean(busy) || checkoutAvailability.status !== "ready"} onClick={() => void respond("fulfill")}>Create accepted checkout</XaButton></div> : null}
    {invoice.status === "awaiting_payment" && !invoice.checkout_url && (!invoice.payment_receipt_state || invoice.payment_receipt_state === "unconfirmed") ? <p role="status" className={styles.note}>The subscription is recorded. Its payment page still needs reconciliation; no new subscription is being made.</p> : null}
    {checkoutAvailability.status === "ready" && invoice.checkout_url && (!invoice.payment_receipt_state || invoice.payment_receipt_state === "unconfirmed") ? <a className={styles.detailsToggle} href={invoice.checkout_url}>Pay this agreement</a> : null}
    {error && !proposed ? <p role="alert" className={styles.critical}>{error}</p> : null}
  </XaDecision>;
}
