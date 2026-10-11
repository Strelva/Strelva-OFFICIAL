"use client";

import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { StEmpty, StHead, StMono, StNotice, StPill, StRow, StRows, StSkeleton, StState, StSurface } from "@/components/ui/strelva/Kit";
import { PaymentLayout, PaymentSplit } from "@/experience/product/public-payment/PaymentLayout";
import styles from "@/experience/product/public-payment/payment.module.css";
import { paymentRequestSchema, type PaymentRequest } from "@/platform/connect/contracts";
import { formatMoney } from "@/platform/connect/money-format";

export default function BusinessPayment({ token, initialRequest }: { token: string; initialRequest?: PaymentRequest }) {
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [request, setRequest] = useState<PaymentRequest | null>(initialRequest ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!initialRequest);

  useEffect(() => {
    if (initialRequest) return;
    const controller = new AbortController();
    fetch(`/api/v1/payments?token=${encodeURIComponent(token)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw Error("This payment link is unavailable. Ask the business for a current link.");
        setRequest(paymentRequestSchema.parse(await response.json()));
      })
      .catch(() => { if (!controller.signal.aborted) setError("Payment details could not be loaded. Ask the business for a current link."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, initialRequest]);

  async function pay() {
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

  const businessName = request?.businessName;
  const title = businessName ? request?.kind === "deposit" ? `Your booking deposit with ${businessName}` : `Your quote from ${businessName}` : "Payment request";
  return <PaymentLayout brand={businessName}><PaymentSplit description={<>
    <StHead title={title} meta="Review the agreed details before paying." />
    {loading ? <div className={styles.state} role="status" aria-label="Loading payment details"><StSkeleton width="75%" /><StSkeleton width="50%" /><span>Loading payment details…</span></div> : null}
    {request ? <>
      {request.lines.length ? <StRows label="Payment details">{request.lines.map((line, index) => <StRow key={index} title={line.name} detail={<>Quantity <StMono>{line.quantity}</StMono></>} end={<StMono tone="text">{formatMoney(line.quantity * line.unitCents, request.currency)}</StMono>} />)}</StRows> : <StEmpty>No item details supplied. The business has not added item details to this request.</StEmpty>}
      {request.acceptedTerms ? <p className={styles.term}>{request.acceptedTerms}</p> : null}
    </> : null}
  </>}>
    {error ? <StNotice tone="critical">{error}</StNotice> : null}
    {request ? <StSurface pad={false}><div className={styles.form}>
      <h2 className={styles.formTitle}>{request.kind === "deposit" ? "Your deposit" : "Your payment"}</h2>
      <span className={styles.amountValue}>{formatMoney(request.amountCents, request.currency)}</span>
      {request.status === "paid" ? <StState kind="live">Payment received.</StState> : request.status === "expired" ? <StState kind="down">This payment link has expired.</StState> : request.status === "cancelled" ? <StState kind="draft">This request was cancelled.</StState> : <p className={styles.caption}>Valid until <StMono as="time" dateTime={request.expiresAt}>{new Date(request.expiresAt).toLocaleString()}</StMono>.</p>}
      {!businessName ? <StNotice>The business identity is unavailable. Ask for a new payment link before paying.</StNotice> : null}
      {request.status === "unpaid" && businessName ? <StPill size="lg" block busy={busy} onClick={pay}>{busy ? "Opening secure payment…" : "Accept and pay"}</StPill> : null}
      <p className={`${styles.caption} ${styles.security}`}><Lock size={12} aria-hidden="true" />Payment goes to {businessName || "the business named on this request"} through Stripe. The business handles refunds and cancellation terms.</p>
    </div></StSurface> : !loading && !error ? <StEmpty>Payment details are unavailable. Ask the business for a current payment link.</StEmpty> : null}
  </PaymentSplit></PaymentLayout>;
}
