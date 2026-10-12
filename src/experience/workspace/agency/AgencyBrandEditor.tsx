"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { StNotice, StPill, StSkeleton, StTextButton, StTextField } from "@/components/ui/strelva/Kit";
import { OwnerBrandIdentity } from "@/components/brand/OwnerBrandIdentity";
import type { AgencyBrandInput } from "@/platform/infra/agency-brand";

export function AgencyBrandEditor({ workspaceId, request = fetch }: { workspaceId: string; request?: typeof fetch }) {
  return <ScopedAgencyBrandEditor key={workspaceId} workspaceId={workspaceId} request={request} />;
}

function ScopedAgencyBrandEditor({ workspaceId, request }: { workspaceId: string; request: typeof fetch }) {
  const [brand, setBrand] = useState<AgencyBrandInput | null>(null);
  const [status, setStatus] = useState("Loading your brand…");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [readingLogo, setReadingLogo] = useState(false);
  const logoReader = useRef<FileReader | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    request(`/api/workspace/agency-brand?workspaceId=${encodeURIComponent(workspaceId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async res => { const body = await res.json(); if (!res.ok || !body.brand) throw new Error(body.error || "Your brand is unavailable."); if (!controller.signal.aborted) { setBrand(body.brand); setStatus(""); setFailed(false); setUncertain(false); } })
      .catch(error => { if (!controller.signal.aborted) { setFailed(true); setStatus(error.message || "Your brand is unavailable. Try reading it again."); } });
    return () => controller.abort();
  }, [workspaceId, attempt, request]);
  useEffect(() => () => logoReader.current?.abort(), []);
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || uncertain || readingLogo) return; setBusy(true); setStatus("");
    try {
      const res = await request("/api/workspace/agency-brand", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, brand }) });
      const body = await res.json(); if (!res.ok || !body.brand) throw new Error(body.error || "The saved brand could not be confirmed."); setBrand(body.brand); setStatus("Brand saved. Owners see it on new emails, reports and pages.");
    } catch (error) { setUncertain(true); setStatus(`${error instanceof Error ? error.message : "The saved brand could not be confirmed."} Read the saved brand before trying again.`); }
    finally { setBusy(false); }
  }
  const readSaved = () => { setStatus("Reading your saved brand…"); setFailed(false); setAttempt(value => value + 1); };
  if (!brand) return failed ? <StNotice tone="critical">{status}<StTextButton onClick={readSaved}>Read saved brand</StTextButton></StNotice> : <StSkeleton label={status} />;
  const disabled = busy || readingLogo || uncertain;
  const previewLogo = brand.logo ? `data:${brand.logo.type};base64,${brand.logo.data}` : null;
  return <form onSubmit={save} className="mt-6 grid min-w-0 max-w-xl grid-cols-1 gap-4" aria-label="Agency brand">
    <StTextField label="Agency name" required maxLength={120} value={brand.displayName} disabled={disabled} onChange={event => setBrand({ ...brand, displayName: event.target.value })} />
    <StTextField label="Accent color" type="color" required value={brand.accentColor} description={`Selected color: ${brand.accentColor}`} disabled={disabled} onChange={event => setBrand({ ...brand, accentColor: event.target.value })} />
    <StTextField label="Reply-to email" type="email" maxLength={254} value={brand.replyTo ?? ""} disabled={disabled} onChange={event => setBrand({ ...brand, replyTo: event.target.value || null })} />
    <StTextField label="Agency logo" description="PNG, JPEG or WebP · up to 256 KiB" type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} onChange={event => {
      const file = event.target.files?.[0]; if (!file) return;
      if (file.size > 262144 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setStatus("Use a PNG, JPEG or WebP up to 256 KiB."); return; }
      const reader = new FileReader(); logoReader.current = reader; setReadingLogo(true);
      reader.onload = () => { setBrand(current => current ? { ...current, logo: { type: file.type as NonNullable<AgencyBrandInput["logo"]>["type"], data: String(reader.result).split(",")[1]! } } : current); setStatus(""); setReadingLogo(false); };
      reader.onerror = () => { setStatus("The logo could not be read. Choose the file again."); setReadingLogo(false); };
      reader.readAsDataURL(file);
    }} />
    {brand.logo ? <StPill type="button" variant="soft" disabled={disabled} onClick={() => setBrand({ ...brand, logo: null })}>Remove logo</StPill> : null}
    <OwnerBrandIdentity brand={{ agencyId: workspaceId, name: brand.displayName, accentColor: /^#[0-9a-fA-F]{6}$/.test(brand.accentColor) ? brand.accentColor : "#222222", logoUrl: previewLogo, replyTo: brand.replyTo, credit: "runs_on_strelva" }} />
    <p>Owners keep a small Strelva credit. Sending domains stay with Strelva.</p>
    <StPill type="submit" disabled={disabled} busy={busy}>Save brand</StPill>
    {uncertain ? <StTextButton disabled={busy} onClick={readSaved}>Read saved brand</StTextButton> : null}
    {status ? <p role="status">{status}</p> : null}
  </form>;
}
