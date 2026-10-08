"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { OwnerBrandIdentity } from "@/components/brand/OwnerBrandIdentity";
import { STRELVA_BRAND, type AgencyBrandInput } from "@/platform/infra/agency-brand";

export function AgencyBrandEditor({ workspaceId }: { workspaceId: string }) {
  const [brand, setBrand] = useState<AgencyBrandInput | null>(null);
  const [status, setStatus] = useState("Loading your brand…");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/workspace/agency-brand?workspaceId=${encodeURIComponent(workspaceId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async res => { const body = await res.json(); if (!res.ok) throw new Error(body.error); setBrand(body.brand); setStatus(""); })
      .catch(error => { if (!controller.signal.aborted) setStatus(error.message || "Your brand is unavailable. Reload to try again."); });
    return () => controller.abort();
  }, [workspaceId]);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setStatus("");
    try {
      const res = await fetch("/api/workspace/agency-brand", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, brand }) });
      const body = await res.json(); if (!res.ok) throw new Error(body.error); setBrand(body.brand); setStatus("Brand saved. Owners see it on new emails, reports and pages.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Brand could not be saved. Your changes remain here."); }
    finally { setBusy(false); }
  }
  if (!brand) return <p role="status">{status}</p>;
  const previewLogo = brand.logo ? `data:${brand.logo.type};base64,${brand.logo.data}` : null;
  return <form onSubmit={save} className="mt-6 grid min-w-0 max-w-xl grid-cols-1 gap-4" aria-label="Agency brand">
    <label className="grid min-w-0 gap-2">Agency name<TextInput required maxLength={120} value={brand.displayName} disabled={busy} onChange={event => setBrand({ ...brand, displayName: event.target.value })} /></label>
    <label className="grid min-w-0 gap-2">Accent color<TextInput required pattern="#[0-9a-fA-F]{6}" value={brand.accentColor} disabled={busy} onChange={event => setBrand({ ...brand, accentColor: event.target.value })} /></label>
    <label className="grid min-w-0 gap-2">Reply-to email<TextInput type="email" maxLength={254} value={brand.replyTo ?? ""} disabled={busy} onChange={event => setBrand({ ...brand, replyTo: event.target.value || null })} /></label>
    <label className="grid min-w-0 gap-2">Logo · PNG, JPEG or WebP · up to 256 KiB<input className="min-w-0 w-full text-[14px]" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={async event => {
      const file = event.target.files?.[0]; if (!file) return;
      if (file.size > 262144 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setStatus("Use a PNG, JPEG or WebP up to 256 KiB."); return; }
      const reader = new FileReader(); reader.onload = () => { setBrand({ ...brand, logo: { type: file.type as NonNullable<AgencyBrandInput["logo"]>["type"], data: String(reader.result).split(",")[1]! } }); setStatus(""); }; reader.readAsDataURL(file);
    }} /></label>
    {brand.logo ? <Button type="button" variant="secondary" disabled={busy} onClick={() => setBrand({ ...brand, logo: null })}>Remove logo</Button> : null}
    <OwnerBrandIdentity brand={{ ...STRELVA_BRAND, agencyId: workspaceId, name: brand.displayName, accentColor: /^#[0-9a-fA-F]{6}$/.test(brand.accentColor) ? brand.accentColor : STRELVA_BRAND.accentColor, logoUrl: previewLogo, replyTo: brand.replyTo }} />
    <p>Owners keep a small Strelva credit. Sending domains stay with Strelva.</p>
    <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save brand"}</Button>
    {status ? <p role="status">{status}</p> : null}
  </form>;
}
