"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { normalizeTenantDomain } from "@/lib/tenant-urls";
import { websiteDomainRequestSchema, type WebsiteDomainRequest as DomainReceipt } from "@/products/websites/recovery-contracts";
import { beginFocusRecovery, type FocusRecovery } from "./focus-recovery";
import type { RebuildView } from "./rebuild-transport";

async function post(request: typeof fetch, path: string, body: Record<string, unknown>) {
  const response = await request(path, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => null) as { error?: string; receipt?: unknown } | null;
  if (!response.ok) throw new Error(result?.error || "That couldn't be saved. Try again.");
  return result;
}

/** Prepare authority for one hostname before the operator changes its domain. */
interface DomainRequestProps { workId: string; workspaceId?: string; request?: typeof fetch; readOnly?: boolean; disabled?: boolean }
export function WebsiteDomainRequest(props: DomainRequestProps) {
  return <DomainRequestSession key={`${props.workspaceId ?? "work"}:${props.workId}`} {...props} />;
}
function DomainRequestSession({ workId, workspaceId, request = fetch, readOnly = false, disabled = false }: DomainRequestProps) {
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [saved, setSaved] = useState<DomainReceipt | null>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const requestId = useRef(crypto.randomUUID());
  const inFlight = useRef(false);
  const attempt = useRef<{ workId: string; workspaceId?: string; requestId: string; domain: string; hostname: string } | null>(null);
  const scopeRef = useRef<HTMLElement>(null), checkRef = useRef<HTMLButtonElement>(null), receiptRef = useRef<HTMLParagraphElement>(null);
  const domainRef = useRef<HTMLInputElement>(null);
  const focus = useRef<FocusRecovery | null>(null);
  const mounted = useRef(true);
  const permission = useRef({ readOnly, disabled, revision: 0 });
  permission.current = { readOnly, disabled, revision: permission.current.revision + Number(permission.current.readOnly !== readOnly || permission.current.disabled !== disabled) };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; focus.current?.cancel(); }; }, []);
  useEffect(() => { if (!busy) { focus.current?.recover(unknown ? checkRef.current : notice ? receiptRef.current : domainRef.current, true); focus.current = null; } }, [busy, unknown, saved, notice]);

  function receipt(value: unknown, command: NonNullable<typeof attempt.current>) {
    const parsed = websiteDomainRequestSchema.safeParse(value);
    if (!parsed.success || parsed.data.id !== command.requestId || parsed.data.workId !== command.workId || (command.workspaceId && parsed.data.workspaceId !== command.workspaceId) || parsed.data.hostname !== command.hostname) throw new Error("The saved domain request could not be confirmed.");
    return parsed.data;
  }
  async function submit(check = false) {
    if (inFlight.current || (!check && (attempt.current || readOnly || disabled || !domain.trim()))) return;
    const command = check ? attempt.current : { workId, workspaceId, requestId: requestId.current, domain: domain.trim(), hostname: normalizeTenantDomain(domain.trim())?.replace(/:\d+$/, "") ?? domain.trim().toLowerCase() };
    if (!command) return;
    const wasUnknown = unknown, started = permission.current.revision;
    attempt.current = command; inFlight.current = true;
    focus.current?.cancel(); focus.current = beginFocusRecovery(scopeRef.current);
    setBusy(true); setNotice(null);
    try {
      const path = `/api/websites/${encodeURIComponent(command.workId)}/domain/request`;
      const response = await request(check ? `${path}?${new URLSearchParams({ requestId: command.requestId, ...(command.workspaceId ? { workspaceId: command.workspaceId } : {}) })}` : path, check ? { method: "GET", credentials: "same-origin", cache: "no-store" } : { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: command.requestId, domain: command.domain }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const reason = typeof body?.error === "string" ? body.error : "The saved domain request could not be checked.";
        if (!check && !wasUnknown && (response.status === 401 || response.status === 409 && reason === "Enter a valid domain you control.")) {
          attempt.current = null; throw Object.assign(new Error(reason), { refused: true });
        }
        throw new Error(reason);
      }
      if (check && !body?.request) throw new Error("No matching saved request was found. This does not confirm whether the earlier request was saved.");
      const next = receipt(check ? body.request : body, command);
      if (!mounted.current) return;
      if (permission.current.revision !== started) throw new Error("Your access changed while this domain request was being checked.");
      setSaved(next); setUnknown(false);
      setNotice({ error: false, text: next.decisionId ? "Saved domain request found. The owner has already decided this request." : !next.current || Date.parse(next.expiresAt) <= Date.now() ? "Saved domain request found. This request is no longer current." : "Domain request saved for the owner. Domain setup waits for their approval." });
    } catch (cause) {
      if (!mounted.current) return;
      const refused = cause instanceof Error && "refused" in cause;
      if (!refused) setUnknown(true);
      setNotice({ error: true, text: `${cause instanceof Error ? cause.message : "The domain request could not be confirmed."}${refused ? "" : " Check this exact saved request before preparing another."}` });
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  return <section ref={scopeRef} className="grid gap-3" aria-label="Owner domain request" aria-busy={busy || undefined}>
    <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <TextInput ref={domainRef} label="Domain to request" placeholder="your-business.com" value={domain} disabled={busy || readOnly || disabled} readOnly={unknown || Boolean(saved)} onChange={event => { if (inFlight.current || attempt.current || readOnly || disabled) return; setDomain(event.target.value); requestId.current = crypto.randomUUID(); setNotice(null); }} />
      <Button type="submit" variant="secondary" loading={busy} disabled={busy || readOnly || disabled || unknown || Boolean(saved) || !domain.trim()} className="justify-self-start">Ask owner to approve domain</Button>
    </form>
    {unknown ? <Button ref={checkRef} type="button" variant="secondary" disabled={busy} loading={busy} onClick={() => void submit(true)} className="justify-self-start">Check saved domain request</Button> : null}
    {notice ? <p ref={receiptRef} tabIndex={-1} role={notice.error ? "alert" : "status"} className="text-sm text-gray-muted">{notice.text}</p> : null}
    {saved ? <Button type="button" variant="secondary" disabled={busy || readOnly || disabled} className="justify-self-start" onClick={() => { if (inFlight.current || readOnly || disabled) return; focus.current?.cancel(); focus.current = beginFocusRecovery(scopeRef.current); attempt.current = null; requestId.current = crypto.randomUUID(); setSaved(null); setNotice(null); }}>Prepare another domain request</Button> : null}
  </section>;
}

/** A person restores DNS and attests that they tested the fallback before undo resets routing. */
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
    <p className="text-sm text-gray-muted">Restore the domain&rsquo;s previous DNS records and test the old project first. After you confirm both steps, Strelva switches its routing back. Your saved rebuild and history stay available.</p>
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
