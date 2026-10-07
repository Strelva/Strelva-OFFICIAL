"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import type { RebuildView } from "./rebuild-transport";

async function post(request: typeof fetch, path: string, body: Record<string, unknown>) {
  const response = await request(path, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => null) as { error?: string; receipt?: unknown } | null;
  if (!response.ok) throw new Error(result?.error || "That couldn't be saved. Try again.");
  return result;
}

/** Prepare authority for one hostname before the operator changes its domain. */
export function WebsiteDomainRequest({ workId, request = fetch }: { workId: string; request?: typeof fetch }) {
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const requestId = useRef(crypto.randomUUID());
  return <form className="grid gap-3" onSubmit={async event => {
    event.preventDefault();
    if (busy || !domain.trim()) return;
    setBusy(true); setNotice(null);
    try {
      await post(request, `/api/websites/${encodeURIComponent(workId)}/domain/request`, { requestId: requestId.current, domain: domain.trim() });
      setNotice({ error: false, text: "Domain request saved for the owner. Domain setup waits for their approval." });
    } catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : "The domain request couldn't be saved." }); }
    finally { setBusy(false); }
  }}>
    <TextInput label="Domain to request" placeholder="your-business.com" value={domain} disabled={busy} onChange={event => { setDomain(event.target.value); requestId.current = crypto.randomUUID(); setNotice(null); }} />
    <Button type="submit" variant="secondary" loading={busy} disabled={busy || !domain.trim()} className="justify-self-start">Ask owner to approve domain</Button>
    {notice ? <p role={notice.error ? "alert" : "status"} className="text-sm text-gray-muted">{notice.text}</p> : null}
  </form>;
}

/** DNS is restored by a person; undo verifies the fallback before resetting routing. */
export function WebsiteCutoverUndo({ record, request = fetch }: { record: RebuildView; request?: typeof fetch }) {
  const [domainRestored, setDomainRestored] = useState(false);
  const [fallbackVerified, setFallbackVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const commandId = useRef(crypto.randomUUID());
  if (!record.tenantId || !record.candidate || !record.publishedUrl) return null;
  return <section className="mt-6 grid gap-3" aria-labelledby="cutover-undo-heading">
    <h3 id="cutover-undo-heading" className="text-base font-medium">Return to the previous website</h3>
    <p className="text-sm text-gray-muted">Restore the domain&rsquo;s previous DNS records and test the old project first. Strelva checks that fallback before switching its routing back. Your saved rebuild and history stay available.</p>
    {done ? <p role="status" className="text-sm">The previous website was restored. The undo receipt is saved in history.</p> : <form className="grid gap-3" onSubmit={async event => {
      event.preventDefault();
      if (busy || !domainRestored || !fallbackVerified) return;
      setBusy(true); setError("");
      try {
        const result = await post(request, `/api/websites/${encodeURIComponent(record.workId)}/cutover-undo`, { tenantId: record.tenantId, candidateRevision: record.candidate!.revision, candidateContentHash: record.candidate!.contentHash, commandId: commandId.current, domainRestored: true, fallbackVerified: true });
        if (!result?.receipt) throw new Error("The undo result could not be confirmed. Reopen this saved website before retrying.");
        setDone(true);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "The previous website couldn't be restored."); }
      finally { setBusy(false); }
    }}>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={domainRestored} disabled={busy} onChange={event => setDomainRestored(event.target.checked)} />I restored the domain&rsquo;s previous DNS records.</label>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={fallbackVerified} disabled={busy} onChange={event => setFallbackVerified(event.target.checked)} />I opened and tested the previous website.</label>
      <Button type="submit" variant="secondary" disabled={busy || !domainRestored || !fallbackVerified} loading={busy} className="justify-self-start">Restore previous website</Button>
      {error ? <p role="alert" className="text-sm text-critical">{error}</p> : null}
    </form>}
  </section>;
}
