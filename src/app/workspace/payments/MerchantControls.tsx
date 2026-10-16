"use client";
import { useEffect, useRef, useState } from "react";
import {
  XaAnswers,
  XaButton,
  XaLabel,
  XaSays,
  XaStatus,
  XaTextLink,
} from "@/components/ui/strelva/Xa";
import styles from "@/experience/workspace/money/money.module.css";

/** The business's own Stripe account: where it stands, one way forward, and what Strelva never does with the money. */
export default function MerchantControls({
  workspaceId,
  state,
  returnTo = "payments",
}: {
  workspaceId: string;
  state: string;
  returnTo?: "payments" | "payment-links";
}) {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function check() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/billing/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, action: "refresh" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!active.current) return;
      if (!response.ok)
        throw Error(result.error ?? "Stripe status is unavailable.");
      setMessage(
        result?.state === "ready"
          ? "Stripe says your account is ready."
          : result?.state === "restricted"
            ? "Stripe still needs a few details from you."
            : "You haven't started on Stripe yet.",
      );
    } catch (e) {
      if (active.current)
        setMessage(
          e instanceof Error ? e.message : "Stripe status is unavailable.",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("connect") === "return")
      void check();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function change(action: "onboard" | "disconnect") {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/billing/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          action,
          returnTo,
          configurations: ["merchant"],
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!active.current) return;
      if (!response.ok)
        throw Error(result.error ?? "Stripe setup is unavailable.");
      if (action === "disconnect") {
        setMessage(
          "Payments no longer go through Strelva. Your Stripe account and past payments stay yours.",
        );
        return;
      }
      if (typeof result.url !== "string")
        throw Error("Stripe setup is unavailable. Sign in and try again.");
      const url = new URL(result.url);
      if (
        url.protocol !== "https:" ||
        !(url.hostname === "stripe.com" || url.hostname.endsWith(".stripe.com"))
      )
        throw Error("Stripe setup returned an invalid link.");
      window.location.assign(url.toString());
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Stripe setup is unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  const ready = state === "ready";
  const [stopping, setStopping] = useState(false);
  return (
    <section className={styles.section} aria-labelledby="stripe-heading">
      <div className={styles.sectionHead}>
        <XaLabel as="h2" id="stripe-heading">
          Your Stripe account
        </XaLabel>
        {state === "disconnected" ? (
          <XaStatus kind="draft" size="sm">
            Stopped
          </XaStatus>
        ) : ready ? null : (
          <XaStatus kind="waits" size="sm">
            Setup not finished
          </XaStatus>
        )}
      </div>
      <p className={styles.body}>
        {state === "disconnected"
          ? "Payments don't go through Strelva any more. Your Stripe account and past payments stay yours."
          : ready
            ? "Ready to take payments for the quotes you agree and the bookings you hold."
            : "Stripe decides when your account can take payments. Continue there to see what it still needs."}
      </p>
      {state !== "disconnected" ? (
        <div className={styles.actions}>
          {!ready ? (
            <XaButton
              variant="primary"
              busy={busy}
              disabled={busy}
              onClick={() => change("onboard")}
            >
              Continue Stripe setup
            </XaButton>
          ) : (
            <XaButton
              size="sm"
              disabled={busy}
              onClick={() => change("onboard")}
            >
              Update Stripe details
            </XaButton>
          )}
          <XaTextLink
            onClick={() => {
              if (!busy) void check();
            }}
          >
            Check Stripe status
          </XaTextLink>
          {ready ? (
            <>
              <XaTextLink
                onClick={() => {
                  if (!busy) setStopping(true);
                }}
              >
                Stop taking payments here
              </XaTextLink>
            </>
          ) : null}
        </div>
      ) : null}
      {ready && stopping ? (
        <div
          className={styles.actions}
          role="group"
          aria-label="Stop taking payments here"
        >
          <span className={styles.body}>
            New payments stop going through Strelva. Past payments stay in your
            Stripe account.
          </span>
          <XaButton
            size="sm"
            busy={busy}
            disabled={busy}
            onClick={() => {
              setStopping(false);
              void change("disconnect");
            }}
          >
            Stop payments
          </XaButton>
          <XaButton
            size="sm"
            variant="quiet"
            disabled={busy}
            onClick={() => setStopping(false)}
          >
            Keep them
          </XaButton>
        </div>
      ) : null}
      {message ? <XaSays>{message}</XaSays> : null}
      <XaAnswers
        labelWidth={120}
        rows={[
          [
            "Payouts",
            <>
              Stripe pays your bank on its own schedule.{" "}
              <a
                className={styles.detailsToggle}
                href="https://dashboard.stripe.com/payouts"
                target="_blank"
                rel="noreferrer"
              >
                See payouts in Stripe
              </a>
            </>,
          ],
          [
            "Fees",
            "Stripe's fees apply. Strelva takes no fee on these payments.",
          ],
          [
            "Refunds",
            <>
              Only when you ask. The money goes back to the original card, and
              Stripe confirms the final status.{" "}
              <a
                className={styles.detailsToggle}
                href="https://dashboard.stripe.com"
                target="_blank"
                rel="noreferrer"
              >
                Open Stripe
              </a>
            </>,
          ],
        ]}
      />
    </section>
  );
}
