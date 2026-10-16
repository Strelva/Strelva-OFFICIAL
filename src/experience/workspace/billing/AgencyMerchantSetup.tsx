"use client";
import { useEffect, useRef, useState } from "react";
import { XaButton, XaPebbleScene } from "@/components/ui/strelva/Xa";
import styles from "@/experience/workspace/money/money.module.css";

/** Connect the agency's own Stripe account, then come back to Payment links. */
export function AgencyMerchantSetup({
  agencyWorkspaceId,
  onChange,
}: {
  agencyWorkspaceId: string;
  onChange?: () => void;
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

  async function post(action: "onboard" | "refresh", quietly = false) {
    setBusy(true);
    if (!quietly) setMessage(null);
    try {
      const response = await fetch("/api/billing/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: agencyWorkspaceId,
          action,
          configurations: ["merchant"],
          returnTo: "payment-links",
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!active.current) return;
      if (!response.ok)
        throw Error(result.error ?? "Stripe setup is unavailable.");
      if (action === "refresh") {
        if (!quietly || result?.state === "ready")
          setMessage(
            result?.state === "ready"
              ? "Stripe says your account is ready. You can make payment links now."
              : result?.state === "restricted"
                ? "Stripe still needs a few details. Continue Stripe setup to finish them."
                : "Stripe setup has not started yet.",
          );
        if (result?.state === "ready") onChange?.();
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
    } catch (cause) {
      if (active.current && !quietly)
        setMessage(
          cause instanceof Error
            ? cause.message
            : "Stripe setup is unavailable.",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("connect") === "return")
      void post("refresh");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Pebble's job here: check Stripe again whenever the agency comes back to this tab.
  const working = useRef(false);
  working.current = busy;
  useEffect(() => {
    let last = Date.now();
    const back = () => {
      if (document.visibilityState === "hidden" || working.current) return;
      if (Date.now() - last < 5000) return;
      last = Date.now();
      void post("refresh", true);
    };
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", back);
    return () => {
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", back);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className={styles.section} aria-labelledby="stripe-setup-heading">
      <div className={styles.pebbleBeside}>
        <XaPebbleScene pose="adds" size={140} />
        <div className={styles.brief}>
          <h2 id="stripe-setup-heading" className={styles.heading}>
            Connect Stripe to make payment links.
          </h2>
          <p className={styles.body}>
            Money goes straight to your agency&apos;s Stripe account; Strelva
            never holds it. Stripe&apos;s fees apply. Strelva charges no fee on
            these payments.
          </p>
          <p className={styles.body}>
            {message ??
              "I check Stripe again the moment you come back, and open payment links once Stripe says your account is ready."}
          </p>
        </div>
      </div>
      <div className={styles.actions}>
        <XaButton
          variant="primary"
          busy={busy}
          disabled={busy}
          onClick={() => void post("onboard")}
        >
          Set up Stripe
        </XaButton>
      </div>
    </section>
  );
}
