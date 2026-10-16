"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { WorkspaceDialog, WorkspaceDialogActions, WorkspaceDialogTitle } from "@/experience/workspace/WorkspaceDialog";
import { XaAnswers, XaButton, XaField, XaWorking } from "@/components/ui/strelva/Xa";
import dialogStyles from "@/experience/workspace/workspace-dialog.module.css";
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
      if (!response.ok || typeof location !== "string" || !location.startsWith("/workspace/getting-started?")) throw new Error(errorText(body, "Your business couldn't be started. Try again; retrying won't create a second one."));
      window.location.assign(location);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your business couldn't be started. Try again.");
      inFlight.current = false; setStarting(false);
    }
  }

  const busy = starting || savingHere;
  return <WorkspaceDialog labelledBy="start-business-title" busy={busy} onClose={onClose}>
    <WorkspaceDialogTitle id="start-business-title" quiet="Nothing changes on your site and nothing is sent.">Start your business from this check?</WorkspaceDialogTitle>
    {loading ? <XaWorking title="Opening your check" steps={[]} />
      : loadError ? <>
        <p role="alert" className={dialogStyles.error}>{loadError}</p>
        <WorkspaceDialogActions>
          <XaButton variant="quiet" onClick={onClose} disabled={busy}>Back</XaButton>
          <XaButton variant="primary" busy={savingHere} onClick={onSaveHere}>Save to {workspaceName} instead</XaButton>
        </WorkspaceDialogActions>
      </>
      : <form className={dialogStyles.form} onSubmit={event => void start(event)} aria-describedby="start-business-note">
        <p id="start-business-note">Your business starts with this result saved in it{preview?.website ? ", and this site as its website" : ""}.</p>
        <XaField ref={nameRef} label="Business name" value={name} maxLength={120} required disabled={busy} autoComplete="organization" onChange={event => { setName(event.target.value); setError(""); }} error={error && !name.trim() ? error : undefined} />
        {preview?.website ? <XaAnswers rows={[["Website", <span key="w" className={dialogStyles.breakAll}>{preview.website}</span>]]} /> : <p>This check didn&rsquo;t include a website. You can add one next.</p>}
        {error && name.trim() ? <p role="alert" className={dialogStyles.error}>{error}</p> : null}
        {saveHereError ? <p role="alert" className={dialogStyles.error}>{saveHereError}</p> : null}
        <WorkspaceDialogActions>
          <XaButton variant="quiet" busy={savingHere} disabled={starting} onClick={onSaveHere}>Save to {workspaceName} instead</XaButton>
          <XaButton variant="primary" type="submit" busy={starting} disabled={savingHere}>Start my business</XaButton>
        </WorkspaceDialogActions>
      </form>}
  </WorkspaceDialog>;
}
