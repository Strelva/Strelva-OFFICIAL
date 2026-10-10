"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { normalizeTenantDomain } from "@/platform/infra/domain-normalization";
import { websiteDomainRequestSchema, websiteCutoverUndoReceiptSchema, type WebsiteDomainRequest as DomainReceipt, type WebsiteCutoverUndoReceipt } from "@/products/websites/client";
import { beginFocusRecovery, type FocusRecovery } from "./focus-recovery";
import { useWebsiteAttempt } from "./website-attempt";
import type { RebuildView } from "./rebuild-transport";

/** Prepare authority for one hostname before the operator changes its domain. */
interface DomainRequestProps { workId: string; workspaceId?: string; request?: typeof fetch; readOnly?: boolean; disabled?: boolean; canPrepare?: () => boolean; onBlockedChange?: (blocked: boolean) => void }
export function WebsiteDomainRequest(props: DomainRequestProps) {
  return <DomainRequestSession key={`${props.workspaceId ?? "work"}:${props.workId}`} {...props} />;
}
function DomainRequestSession({ workId, workspaceId, request = fetch, readOnly = false, disabled = false, canPrepare, onBlockedChange }: DomainRequestProps) {
  const [domain, setDomain] = useState("");
  const [saved, setSaved] = useState<DomainReceipt | null>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const requestId = useRef(crypto.randomUUID());
  const websiteAttempt = useWebsiteAttempt<{ workId: string; workspaceId?: string; requestId: string; domain: string; hostname: string }>(`${readOnly}:${disabled}`);
  const { busy, needsReload: unknown, inFlight, command: attempt, mounted } = websiteAttempt;
  const scopeRef = useRef<HTMLElement>(null), checkRef = useRef<HTMLButtonElement>(null), receiptRef = useRef<HTMLParagraphElement>(null);
  const domainRef = useRef<HTMLInputElement>(null);
  const focus = useRef<FocusRecovery | null>(null);
  useEffect(() => () => focus.current?.cancel(), []);
  useEffect(() => { if (!busy) { focus.current?.recover(unknown ? checkRef.current : notice ? receiptRef.current : domainRef.current, true); focus.current = null; } }, [busy, unknown, saved, notice]);

  function receipt(value: unknown, command: NonNullable<typeof attempt.current>) {
    const parsed = websiteDomainRequestSchema.safeParse(value);
    if (!parsed.success || parsed.data.id !== command.requestId || parsed.data.workId !== command.workId || (command.workspaceId && parsed.data.workspaceId !== command.workspaceId) || parsed.data.hostname !== command.hostname) throw new Error("The saved domain request could not be confirmed.");
    return parsed.data;
  }
  async function submit(check = false) {
    if (inFlight.current || (!check && (attempt.current || readOnly || disabled || !domain.trim() || canPrepare?.() === false))) return;
    const command = check ? attempt.current : { workId, workspaceId, requestId: requestId.current, domain: domain.trim(), hostname: normalizeTenantDomain(domain.trim())?.replace(/:\d+$/, "") ?? domain.trim().toLowerCase() };
    if (!command) return;
    const ticket = websiteAttempt.begin(true, check, command);
    if (!ticket) return;
    onBlockedChange?.(true);
    focus.current?.cancel(); focus.current = beginFocusRecovery(scopeRef.current);
    setNotice(null);
    try {
      const path = `/api/websites/${encodeURIComponent(command.workId)}/domain/request`;
      const response = await request(check ? `${path}?${new URLSearchParams({ requestId: command.requestId, ...(command.workspaceId ? { workspaceId: command.workspaceId } : {}) })}` : path, check ? { method: "GET", credentials: "same-origin", cache: "no-store" } : { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: command.requestId, domain: command.domain }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const reason = typeof body?.error === "string" ? body.error : "The saved domain request could not be checked.";
        if (!check && (response.status === 401 || response.status === 409 && reason === "Enter a valid domain you control.") && websiteAttempt.refuse(ticket)) {
          throw Object.assign(new Error(reason), { refused: true });
        }
        throw new Error(reason);
      }
      if (check && !body?.request) throw new Error("No matching saved request was found. This does not confirm whether the earlier request was saved.");
      const next = receipt(check ? body.request : body, command);
      if (!websiteAttempt.accept(ticket)) return;
      setSaved(next); onBlockedChange?.(false);
      setNotice({ error: false, text: next.decisionId ? "Saved domain request found. The owner has already decided this request." : !next.current || Date.parse(next.expiresAt) <= Date.now() ? "Saved domain request found. This request is no longer current." : "Domain request saved for the owner. Domain setup waits for their approval." });
    } catch (cause) {
      if (!mounted.current) return;
      const refused = cause instanceof Error && "refused" in cause;
      if (!refused) websiteAttempt.requireReload(true); else onBlockedChange?.(false);
      setNotice({ error: true, text: `${cause instanceof Error ? cause.message : "The domain request could not be confirmed."}${refused ? "" : " Check this exact saved request before preparing another."}` });
    } finally { websiteAttempt.finish(); }
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

/** A person restores DNS and tests the fallback before this exact routing command. */
interface CutoverUndoProps { record: RebuildView; request?: typeof fetch; readOnly?: boolean; disabled?: boolean; available?: boolean; canSubmit?: () => boolean; onBlockedChange?: (blocked: boolean) => void; onRestored?: (receipt: WebsiteCutoverUndoReceipt) => void }
export function WebsiteCutoverUndo(props: CutoverUndoProps) {
  return <CutoverUndoSession key={`${props.record.workspaceId}:${props.record.workId}`} {...props} />;
}
function CutoverUndoSession({ record, request = fetch, readOnly = false, disabled = false, available = true, canSubmit, onBlockedChange, onRestored }: CutoverUndoProps) {
  const [domainRestored, setDomainRestored] = useState(false);
  const [fallbackVerified, setFallbackVerified] = useState(false);
  const [saved, setSaved] = useState<WebsiteCutoverUndoReceipt | null>(null);
  const [error, setError] = useState("");
  const websiteAttempt = useWebsiteAttempt<{ workId: string; body: { workspaceId: string; tenantId: string; candidateRevision: number; candidateContentHash: string; commandId: string; domainRestored: true; fallbackVerified: true } }>(`${readOnly}:${disabled}:${available}`);
  const { busy, needsReload: unknown, inFlight, command: attempt, mounted } = websiteAttempt;
  const scopeRef = useRef<HTMLElement>(null), checkRef = useRef<HTMLButtonElement>(null), receiptRef = useRef<HTMLParagraphElement>(null);
  const focus = useRef<FocusRecovery | null>(null);
  useEffect(() => () => focus.current?.cancel(), []);
  useEffect(() => { if (!busy) { focus.current?.recover(unknown ? checkRef.current : receiptRef.current, true); focus.current = null; } }, [busy, unknown, saved, error]);
  const eligible = Boolean(available && record.tenantId && record.candidate && record.publishedUrl);
  if (!eligible && !attempt.current && !saved) return null;
  async function submit(check = false) {
    if (inFlight.current || readOnly || disabled || saved || canSubmit?.() === false || (!check && (attempt.current || !eligible || !domainRestored || !fallbackVerified))) return;
    const command = check ? attempt.current : { workId: record.workId, body: { workspaceId: record.workspaceId, tenantId: record.tenantId!, candidateRevision: record.candidate!.revision, candidateContentHash: record.candidate!.contentHash, commandId: crypto.randomUUID(), domainRestored: true as const, fallbackVerified: true as const } };
    if (!command) return;
    const ticket = websiteAttempt.begin(true, check, command);
    if (!ticket) return;
    onBlockedChange?.(true);
    focus.current?.cancel(); focus.current = beginFocusRecovery(scopeRef.current);
    setError("");
    try {
      const response = await request(`/api/websites/${encodeURIComponent(command.workId)}/cutover-undo`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command.body) });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const reason = typeof result?.error === "string" ? result.error : "The undo result could not be confirmed.";
        // Only the initial route authentication refusal proves the command was not invoked.
        if (response.status === 401 && websiteAttempt.refuse(ticket)) { throw Object.assign(new Error(reason), { refused: true }); }
        throw new Error(reason);
      }
      const parsed = websiteCutoverUndoReceiptSchema.safeParse(result?.receipt);
      if (!parsed.success || parsed.data.receiptId !== command.body.commandId || parsed.data.workId !== command.workId || parsed.data.tenantId !== command.body.tenantId || parsed.data.revision !== command.body.candidateRevision || parsed.data.contentHash !== command.body.candidateContentHash) throw new Error("The undo result could not be confirmed.");
      if (!websiteAttempt.accept(ticket)) return;
      setSaved(parsed.data); if (onRestored) onRestored(parsed.data); else onBlockedChange?.(false);
    } catch (cause) {
      if (!mounted.current) return;
      const refused = cause instanceof Error && "refused" in cause;
      if (!refused) websiteAttempt.requireReload(true); else onBlockedChange?.(false);
      setError(`${cause instanceof Error ? cause.message : "The previous website result could not be confirmed."}${refused ? "" : " Check this exact undo command before starting another."}`);
    } finally { websiteAttempt.finish(); }
  }
  return <section ref={scopeRef} className="mt-6 grid gap-3" aria-labelledby="cutover-undo-heading" aria-busy={busy || undefined}>
    <h3 id="cutover-undo-heading" className="text-base font-medium">Return to the previous website</h3>
    <p className="text-sm text-gray-muted">Restore the domain&rsquo;s previous DNS records and test the old project first. After you confirm both steps, Strelva switches its routing back. Your saved rebuild and history stay available.</p>
    {saved ? <p ref={receiptRef} tabIndex={-1} role="status" className="text-sm">The previous website was restored. The undo receipt for website version {saved.revision} is saved.</p> : <>
      <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={domainRestored} disabled={busy || unknown || readOnly || disabled} onChange={event => { if (inFlight.current || attempt.current || readOnly || disabled) return; setDomainRestored(event.target.checked); }} />I restored the domain&rsquo;s previous DNS records.</label>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={fallbackVerified} disabled={busy || unknown || readOnly || disabled} onChange={event => { if (inFlight.current || attempt.current || readOnly || disabled) return; setFallbackVerified(event.target.checked); }} />I opened and tested the previous website.</label>
        <Button type="submit" variant="secondary" disabled={busy || unknown || readOnly || disabled || !eligible || !domainRestored || !fallbackVerified} loading={busy} className="justify-self-start">Restore previous website</Button>
      </form>
      {unknown ? <Button ref={checkRef} type="button" variant="secondary" disabled={busy || readOnly || disabled} loading={busy} onClick={() => void submit(true)} className="justify-self-start">Check this undo command</Button> : null}
      {unknown ? <p className="text-sm text-gray-muted">This checks the captured undo command with your current access. If already saved, it returns the receipt. Otherwise, it finishes the same routing undo; no new command is created. Strelva does not restore DNS here.</p> : null}
      {error ? <p ref={receiptRef} tabIndex={-1} role="alert" className="text-sm text-critical">{error}</p> : null}
    </>}
  </section>;
}
