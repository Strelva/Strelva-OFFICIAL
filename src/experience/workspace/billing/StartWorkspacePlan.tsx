"use client";

import { useState } from "react";
import { StNotice, StPill, StSection } from "@/components/ui/strelva/Kit";

type Transport = (input: string, init?: RequestInit) => Promise<Response>;

/** The owner starts the business's own plan (ADR 0015). Checkout happens on Stripe; nothing is charged here. */
export function StartWorkspacePlan({ workspaceId, transport = fetch, navigate = (url: string) => window.location.assign(url) }: { workspaceId: string; transport?: Transport; navigate?: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    setBusy(true); setError("");
    try {
      const response = await transport("/api/workspace/billing-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId }) });
      const body = await response.json() as { checkoutUrl?: string; error?: string };
      if (!response.ok || !body.checkoutUrl) throw new Error(body.error || "Checkout couldn't be opened. Nothing was charged.");
      navigate(body.checkoutUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout couldn't be opened. Nothing was charged.");
      setBusy(false);
    }
  }
  return <StSection title="Run your business on Strelva" meta="Your plan includes monthly usage. Building pauses at the limit instead of charging more. You can bring in an agency anytime.">
    <StPill busy={busy} disabled={busy} onClick={() => void start()}>Start your plan</StPill>
    {error ? <StNotice tone="critical">{error}</StNotice> : null}
  </StSection>;
}
