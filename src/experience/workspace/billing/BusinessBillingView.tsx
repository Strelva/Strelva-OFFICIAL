"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { BusinessBilling } from "@/platform/business-billing";
import {
  XaButton,
  XaEmpty,
  XaHeadline,
  XaSays,
  XaStatus,
  XaTextLink,
} from "@/components/ui/strelva/Xa";
import styles from "@/experience/workspace/money/money.module.css";

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
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

/** Owner billing projection (XA · R1). Card digits, next charge and receipts are absent from this read. */
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
  if (billing.state === "grandfathered") return "Your existing terms";
  if (billing.state === "comped") return "Comped";
  if (billing.state === "none") return "No plan price published yet";
  if (billing.state === "custom") return "Custom agreement";
  return "Strelva plan";
}
/** Who said the plan's terms (XA · R1 "Said by"). */
function planSaidBy(billing: BusinessBilling) {
  if (billing.state === "grandfathered" || billing.state === "custom")
    return "Your agreement";
  if (billing.state === "none") return "";
  return "Strelva";
}
const shortDay = (iso: string | null | undefined) => {
  const value = iso ? new Date(iso) : null;
  return value && Number.isFinite(value.getTime())
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(value)
    : "";
};

/** R1: each answer on its own line, the person or system that said it on the right. */
function SaidList({
  rows,
}: {
  rows: readonly { label: string; value: ReactNode; by: ReactNode }[];
}) {
  return (
    <dl className={styles.said}>
      <div className={styles.saidHead} aria-hidden="true">
        <span>Detail</span>
        <span>Said by</span>
      </div>
      {rows.map((row) => (
        <div key={row.label} className={styles.saidRow}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
          <dd className={styles.saidBy}>
            <span className={styles.saidWord}>Said by </span>
            {row.by}
          </dd>
        </div>
      ))}
    </dl>
  );
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

  if (!billing)
    return (
      <section className={styles.section} aria-labelledby="plan-heading">
        <XaHeadline id="plan-heading" quiet="One plan for the whole business.">
          Plan and billing
        </XaHeadline>
        <XaEmpty
          pose="alone"
          size="sm"
          title="No billing record is attached to this business yet."
          job="Your sites and inquiries keep running while billing is recorded"
        >
          The existing agreement and chosen payer need to be recorded.
        </XaEmpty>
        <p className={styles.note}>
          <XaTextLink href={backHref}>Business details</XaTextLink>
        </p>
        {canManage && workspaceId ? (
          <WorkspaceBillingControls
            key={workspaceId}
            workspaceId={workspaceId}
            transport={transport}
            navigate={navigate}
          />
        ) : (
          <p className={styles.note}>
            A business owner can manage payments and review cancellation here.
          </p>
        )}
      </section>
    );

  const priced = billing.state !== "none";
  const updated = shortDay(billing.paymentUpdatedAt);
  return (
    <section className={styles.section} aria-labelledby="plan-heading">
      <div className={styles.brief}>
        {priced ? (
          <XaHeadline
            id="plan-heading"
            quiet={`One plan for the whole business, paid by ${payer}.`}
          >
            {name} pays {money(billing.monthlyCents).replace(/\.00$/, "")} a
            month.
          </XaHeadline>
        ) : (
          <XaHeadline
            id="plan-heading"
            quiet="Nothing is charged until you see a price and agree to it."
          >
            No plan price published yet.
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
                      Pay directly instead
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
            ? `${agencyName}’s payment needs attention.`
            : "Your last payment did not go through."}{" "}
          Your sites and inquiry capture keep working.
          {agencyPays && direct === "busy" ? " Asking…" : ""}
          {agencyPays && direct === "asked"
            ? " You asked to pay directly for future jobs; accept it under Who pays."
            : ""}
          {agencyPays && !["idle", "busy", "asked"].includes(direct)
            ? ` ${direct}`
            : ""}
        </XaSays>
      ) : null}
      <SaidList
        rows={[
          {
            label: "Plan",
            value: priced ? (
              <>
                {planLine(billing)} ·{" "}
                <span className={styles.figure}>
                  {money(billing.monthlyCents).replace(/\.00$/, "")} / month
                </span>
              </>
            ) : (
              "No monthly price or plan is recorded."
            ),
            by: planSaidBy(billing),
          },
          {
            label: "Covers",
            value: (
              <>
                {name}
                <span className={styles.figureQuiet}>
                  {" "}
                  ·{" "}
                  {billing.sites.length
                    ? billing.sites.map((site) => site.siteName).join(", ")
                    : "No covered sites are recorded."}
                </span>
              </>
            ),
            by: "Strelva",
          },
          {
            label: "Payment",
            value: pastDue ? (
              <XaStatus kind="waits" size="sm">
                Needs attention
              </XaStatus>
            ) : billing.paidThrough ? (
              <>Paid through {day(billing.paidThrough)}</>
            ) : billing.paymentStatus === "active" ? (
              "The next charge date is not available in this record."
            ) : (
              billing.paymentStatus.replaceAll("_", " ")
            ),
            by: updated ? `Stripe · ${updated}` : "Stripe",
          },
          {
            label: "Paid by",
            value: payer,
            by: agencyPays ? agencyName : "Stripe",
          },
        ]}
      />
      {billing.grandfatheredTerms ? (
        <p className={styles.body}>{billing.grandfatheredTerms}</p>
      ) : null}
      {agencyPays ? (
        <p className={styles.note}>
          {agencyName} manages its payment method and keeps the receipts for
          this plan.
        </p>
      ) : canManage && workspaceId ? (
        <WorkspaceBillingControls
          key={workspaceId}
          workspaceId={workspaceId}
          transport={transport}
          navigate={navigate}
        />
      ) : (
        <p className={styles.note}>
          A business owner can manage payments and review cancellation here.
        </p>
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
            "Payment management could not be opened. No billing change was made.",
        );
      const url = new URL(body.portalUrl);
      if (
        url.protocol !== "https:" ||
        url.hostname !== "billing.stripe.com" ||
        url.username ||
        url.password
      )
        throw new Error(
          "Payment management returned an invalid link. No billing change was made.",
        );
      navigate(body.portalUrl);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Payment management could not be opened. No billing change was made.",
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
      <p className={styles.note}>
        Stripe holds your payment method and receipts. Any change needs your
        confirmation there.
      </p>
      <div className={styles.actions}>
        <XaButton
          busy={busy === "manage"}
          disabled={Boolean(busy)}
          onClick={() => void open("manage")}
        >
          Manage payments and receipts
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
            Review cancellation
          </XaButton>
        ) : null}
      </div>
      {reviewing ? (
        <div
          className={styles.waiting}
          role="group"
          aria-label="Review plan cancellation"
        >
          <p className={styles.body}>
            Continue to Stripe to review when your subscription ends and confirm
            cancellation. Leaving the workspace does not stop billing. Billing
            continues until cancellation is confirmed in Stripe.
          </p>
          <div className={styles.actions}>
            <XaButton
              size="sm"
              busy={busy === "cancel"}
              disabled={Boolean(busy)}
              onClick={() => void open("cancel")}
            >
              Continue to cancellation
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
