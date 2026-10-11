"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";

/** Tenant-bound native lead capture for hosted sites without a published inquiry grant. */
export function SiteLeadForm({ tenant }: { tenant: string }) {
  const id = useId();
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  // SSR contains no submit listener. Keep both click and implicit keyboard
  // submission inactive until React owns this form.
  useEffect(() => { setReady(true); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || pending) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setPending(true); setResult(null);
    try {
      const response = await fetch(`/api/v1/leads/${encodeURIComponent(tenant)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: fields.get("name"), email: fields.get("email"), message: fields.get("message"), website: fields.get("website"), source: "hosted-site" }) });
      const payload: unknown = await response.json();
      if (!response.ok || !payload || typeof payload !== "object" || !("ok" in payload) || payload.ok !== true) throw new Error(payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : "Your request was not confirmed. Please try again.");
      setResult({ ok: true, text: "Your request has been received." }); form.reset();
    } catch (error) { setResult({ ok: false, text: error instanceof Error ? error.message : "Your request was not confirmed. Please try again." }); }
    finally { setPending(false); }
  }
  return <form method="post" onSubmit={event => void submit(event)} aria-label="Send an inquiry">
    <fieldset disabled={!ready || pending}>
      <label htmlFor={`${id}-name`}>Name</label><input id={`${id}-name`} name="name" autoComplete="name" required maxLength={200} />
      <label htmlFor={`${id}-email`}>Email</label><input id={`${id}-email`} name="email" type="email" autoComplete="email" required maxLength={320} />
      <label htmlFor={`${id}-message`}>Message</label><textarea id={`${id}-message`} name="message" required maxLength={5000} rows={5} />
      <div hidden><label htmlFor={`${id}-website`}>Leave this field empty</label><input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" /></div>
      <Button type="submit" disabled={!ready} loading={pending}>{pending ? "Sending…" : "Send request"}</Button>
    </fieldset>
    <p className="site-preview-note">Strelva helps this business handle your request.</p>
    {!ready && <p role="status">Loading inquiry form…</p>}
    {result && <p role={result.ok ? "status" : "alert"}>{result.text}</p>}
  </form>;
}
