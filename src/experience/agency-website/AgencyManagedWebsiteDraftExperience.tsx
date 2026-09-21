"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TextArea, TextInput } from "@/components/ui/TextInput";
import {
  agencyManagedWebsiteDraftGrantSchema,
  agencyWebsiteDraftStateSchema,
  type AgencyManagedWebsiteDraftGrant,
  type AgencyWebsiteDraftState,
} from "@/platform/offerings/agency-website-draft-contracts";

function errorMessage(value: unknown, fallback: string): string {
  if (value && typeof value === "object" && "error" in value && typeof value.error === "string") return value.error;
  return fallback;
}

function parseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

type DraftReceipt = {
  section: string;
  revision: number | null;
  revisionId?: string;
  dataHash?: string;
};

function receiptFrom(value: unknown, section: string): DraftReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const outer = value as Record<string, unknown>;
  const candidate = outer.websiteDraft && typeof outer.websiteDraft === "object" && !Array.isArray(outer.websiteDraft)
    ? outer.websiteDraft as Record<string, unknown>
    : outer;
  const revision = typeof candidate.revision === "number" && Number.isInteger(candidate.revision) ? candidate.revision : null;
  return {
    section: typeof candidate.section === "string" && candidate.section.trim() ? candidate.section : section,
    revision,
    ...(typeof candidate.revisionId === "string" ? { revisionId: candidate.revisionId } : {}),
    ...(typeof candidate.dataHash === "string" ? { dataHash: candidate.dataHash } : {}),
  };
}

export function AgencyManagedWebsiteDraftExperience({ bindingId, section = "hero" }: { bindingId: string; section?: string }) {
  const [grant, setGrant] = useState<AgencyManagedWebsiteDraftGrant | null>(null);
  const [state, setState] = useState<AgencyWebsiteDraftState | null>(null);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState<number | null>(null);
  const [customerWebsiteHref, setCustomerWebsiteHref] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<DraftReceipt | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    setStatus("loading");
    setMessage("");
    const response = await fetch(`/api/agency-website-draft-access?bindingId=${encodeURIComponent(bindingId)}&section=${encodeURIComponent(section)}`, { cache: "no-store", signal });
    const body = await response.json().catch(() => null) as unknown;
    if (!response.ok) throw new Error(errorMessage(body, "Managed website draft access could not be confirmed."));
    const value = body && typeof body === "object" ? body as { grant?: unknown; state?: unknown; customerWebsiteHref?: unknown } : {};
    const nextGrant = value.grant ? agencyManagedWebsiteDraftGrantSchema.parse(value.grant) : null;
    const nextState = value.state ? agencyWebsiteDraftStateSchema.parse(value.state) : null;
    if (signal.aborted) return;
    setGrant(nextGrant);
    setState(nextState);
    setCustomerWebsiteHref(typeof value.customerWebsiteHref === "string" ? value.customerWebsiteHref : null);
    setDraft(nextState ? JSON.stringify(nextState.data, null, 2) : "{}");
    setStatus("ready");
  }, [bindingId, section]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((cause) => {
      if (!controller.signal.aborted) {
        setStatus("error");
        setMessage(cause instanceof Error ? cause.message : "Managed website draft access could not be confirmed.");
      }
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
  const parsed = useMemo(() => parseJson(draft), [draft]);

  function fieldValue(key: string): string {
    const value = parsed?.[key];
    return typeof value === "string" ? value : "";
  }

  function updateField(key: string, value: string) {
    setDraft((current) => JSON.stringify({ ...(parseJson(current) ?? {}), [key]: value }, null, 2));
  }

  async function prepareAndRun() {
    if (!grant || !state || !active) return;
    if (!parsed) {
      setMessage("Enter a JSON object for this native website section.");
      return;
    }
    setSaving(true);
    setMessage("");
    setReceipt(null);
    try {
      const prepareResponse = await fetch("/api/agency-website-draft-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepare", assignmentId: grant.assignmentId, bindingId, section, data: parsed, expectedRevision: state.revision, expectedHash: state.dataHash }),
      });
      const prepareBody = await prepareResponse.json().catch(() => null) as unknown;
      if (!prepareResponse.ok) throw new Error(errorMessage(prepareBody, "The draft could not be prepared."));
      const runResponse = await fetch("/api/operational-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", assignmentId: grant.assignmentId }),
      });
      const runBody = await runResponse.json().catch(() => null) as unknown;
      if (!runResponse.ok) throw new Error(errorMessage(runBody, "The assigned draft command could not be run."));
      const responsibility = runBody && typeof runBody === "object" && "responsibility" in runBody ? runBody.responsibility : null;
      const payload = responsibility && typeof responsibility === "object" && "payload" in responsibility ? responsibility.payload : null;
      const steps = payload && typeof payload === "object" && "steps" in payload && Array.isArray(payload.steps) ? payload.steps : [];
      const last = steps.at(-1);
      const result = last && typeof last === "object" && "result" in last ? last.result : null;
      setReceipt(receiptFrom(result, section));
      const controller = new AbortController();
      await load(controller.signal);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "The draft command could not be completed.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="min-h-screen bg-surface">
    <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 lg:py-12">
      <header className="max-w-2xl space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent-text">Managed website draft</p>
        <h1 className="font-display text-3xl font-medium text-warm-black sm:text-4xl">Prepare a website update</h1>
        <p className="text-sm leading-relaxed text-gray-muted">Edit the <strong>{section === "hero" ? "home page introduction" : section}</strong> and save a draft for the customer to review.</p>
      </header>
      {status === "loading" ? <p role="status" className="mt-8 text-sm text-gray-muted">Checking the current website permission…</p> : null}
      {status === "error" ? <div role="alert" className="mt-8 space-y-3 text-sm text-critical"><p>{message}</p><Button variant="secondary" onClick={() => { setReload((value) => value + 1); }}>Reload permission</Button></div> : null}
      {status === "ready" && !grant ? <p role="status" className="mt-8 rounded-xl border border-gray-border p-5 text-sm leading-relaxed text-gray-muted">The customer needs to enable draft editing before you can update this website.</p> : null}
      {status === "ready" && grant && !active ? <p role="status" className="mt-8 rounded-xl border border-gray-border p-5 text-sm leading-relaxed text-gray-muted">This draft permission is revoked or expired. No new preparation or execution is available. Existing website history remains with the customer.</p> : null}
      {status === "ready" && grant && active && state ? <section className="mt-8 space-y-5" aria-labelledby="managed-website-draft-title">
        <div className="rounded-xl border border-gray-border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 id="managed-website-draft-title" className="text-base font-medium text-warm-black">{section} draft</h2><p className="mt-1 text-xs text-gray-muted">Version {state.revision}. If the customer changes this section, reload it before saving.</p></div>
            {customerWebsiteHref ? <Link className="min-h-11 inline-flex items-center rounded-lg px-3 text-sm text-warm-black underline underline-offset-4" href={customerWebsiteHref}>Open customer website editor</Link> : <span className="text-xs text-gray-muted">Customer editor link unavailable</span>}
          </div>
          {section === "hero" ? <div className="mt-5 grid gap-4">
            <TextInput id="managed-website-hero-headline" label="Headline" value={fieldValue("headline")} onChange={(event) => updateField("headline", event.target.value)} maxLength={10_000} required disabled={saving} />
            <TextArea id="managed-website-hero-subheadline" label="Supporting text" value={fieldValue("subheadline")} onChange={(event) => updateField("subheadline", event.target.value)} maxLength={10_000} rows={3} disabled={saving} />
            <TextInput id="managed-website-hero-tagline" label="Tagline" value={fieldValue("tagline")} onChange={(event) => updateField("tagline", event.target.value)} maxLength={10_000} disabled={saving} />
            <div className="grid gap-4 sm:grid-cols-2"><TextInput id="managed-website-hero-cta-text" label="Button text" value={fieldValue("ctaText")} onChange={(event) => updateField("ctaText", event.target.value)} maxLength={10_000} required disabled={saving} /><TextInput id="managed-website-hero-cta-link" label="Button link" value={fieldValue("ctaLink")} onChange={(event) => updateField("ctaLink", event.target.value)} maxLength={10_000} disabled={saving} /></div>
          </div> : null}
          <details className="mt-5 rounded-lg border border-gray-border bg-surface p-3">
            <summary className="cursor-pointer text-sm font-medium text-warm-black">Advanced section data</summary>
            <TextArea id="managed-website-draft-json" className="mt-3 font-mono text-xs" label={section === "hero" ? "Optional JSON for fields outside this editor" : "Section data"} value={draft} onChange={(event) => setDraft(event.target.value)} rows={10} spellCheck={false} helperText="Keep this data for the assigned section only. The saved result remains a draft until the customer reviews and publishes it." />
          </details>
          <p className="mt-3 text-xs leading-relaxed text-gray-muted">The customer reviews and publishes your draft. Saving here does not change the live website.</p>
          <Button className="mt-5" disabled={saving || !parsed} onClick={() => void prepareAndRun()}>{saving ? "Saving assigned draft…" : "Prepare and save draft"}</Button>
        </div>
        {message ? <p role="alert" className="text-sm text-critical">{message}</p> : null}
        {receipt ? <section className="rounded-xl border border-gray-border bg-white p-5 text-sm text-warm-black" aria-label="Draft receipt"><p className="font-medium">Saved {receipt.section} draft{receipt.revision === null ? "" : ` revision ${receipt.revision}`}</p><p className="mt-1 text-xs leading-relaxed text-gray-muted">Your draft is saved and ready for the customer to review.</p>{customerWebsiteHref ? <Link className="mt-3 inline-flex text-sm underline underline-offset-4" href={customerWebsiteHref}>Review and publish in customer website editor</Link> : null}</section> : null}
      </section> : null}
    </div>
  </main>;
}
