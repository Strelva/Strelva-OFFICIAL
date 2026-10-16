"use client";
import { useEffect, useRef, useState } from "react";
import { XaButton, XaEmpty, XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import styles from "@/experience/workspace/money/money.module.css";

/** Connect the agency's own Stripe account, then come back to Payment links. */
export function AgencyMerchantSetup({ agencyWorkspaceId, onChange }: { agencyWorkspaceId: string; onChange?: () => void }) {
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function post(action: "onboard" | "refresh") {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/billing/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: agencyWorkspaceId, action, configurations: ["merchant"], returnTo: "payment-links" }) });
      const result = await response.json().catch(() => ({}));
      if (!active.current) return;
      if (!response.ok) throw Error(result.error ?? "Stripe setup is unavailable.");
      if (action === "refresh") {
        setMessage(result?.state === "ready" ? "Stripe account ready." : result?.state === "restricted" ? "Stripe still needs details. Continue Stripe setup." : "Stripe setup has not started.");
        if (result?.state === "ready") onChange?.();
        return;
      }
      if (typeof result.url !== "string") throw Error("Stripe setup is unavailable. Sign in and try again.");
      const url = new URL(result.url);
      if (url.protocol !== "https:" || !(url.hostname === "stripe.com" || url.hostname.endsWith(".stripe.com"))) throw Error("Stripe setup returned an invalid link.");
      window.location.assign(url.toString());
    } catch (cause) {
      if (active.current) setMessage(cause instanceof Error ? cause.message : "Stripe setup is unavailable.");
    } finally { if (active.current) setBusy(false); }
  }
  useEffect(() => { if (new URLSearchParams(window.location.search).get("connect") === "return") void post("refresh"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className={styles.section}>
    <XaEmpty pose="adds" size="sm" title="Connect Stripe to make payment links." job="Pebble checks Stripe again the moment you come back"
      action={<XaButton variant="primary" busy={busy} disabled={busy} onClick={() => void post("onboard")}>Set up Stripe</XaButton>}
      secondary={<XaTextLink onClick={() => { if (!busy) void post("refresh"); }}>Check Stripe status</XaTextLink>}>
      Money goes straight to your agency&apos;s Stripe account; Strelva never holds it. Stripe&apos;s fees apply. Strelva charges no fee on these payments.
    </XaEmpty>
    {message ? <XaSays>{message}</XaSays> : null}
  </div>;
}
