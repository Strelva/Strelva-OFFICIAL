"use client";

import { useEffect, useRef, useState } from "react";
import type { BusinessBilling } from "@/platform/business-billing";
import {
  XaAnswers,
  XaButton,
  XaHeadline,
  XaSays,
  XaStatus,
  XaTextLink,
} from "@/components/ui/strelva/Xa";
import styles from "@/experience/workspace/money/money.module.css";

const day = (iso: string) => {
  const value = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return Number.isFinite(value.getTime())
    ? new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(value)
    : iso.slice(0, 10);
};

/**
 * Owner billing (XA · R1), October 16 money decision: no price figure, ever.
 * Card digits, amounts, next charge and receipts stay in Stripe; this page
 * says who pays, what it covers and how to reach the card.
 */
type Transport = (input: string, init?: RequestInit) => Promise<Response>;
type Props = {
  billing: BusinessBilling | null;
  businessName?: string;
  backHref: string;
  workspaceId?: string;
  canManage?: boolean;
  transport?: Transport;
  navigate?: (url: string) => void;
};

function planLine(billing: BusinessBilling) {
  if (billing.state === "grandfathered") return "Your existing agreement";
  if (billing.state === "comped") return "Covered by Strelva";
  if (billing.state === "none") return "No plan yet";
  if (billing.state === "custom") return "An agreement written for you";
  return "Strelva plan";
}

/** Stripe's status, said the way an owner would: "Harbor Dental's plan is paid up." */
function planState(status: string) {
  switch (status) {
    case "active":
      return "is paid up";
    case "trialing":
      return "is on a trial";
    case "canceled":
    case "cancelled":
      return "has ended";
    case "incomplete":
      return "is waiting on its first payment";
    case "unpaid":
      return "is unpaid";
    default:
      return "is waiting on Stripe";
  }
}

/** A payer change the owner asks for from Pebble's line; the payer section reloads and shows it waiting. */
export const PAYER_CHANGED_EVENT = "strelva:payer-transition";

export function BusinessBillingView({
  billing,
  businessName,
  backHref,
  workspaceId = billing?.workspaceId,
  canManage = false,
  transport,
  navigate,
}: Props) {
  const name = businessName ?? "This business";
  const agencyPays = billing?.payerParty?.kind === "agency";
  const agencyName = agencyPays
    ? (billing?.payerParty?.name ?? "Your agency")
    : null;
  const payer = agencyPays
    ? agencyName!
    : (billing?.payer?.name ?? billing?.payer?.email ?? "This business");
  const pastDue = billing?.paymentStatus === "past_due";
  const [direct, setDirect] = useState<"idle" | "busy" | "asked" | string>(
    "idle",
  );

  async function payDirectly() {
    if (!workspaceId || direct === "busy") return;
    setDirect("busy");
    try {
      const response = await (transport ?? fetch)(
        "/api/work-economics/payer-transition",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "propose",
            workspaceId,
            successorKind: "business",
          }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          body.error ?? "The change could not be confirmed. Nothing changed.",
        );
      setDirect("asked");
      window.dispatchEvent(
        new CustomEvent(PAYER_CHANGED_EVENT, { detail: { workspaceId } }),
      );
    } catch (cause) {
      setDirect(
        cause instanceof Error
          ? cause.message
          : "The change could not be confirmed. Nothing changed.",
      );
    }
  }

  const manage =
    canManage && workspaceId ? (
      <WorkspaceBillingControls
        key={workspaceId}
        workspaceId={workspaceId}
        transport={transport}
        navigate={navigate}
      />
    ) : (
      <p className={styles.note}>
        Only the business owner can reach the card and receipts.
      </p>
    );

  if (!billing || billing.state === "none")
    return (
      <section className={styles.section} aria-labelledby="plan-heading">
        <div className={styles.brief}>
          <XaHeadline
            id="plan-heading"
            quiet="Your website and inquiries keep running while it moves."
          >
            {name}’s billing isn’t set up here yet.
          </XaHeadline>
        </div>
        <XaSays
          links={[
            <XaTextLink key="details" href={backHref}>
              Business details
            </XaTextLink>,
          ]}
        >
          Strelva is moving your existing agreement here. Until then nothing new
          is charged, and your card stays where it is.
        </XaSays>
      </section>
    );

  const sites = billing.sites.length
    ? billing.sites.map((site) => site.siteName).join(", ")
    : "No website is listed under this plan yet.";
  const paidThrough = billing.paidThrough ? day(billing.paidThrough) : null;
  return (
    <section className={styles.section} aria-labelledby="plan-heading">
      <div className={styles.brief}>
        {pastDue ? (
          <XaHeadline
            id="plan-heading"
            quiet="Your website and inquiries keep running."
          >
            {agencyPays
              ? `${agencyName}’s last payment for ${name} didn’t go through.`
              : `${name}’s last payment didn’t go through.`}
          </XaHeadline>
        ) : (
          <XaHeadline
            id="plan-heading"
            quiet={
              agencyPays
                ? `${agencyName} pays for it and keeps the receipts.`
                : `${payer} pays, and Stripe keeps the card and receipts.`
            }
          >
            {paidThrough
              ? `${name} is paid through ${paidThrough}.`
              : `${name}’s plan ${planState(billing.paymentStatus)}.`}
          </XaHeadline>
        )}
      </div>
      {pastDue ? (
        <XaSays
          links={
            agencyPays
              ? canManage && workspaceId && direct === "idle"
                ? [
                    <XaTextLink key="direct" onClick={() => void payDirectly()}>
                      Pay for it yourself instead
                    </XaTextLink>,
                  ]
                : undefined
              : [
                  <XaTextLink key="manage" href="#manage-plan">
                    Update the card
                  </XaTextLink>,
                ]
          }
        >
          {agencyPays
            ? `Stripe couldn’t take ${agencyName}'s payment for this plan.`
            : "Stripe couldn’t take the payment from your card."}
          {agencyPays && direct === "busy" ? " Asking…" : ""}
          {agencyPays && direct === "asked"
            ? " You asked to pay for it yourself from now on. It waits under Who pays."
            : ""}
          {agencyPays && !["idle", "busy", "asked"].includes(direct)
            ? ` ${direct}`
            : ""}
        </XaSays>
      ) : null}
      <XaAnswers
        labelWidth={120}
        rows={[
          ["Plan", planLine(billing)],
          ["Covers", sites],
          ...(pastDue
            ? [
                [
                  "Payment",
                  <XaStatus key="due" kind="waits" size="sm">
                    Needs a new card
                  </XaStatus>,
                ] as const,
              ]
            : []),
        ]}
      />
      {billing.grandfatheredTerms ? (
        <p className={styles.body}>{billing.grandfatheredTerms}</p>
      ) : null}
      {agencyPays ? (
        <p className={styles.note}>
          {agencyName} manages the card and receipts for this plan.
        </p>
      ) : (
        manage
      )}
    </section>
  );
}

/** Session creation opens Stripe; the owner confirms any billing change there. */
function WorkspaceBillingControls({
  workspaceId,
  transport = fetch,
  navigate = (url: string) => window.location.assign(url),
}: {
  workspaceId: string;
  transport?: Transport;
  navigate?: (url: string) => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState<"manage" | "cancel" | null>(null);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      pending.current?.abort();
      pending.current = null;
    },
    [],
  );

  async function open(action: "manage" | "cancel") {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(action);
    setError("");
    try {
      const response = await transport("/api/workspace/billing-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, action }),
        signal: controller.signal,
      });
      const body = (await response.json()) as {
        portalUrl?: string;
        error?: string;
      };
      if (controller.signal.aborted) return;
      if (!response.ok || !body?.portalUrl)
        throw new Error(
          body?.error ||
            "Stripe couldn’t be opened. Nothing changed.",
        );
      const url = new URL(body.portalUrl);
      if (
        url.protocol !== "https:" ||
        url.hostname !== "billing.stripe.com" ||
        url.username ||
        url.password
      )
        throw new Error(
          "Stripe sent back a link Strelva doesn’t trust. Nothing changed.",
        );
      navigate(body.portalUrl);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Stripe couldn’t be opened. Nothing changed.",
      );
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(null);
      }
    }
  }

  return (
    <div id="manage-plan" className={styles.section}>
      <div className={styles.actions}>
        <XaButton
          busy={busy === "manage"}
          disabled={Boolean(busy)}
          onClick={() => void open("manage")}
        >
          Card and receipts
        </XaButton>
        {!reviewing ? (
          <XaButton
            variant="quiet"
            disabled={Boolean(busy)}
            onClick={() => {
              setReviewing(true);
              setError("");
            }}
          >
            End the plan
          </XaButton>
        ) : null}
      </div>
      {reviewing ? (
        <div
          className={styles.waiting}
          role="group"
          aria-label="End the plan"
        >
          <p className={styles.body}>
            Stripe shows the day the plan would end, and you confirm it there.
            Until you do, the plan keeps running. Leaving Strelva doesn’t
            end it on its own.
          </p>
          <div className={styles.actions}>
            <XaButton
              size="sm"
              busy={busy === "cancel"}
              disabled={Boolean(busy)}
              onClick={() => void open("cancel")}
            >
              Continue to Stripe
            </XaButton>
            <XaButton
              size="sm"
              variant="quiet"
              disabled={Boolean(busy)}
              onClick={() => setReviewing(false)}
            >
              Keep my plan
            </XaButton>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className={styles.critical} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
