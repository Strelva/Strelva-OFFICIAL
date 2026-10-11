"use client";

import { agencyWebsiteContextSchema, type AgencyWebsiteContext } from "@/platform/offerings/agency-website-context-contracts";
import { useCallback, useEffect, useState } from "react";
import { StEmpty, StNotice, StPill, StSection, StSkeleton, StState, StTextButton } from "@/components/ui/strelva/Kit";
import { agencyManagedWebsiteDraftGrantSchema, type AgencyManagedWebsiteDraftGrant } from "@/platform/offerings/agency-website-draft-contracts";

function message(value: unknown, fallback: string): string {
  return value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : fallback;
}

export function AgencyWebsiteCustomerControls({ deliveryId, bindingId, customerWebsiteHref }: { deliveryId: string; bindingId: string; customerWebsiteHref?: string | null }) {
  const [context, setContext] = useState<AgencyWebsiteContext | null>(null);
  const [grant, setGrant] = useState<AgencyManagedWebsiteDraftGrant | null>(null);
  const [websiteHref, setWebsiteHref] = useState<string | null>(customerWebsiteHref ?? null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState<number | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    setState("loading");
    setGrant(null);
    setContext(null);
    setError("");
    const response = await fetch(`/api/agency-website-draft-access?bindingId=${encodeURIComponent(bindingId)}`, { cache: "no-store", signal });
    const body = await response.json().catch(() => null) as { grant?: unknown; customerWebsiteHref?: unknown } | null;
    if (!response.ok) throw new Error(message(body, "Website draft permission could not be confirmed."));
    if (signal.aborted) return;
    const currentGrant = body?.grant ? agencyManagedWebsiteDraftGrantSchema.parse(body.grant) : null;
    if (currentGrant && (currentGrant.managedWebsiteBindingId !== bindingId || currentGrant.deliveryId !== deliveryId)) throw new Error("Website permission belongs to another delivery.");
    setGrant(currentGrant);
    setWebsiteHref(typeof body?.customerWebsiteHref === "string" ? body.customerWebsiteHref : customerWebsiteHref ?? null);
    const contextResponse = await fetch(`/api/agency-website-draft-access?${new URLSearchParams({ bindingId, deliveryId, context: "1" })}`, { cache: "no-store", signal });
    const identityBody = await contextResponse.json().catch(() => null);
    if (!contextResponse.ok) throw new Error("The assigned agency and person could not be verified. No new access can be granted.");
    const identity = agencyWebsiteContextSchema.parse(identityBody?.context);
    if (identity.bindingId !== bindingId || identity.deliveryId !== deliveryId) throw new Error("Website permission identity belongs to another delivery.");
    if (signal.aborted) return;
    setContext(identity);
    setState("ready");
  }, [bindingId, deliveryId, customerWebsiteHref]);

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
    if (action === "grant" && !context) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/agency-website-draft-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "grant" ? { action, deliveryId, bindingId, agencyWorkspaceId: context?.agencyWorkspaceId, operatorUserId: context?.operatorUserId } : { action, grantId: grant?.id }),
      });
      const body = await response.json().catch(() => null) as { grant?: unknown; customerWebsiteHref?: unknown } | null;
      if (!response.ok) throw new Error(message(body, "The website draft permission could not be changed."));
      const confirmed = agencyManagedWebsiteDraftGrantSchema.parse(body?.grant);
      if (confirmed.managedWebsiteBindingId !== bindingId || confirmed.deliveryId !== deliveryId || (action === "grant" && (confirmed.agencyWorkspaceId !== context?.agencyWorkspaceId || confirmed.operatorUserId !== context?.operatorUserId)) || (action === "revoke" && (confirmed.id !== grant?.id || confirmed.status !== "revoked"))) throw new Error("Website permission receipt could not be confirmed. Reload before changing access.");
      setGrant(confirmed);
      if (typeof body?.customerWebsiteHref === "string") setWebsiteHref(body.customerWebsiteHref);
      setState("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The website draft permission could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  return <StSection title="Agency website preparation" id="agency-website-permission-title">
    <p className="m-0 text-sm leading-relaxed text-gray-muted">{context ? `Allow ${context.agencyName} to prepare drafts for ${context.websiteName}. Assigned person: ${context.personName}.` : "Verify the assigned agency and person before allowing website preparation."} Publishing still requires your approval. This does not grant business membership.</p>
    {state === "loading" ? <StSkeleton label="Checking the current permission" width="65%" /> : null}
    {state === "error" ? <><StNotice tone="critical">{error}</StNotice>{grant && active ? <StPill variant="soft" busy={busy} onClick={() => void change("revoke")}>Remove draft access</StPill> : null}<StTextButton onClick={() => setReload((value) => value + 1)}>Retry</StTextButton></> : null}
    {state === "ready" && grant && active ? <><StState kind="live">Draft preparation is enabled</StState><p className="m-0 text-sm text-gray-muted">{context?.agencyName} · {context?.personName} can prepare drafts until {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(grant.expiresAt))}.</p><div className="flex flex-wrap items-center gap-4"><StPill variant="soft" busy={busy} onClick={() => void change("revoke")}>Remove draft access</StPill>{websiteHref ? <StTextButton href={websiteHref}>Review and publish in website editor</StTextButton> : null}</div></> : null}
    {state === "ready" && grant && !active ? <><StNotice tone="need">Draft preparation is revoked or expired. Existing website history remains recorded.</StNotice><StPill busy={busy} disabled={!context} onClick={() => void change("grant")}>Allow {context?.agencyName || "agency"} to prepare drafts</StPill></> : null}
    {state === "ready" && !grant ? <StEmpty action={<StPill busy={busy} disabled={!context} onClick={() => void change("grant")}>Allow {context?.agencyName || "agency"} to prepare drafts</StPill>}>{context?.agencyName} · {context?.personName} does not have draft preparation access.</StEmpty> : null}
    {error && state === "ready" ? <StNotice tone="critical">{error}</StNotice> : null}
  </StSection>;
}
