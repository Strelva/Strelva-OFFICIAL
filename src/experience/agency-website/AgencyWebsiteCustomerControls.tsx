"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { agencyManagedWebsiteDraftGrantSchema, type AgencyManagedWebsiteDraftGrant } from "@/platform/offerings/agency-website-draft-contracts";

function message(value: unknown, fallback: string): string {
  return value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : fallback;
}

export function AgencyWebsiteCustomerControls({ deliveryId, bindingId, customerWebsiteHref }: { deliveryId: string; bindingId: string; customerWebsiteHref?: string | null }) {
  const [grant, setGrant] = useState<AgencyManagedWebsiteDraftGrant | null>(null);
  const [websiteHref, setWebsiteHref] = useState<string | null>(customerWebsiteHref ?? null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState<number | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    setState("loading");
    setError("");
    const response = await fetch(`/api/agency-website-draft-access?bindingId=${encodeURIComponent(bindingId)}`, { cache: "no-store", signal });
    const body = await response.json().catch(() => null) as { grant?: unknown; customerWebsiteHref?: unknown } | null;
    if (!response.ok) throw new Error(message(body, "Website draft permission could not be confirmed."));
    if (signal.aborted) return;
    setGrant(body?.grant ? agencyManagedWebsiteDraftGrantSchema.parse(body.grant) : null);
    setWebsiteHref(typeof body?.customerWebsiteHref === "string" ? body.customerWebsiteHref : customerWebsiteHref ?? null);
    setState("ready");
  }, [bindingId, customerWebsiteHref]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((cause) => {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "Website draft permission could not be confirmed.");
      setState("error");
    });
    return () => controller.abort();
  }, [load, reload]);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const active = Boolean(grant && now !== null && grant.status === "active" && Number.isFinite(Date.parse(grant.expiresAt)) && Date.parse(grant.expiresAt) > now);

  async function change(action: "grant" | "revoke") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/agency-website-draft-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "grant" ? { action, deliveryId, bindingId } : { action, grantId: grant?.id }),
      });
    const body = await response.json().catch(() => null) as { grant?: unknown; customerWebsiteHref?: unknown } | null;
      if (!response.ok) throw new Error(message(body, "The website draft permission could not be changed."));
    setGrant(body?.grant ? agencyManagedWebsiteDraftGrantSchema.parse(body.grant) : null);
    if (typeof body?.customerWebsiteHref === "string") setWebsiteHref(body.customerWebsiteHref);
    setState("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The website draft permission could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="rounded-xl border border-gray-border bg-white p-5" aria-labelledby="agency-website-permission-title">
    <h2 id="agency-website-permission-title" className="text-base font-medium text-warm-black">Agency website preparation</h2>
    <p className="mt-2 text-sm leading-relaxed text-gray-muted">Name the operator on the accepted website delivery so they can prepare a draft revision. Publication and customer membership remain under your native website controls.</p>
    {state === "loading" ? <p role="status" className="mt-4 text-sm text-gray-muted">Checking the current permission…</p> : null}
    {state === "error" ? <div className="mt-4 space-y-3"><p role="alert" className="text-sm text-critical">{error}</p><Button variant="secondary" onClick={() => setReload((value) => value + 1)}>Retry</Button></div> : null}
    {state === "ready" && grant && active ? <div className="mt-4 space-y-3"><p className="text-sm text-warm-black">Draft preparation is enabled for the named operator. It expires at {grant.expiresAt}.</p><Button variant="secondary" disabled={busy} onClick={() => void change("revoke")}>Revoke draft preparation</Button>{websiteHref ? <Link className="block text-sm text-warm-black underline underline-offset-4" href={websiteHref}>Review and publish in website editor</Link> : null}</div> : null}
    {state === "ready" && grant && !active ? <div className="mt-4 space-y-3"><p className="text-sm text-gray-muted">Draft preparation is revoked or expired. Existing website history remains recorded.</p><Button className="mt-1" disabled={busy} onClick={() => void change("grant")}>Grant draft preparation</Button></div> : null}
    {state === "ready" && !grant ? <Button className="mt-4" disabled={busy} onClick={() => void change("grant")}>Grant draft preparation</Button> : null}
    {error && state === "ready" ? <p role="alert" className="mt-3 text-sm text-critical">{error}</p> : null}
  </section>;
}
