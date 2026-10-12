"use client";

import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { VisitorBookingShell } from "@/experience/bookings/VisitorBookingShell";
import visitor from "@/experience/bookings/visitor.module.css";
import styles from "./payment.module.css";
import { hasPaymentTerms, paymentRefundTerms, publicPaymentRequestSchema, type PublicPaymentRequest } from "./public-payment";
import { formatMoney } from "@/platform/connect/money-format";

export default function BusinessPayment({ token, initialRequest }: { token: string; initialRequest?: PublicPaymentRequest }) {
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [request, setRequest] = useState<PublicPaymentRequest | null>(initialRequest ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!initialRequest);

  useEffect(() => {
    if (initialRequest) return;
    const controller = new AbortController();
    fetch(`/api/v1/payments?token=${encodeURIComponent(token)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw Error("This payment link is unavailable. Ask the business for a current link.");
        setRequest(publicPaymentRequestSchema.parse(await response.json()));
      })
      .catch(() => { if (!controller.signal.aborted) setError("Payment details could not be loaded. Ask the business for a current link."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, initialRequest]);

  async function pay() {
    if (!request || request.status !== "unpaid" || !request.businessName?.trim() || !hasPaymentTerms(request) || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/payments", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
      });
      const result = await response.json().catch(() => ({}));
      if (!active.current) return;
      if (!response.ok) throw Error(result.error ?? "Payment could not be started.");
      if (result.status === "paid") {
        setRequest(current => current ? { ...current, paid: true, status: "paid" } : current);
        return;
      }
      if (typeof result.url !== "string") throw Error("Payment could not be started. Try again.");
      const url = new URL(result.url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") throw Error("The payment provider returned an invalid link.");
      window.location.assign(url.toString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment could not be started.");
    } finally {
      setBusy(false);
    }
  }

  const businessName = request?.businessName?.trim();
  const title = businessName ? request?.kind === "deposit" ? `Your booking deposit with ${businessName}` : `Your quote from ${businessName}` : "Payment request";
  const termsAvailable = request ? hasPaymentTerms(request) : false;
  const refundTerms = request ? paymentRefundTerms(request) : null;
  return <VisitorBookingShell siteName={businessName} wide>
    <div className={styles.split}>
      <section className={styles.description} aria-label="Payment details">
        <h1 className={visitor.title}>{title}</h1>
        <p className={visitor.intro}>Review the agreed details before paying.</p>
        {loading ? <div className={`${visitor.section} ${styles.state}`} role="status" aria-label="Loading payment details"><StSkeleton width="75%" /><StSkeleton width="50%" /><span>Loading payment details…</span></div> : null}
        {request ? request.lines.length ? <dl className={`${visitor.summary} ${visitor.section}`}>{request.lines.map((line, index) => <div key={index} className={styles.line}><dt>{line.name}<span className={visitor.muted}>Quantity {line.quantity}</span></dt><dd>{formatMoney(line.quantity * line.unitCents, request.currency)}</dd></div>)}</dl> : <p className={visitor.notice}>No item details supplied. The business has not added item details to this request.</p> : null}
      </section>
      <div>
        {error ? <p className={`${visitor.notice} ${visitor.error}`} role="alert">{error}</p> : null}
        {request ? <section className={`${visitor.surface} ${styles.form}`} aria-label="Payment amount and terms">
          <h2 className={visitor.label}>{request.kind === "deposit" ? "Your deposit" : "Your payment"}</h2>
          <span className={styles.amountValue}>{formatMoney(request.amountCents, request.currency)}</span>
          {request.acceptedTerms?.trim() ? <p className={styles.terms}>{request.acceptedTerms}</p> : null}
          {refundTerms ? <p className={styles.terms}>{refundTerms}</p> : null}
          {!termsAvailable ? <p className={visitor.notice}>Refund and cancellation terms are unavailable. Ask the business for a payment link with the agreed terms before paying.</p> : null}
          {request.status === "paid" ? <p role="status">Payment received.</p> : request.status === "expired" ? <p>This payment link has expired.</p> : request.status === "cancelled" ? <p>This request was cancelled.</p> : <p className={visitor.note}>Valid until <time dateTime={request.expiresAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "long" }).format(new Date(request.expiresAt))}</time>.</p>}
          {!businessName ? <p className={visitor.notice}>The business identity is unavailable. Ask for a new payment link before paying.</p> : null}
          {request.status === "unpaid" && businessName && termsAvailable ? <button className={`${visitor.button} ${visitor.block}`} type="button" disabled={busy} aria-busy={busy} onClick={pay}>{busy ? "Opening secure payment…" : "Accept and pay"}</button> : null}
          <p className={`${visitor.note} ${styles.security}`}><Lock size={14} aria-hidden="true" />Payment goes to {businessName || "the business named on this request"} through Stripe. The business handles refunds and cancellation terms.</p>
        </section> : !loading && !error ? <p className={visitor.notice}>Payment details are unavailable. Ask the business for a current payment link.</p> : null}
      </div>
    </div>
  </VisitorBookingShell>;
}
