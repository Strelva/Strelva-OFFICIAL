"use client";

import { useCallback, useEffect, useState } from "react";
import { StEmpty, StNotice, StPill, StSection, StSkeleton, StState, StTextButton } from "@/components/ui/strelva/Kit";
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

  return <StSection title="Agency website preparation" id="agency-website-permission-title">
    <p className="m-0 text-sm leading-relaxed text-gray-muted">Allow the operator assigned to this delivery to prepare website changes. Publishing still requires your approval. This does not grant business membership.</p>
    {state === "loading" ? <StSkeleton label="Checking the current permission" width="65%" /> : null}
    {state === "error" ? <><StNotice tone="critical">{error}</StNotice><StTextButton onClick={() => setReload((value) => value + 1)}>Retry</StTextButton></> : null}
    {state === "ready" && grant && active ? <><StState kind="live">Draft preparation is enabled</StState><p className="m-0 text-sm text-gray-muted">The named operator can prepare drafts until {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(grant.expiresAt))}.</p><div className="flex flex-wrap items-center gap-4"><StPill variant="soft" busy={busy} onClick={() => void change("revoke")}>Remove draft access</StPill>{websiteHref ? <StTextButton href={websiteHref}>Review and publish in website editor</StTextButton> : null}</div></> : null}
    {state === "ready" && grant && !active ? <><StNotice tone="need">Draft preparation is revoked or expired. Existing website history remains recorded.</StNotice><StPill busy={busy} onClick={() => void change("grant")}>Allow website draft changes</StPill></> : null}
    {state === "ready" && !grant ? <StEmpty action={<StPill busy={busy} onClick={() => void change("grant")}>Allow website draft changes</StPill>}>The named operator does not have draft preparation access.</StEmpty> : null}
    {error && state === "ready" ? <StNotice tone="critical">{error}</StNotice> : null}
  </StSection>;
}
