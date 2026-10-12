"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { StNotice, StPill, StTextButton, StTextField } from "@/components/ui/strelva/Kit";
import { WorkspaceDialog } from "@/experience/workspace/WorkspaceDialog";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";

type Preview = { name: string | null; suggestedName: string | null; website: string | null; kind: "ai_visibility" | "website_audit" };

function errorText(body: unknown, fallback: string): string {
  return body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : fallback;
}

/**
 * "Start with this fix" on the owner door: the check becomes the business.
 * The name and website come from the check; the owner can change the name.
 * Saving the result into the current workspace stays available as before.
 */
export function StartBusinessFromCheck({ resultId, workspaceName, savingHere, saveHereError, onSaveHere, onClose }: {
  resultId: string; workspaceName: string; savingHere: boolean; saveHereError: string; onSaveHere: () => void; onClose: () => void;
}) {
  const transport = useWorkspaceRequest();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  // The dialog opens on a loading line; once the check is read, focus the one field.
  useEffect(() => { if (preview) nameRef.current?.focus(); }, [preview]);

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setLoadError("");
    transport(`/api/workspace/getting-started?check=${encodeURIComponent(resultId)}`, { cache: "no-store", signal: abort.signal })
      .then(async response => {
        const body: unknown = await response.json().catch(() => null);
        if (abort.signal.aborted) return;
        if (!response.ok) throw new Error(errorText(body, "This check couldn't be opened."));
        const check = (body as { check?: Preview } | null)?.check;
        if (!check) throw new Error("This check couldn't be opened.");
        setPreview(check);
        setName(check.suggestedName || "");
      })
      .catch(cause => { if (!abort.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "This check couldn't be opened."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [transport, resultId]);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || savingHere) return;
    if (!name.trim()) { setError("Enter your business name."); return; }
    inFlight.current = true; setStarting(true); setError("");
    try {
      const response = await transport("/api/workspace/getting-started", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start_from_check", resultId, name: name.trim() }) });
      const body: unknown = await response.json().catch(() => null);
      const location = (body as { location?: unknown } | null)?.location;
      if (!response.ok || typeof location !== "string" || !location.startsWith("/workspace/getting-started?")) throw new Error(errorText(body, "Your business couldn't be started. Nothing new was created; try again."));
      window.location.assign(location);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your business couldn't be started. Try again.");
      inFlight.current = false; setStarting(false);
    }
  }

  const busy = starting || savingHere;
  return <WorkspaceDialog labelledBy="start-business-title" busy={busy} onClose={onClose}>
    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent-text">Getting started</p>
    <h1 id="start-business-title" className="mt-3 font-display text-[28px] font-medium leading-tight text-warm-black">Start your business from this check</h1>
    {loading ? <p role="status" className="mt-5 text-[14px] text-gray-muted">Opening your check…</p>
      : loadError ? <div className="mt-5 flex flex-col gap-4"><StNotice tone="critical">{loadError}</StNotice><div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><StTextButton onClick={onClose} disabled={busy}>Back</StTextButton><StPill variant="soft" busy={savingHere} onClick={onSaveHere}>Save to {workspaceName} instead</StPill></div></div>
      : <form className="mt-5 flex flex-col gap-4" onSubmit={event => void start(event)} aria-describedby="start-business-note">
        <p id="start-business-note" className="text-[14px] leading-relaxed text-gray-muted">We&rsquo;ll set up your business with this result saved in it{preview?.website ? " and this as its website" : ""}. Nothing changes on your site and nothing is sent.</p>
        <StTextField ref={nameRef} label="Business name" value={name} maxLength={120} required disabled={busy} autoComplete="organization" onChange={event => { setName(event.target.value); setError(""); }} error={error && !name.trim() ? error : undefined} />
        {preview?.website ? <p className="rounded-xl border border-gray-border bg-surface-inset px-4 py-3 text-[13px] text-gray-fg"><span className="font-medium text-warm-black">Website:</span> <span className="break-all">{preview.website}</span></p> : <p className="text-[13px] text-gray-muted">This check didn&rsquo;t include a website. You can add one next.</p>}
        {error && name.trim() ? <StNotice tone="critical">{error}</StNotice> : null}
        {saveHereError ? <StNotice tone="critical">{saveHereError}</StNotice> : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <StTextButton onClick={onClose} disabled={busy}>Back</StTextButton>
          <StPill variant="soft" busy={savingHere} disabled={starting} onClick={onSaveHere}>Save to {workspaceName} instead</StPill>
          <StPill type="submit" busy={starting} disabled={savingHere}>Start my business</StPill>
        </div>
      </form>}
  </WorkspaceDialog>;
}
