"use client";

import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { VisitorBookingShell } from "@/experience/bookings/VisitorBookingShell";
import visitor from "@/experience/bookings/visitor.module.css";
import styles from "./payment.module.css";
import {
  hasPaymentTerms,
  paymentRefundTerms,
  publicPaymentRequestSchema,
  type PublicPaymentRequest,
} from "./public-payment";
import { formatMoney } from "@/platform/connect/money-format";
import { visitorBrandFromAccent, type VisitorBrand } from "@/products/websites/client";

export default function BusinessPayment({
  token,
  initialRequest,
  preview = false,
  brand,
}: {
  token: string;
  initialRequest?: PublicPaymentRequest;
  preview?: boolean;
  /** The charging business's own look, read on the server from the request's workspace. */
  brand?: VisitorBrand | null;
}) {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [request, setRequest] = useState<PublicPaymentRequest | null>(
    initialRequest ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!initialRequest && !preview);

  useEffect(() => {
    if (initialRequest || preview) return;
    const controller = new AbortController();
    fetch(`/api/v1/payments?token=${encodeURIComponent(token)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw Error(
            "This payment link is unavailable. Ask the business for a current link.",
          );
        setRequest(publicPaymentRequestSchema.parse(await response.json()));
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Payment details could not be loaded. Ask the business for a current link.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token, initialRequest, preview]);

  async function pay() {
    if (
      preview ||
      !request ||
      request.status !== "unpaid" ||
      !request.businessName?.trim() ||
      !hasPaymentTerms(request) ||
      busy
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json().catch(() => ({}));
      if (!active.current) return;
      if (!response.ok)
        throw Error(result.error ?? "Payment could not be started.");
      if (result.status === "paid") {
        setRequest((current) =>
          current ? { ...current, paid: true, status: "paid" } : current,
        );
        return;
      }
      if (typeof result.url !== "string")
        throw Error("Payment could not be started. Try again.");
      const url = new URL(result.url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com")
        throw Error("Stripe sent back a link that couldn't be opened. Nothing was charged.");
      window.location.assign(url.toString());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Payment could not be started.",
      );
    } finally {
      setBusy(false);
    }
  }

  const businessName = request?.businessName?.trim();
  const title = businessName
    ? request?.kind === "deposit"
      ? `Your booking deposit with ${businessName}`
      : `Your quote from ${businessName}`
    : "Payment request";
  const termsAvailable = request ? hasPaymentTerms(request) : false;
  const refundTerms = request ? paymentRefundTerms(request) : null;
  const until = request
    ? new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(new Date(request.expiresAt))
    : "";
  // The business's own look: read on the server, or carried on the payment read.
  const carried = visitorBrandFromAccent(request?.brand?.accentColor ?? null);
  const carriedLogo = request?.brand?.logoUrl ?? null;
  const worn = brand ?? (carried && carriedLogo ? { ...carried, logo: { url: carriedLogo, alt: businessName ?? "" } } : carried);
  return (
    <VisitorBookingShell siteName={businessName} wide brand={worn}>
      <div className={styles.split}>
        <section className={styles.description} aria-label="Payment details">
          <h1 className={visitor.title}>{title}</h1>
          <p className={visitor.intro}>
            {request?.kind === "deposit"
              ? "Paying it keeps your appointment."
              : "Check what was agreed, then pay by card."}
          </p>
          {loading ? (
            <div
              className={`${visitor.section} ${styles.state}`}
              role="status"
              aria-label="Loading payment details"
            >
              <StSkeleton width="75%" />
              <StSkeleton width="50%" />
              <span>Loading payment details…</span>
            </div>
          ) : null}
          {request ? (
            <dl
              className={`${visitor.summary} ${visitor.section} ${styles.agreed}`}
              aria-label="What was agreed"
            >
              {request.acceptedTerms?.trim() ? (
                <>
                  <dt>What it’s for</dt>
                  <dd>{request.acceptedTerms}</dd>
                </>
              ) : null}
              {request.lines.map((line, index) => (
                <div key={index} className={styles.line}>
                  <dt>
                    {line.name}
                    <span className={visitor.muted}>
                      Quantity {line.quantity}
                    </span>
                  </dt>
                  <dd>
                    {formatMoney(
                      line.quantity * line.unitCents,
                      request.currency,
                    )}
                  </dd>
                </div>
              ))}
              {refundTerms ? (
                <>
                  <dt>If it’s cancelled</dt>
                  <dd>{refundTerms}</dd>
                </>
              ) : null}
              {request.status === "unpaid" ? (
                <>
                  <dt>Pay by</dt>
                  <dd>
                    <time dateTime={request.expiresAt}>{until}</time>
                  </dd>
                </>
              ) : null}
            </dl>
          ) : null}
        </section>
        <div>
          {error ? (
            <p className={`${visitor.notice} ${visitor.error}`} role="alert">
              {error}
            </p>
          ) : null}
          {request ? (
            <section
              className={`${visitor.surface} ${styles.form}`}
              aria-label="Payment amount"
            >
              <h2 className={visitor.label}>
                {request.kind === "deposit" ? "Your deposit" : "Your payment"}
              </h2>
              <span className={styles.amountValue}>
                {formatMoney(request.amountCents, request.currency)}
              </span>
              {!termsAvailable ? (
                <p className={visitor.notice}>
                  This link doesn’t say what happens if you cancel, so it
                  can’t take a payment. Ask the business for a new link.
                </p>
              ) : null}
              {request.status === "paid" ? (
                <p role="status">Paid. Thank you.</p>
              ) : request.status === "expired" ? (
                <p>This link has run out. Ask {businessName || "the business"} for a new one.</p>
              ) : request.status === "cancelled" ? (
                <p>{businessName || "The business"} took this request back. Nothing is owed.</p>
              ) : null}
              {!businessName ? (
                <p className={visitor.notice}>
                  This link doesn’t say which business it’s for, so it
                  can’t take a payment. Ask for a new link.
                </p>
              ) : null}
              {preview ? (
                <p className={visitor.note}>
                  Fictional payment preview. No payment can be made here.
                </p>
              ) : null}
              {request.status === "unpaid" &&
              businessName &&
              termsAvailable &&
              !preview ? (
                <button
                  className={`${visitor.button} ${visitor.block}`}
                  type="button"
                  disabled={busy}
                  aria-busy={busy}
                  onClick={pay}
                >
                  {busy ? "Opening Stripe…" : "Accept and pay"}
                </button>
              ) : null}
              <p className={`${visitor.note} ${styles.security}`}>
                <Lock size={14} aria-hidden="true" />
                Payment goes to{" "}
                {businessName || "the business named on this request"} through
                Stripe. The business handles refunds and cancellation terms.
              </p>
            </section>
          ) : !loading && !error ? (
            <p className={visitor.notice}>
              Payment details are unavailable. Ask the business for a current
              payment link.
            </p>
          ) : null}
        </div>
      </div>
    </VisitorBookingShell>
  );
}
